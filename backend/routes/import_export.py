from __future__ import annotations

import csv
import io
import re
import unicodedata
from collections import defaultdict
from datetime import date
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from database import get_supabase_client

router = APIRouter(
    prefix="/api/logs",
    tags=["import-export"],
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Matches lines that start with a date: 2025/11/01 (the rest of the line is
# ignored so "2025/11/01 : Saturday" is correctly treated as a date header).
_DATE_RE = re.compile(r"^(\d{4})[/\-](\d{2})[/\-](\d{2})")

# Strips every invisible / zero-width unicode character from a string.
_INVISIBLE = re.compile(
    r"[\u200b\u200c\u200d\u200e\u200f\u00ad\ufeff\u2060\u180e\u00a0]"
)


def _clean(text: str) -> str:
    """Remove invisible unicode chars, then strip whitespace."""
    return _INVISIBLE.sub("", text).strip()


def _parse_price(price_str: str) -> float:
    """
    Extract the first integer or decimal number from a price token.
    Examples:  "70(L)"  → 70.0
               "100 (L)" → 100.0
               "12.50"   → 12.5
               ""        → 0.0
    """
    match = re.search(r"\d+(?:\.\d+)?", price_str)
    return float(match.group()) if match else 0.0


def _parse_raw_text(raw_text: str) -> dict[str, list[dict[str, Any]]]:
    """
    Parse the plain-text diary format into a mapping of ISO date → meal items.

    Supported date header formats (rest of line ignored):
        2025/11/01 : Saturday
        2025-11-01
        2025/11/01

    Item lines (must contain exactly one colon and NOT match the date pattern):
        ‌Mini thali : 70(L)
        Rajma + Jeera rice : 100(L)

    Lines that are blank or yield no parseable item are silently skipped.
    """
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    current_date: str | None = None

    for raw_line in raw_text.splitlines():
        line = _clean(raw_line)
        if not line:
            continue

        # ── Date header? ────────────────────────────────────────────────────
        date_match = _DATE_RE.match(line)
        if date_match:
            y, m, d = date_match.group(1), date_match.group(2), date_match.group(3)
            try:
                current_date = date(int(y), int(m), int(d)).isoformat()
            except ValueError:
                pass  # malformed date – ignore
            continue

        # ── Item line? ───────────────────────────────────────────────────────
        if ":" not in line or current_date is None:
            continue

        # Split on the LAST colon so item names with colons are preserved
        parts = line.rsplit(":", 1)
        if len(parts) != 2:
            continue

        item_name = _clean(parts[0])
        price = _parse_price(_clean(parts[1]))

        if not item_name:
            continue

        result[current_date].append({"item_name": item_name, "price": price})

    return dict(result)


# ---------------------------------------------------------------------------
# POST /api/logs/bulk-import
# ---------------------------------------------------------------------------

class BulkImportRequest(BaseModel):
    user_id: UUID
    raw_text: str = Field(..., min_length=1)


@router.post("/bulk-import", response_model=dict[str, Any])
async def bulk_import(payload: BulkImportRequest) -> dict[str, Any]:
    """
    Parse a plain-text diary, group items by date, and upsert into daily_logs.

    Existing meals for a day are preserved; new items are appended and the
    daily total is incremented (identical behaviour to the single /add endpoint).

    Returns the number of days and items successfully imported.
    """
    supabase = get_supabase_client()
    user_id_str = str(payload.user_id)

    parsed = _parse_raw_text(payload.raw_text)
    if not parsed:
        return {"imported_days": 0, "imported_items": 0, "message": "No parseable data found."}

    date_strings = sorted(parsed.keys())

    # ------------------------------------------------------------------
    # 1. Fetch all existing rows for the affected dates in one round-trip
    # ------------------------------------------------------------------
    existing_resp = (
        supabase.table("daily_logs")
        .select("log_date, meals, daily_total_cost")
        .eq("user_id", user_id_str)
        .in_("log_date", date_strings)
        .execute()
    )
    existing_by_date: dict[str, dict] = {
        row["log_date"]: row for row in (existing_resp.data or [])
    }

    # ------------------------------------------------------------------
    # 2. Merge parsed items with any existing data
    # ------------------------------------------------------------------
    upsert_rows: list[dict[str, Any]] = []
    total_items = 0

    for date_str in date_strings:
        new_items = parsed[date_str]
        if not new_items:
            continue

        existing = existing_by_date.get(date_str)
        current_meals: list[dict] = list((existing or {}).get("meals") or [])
        current_total = float((existing or {}).get("daily_total_cost") or 0.0)

        current_meals.extend(new_items)
        added_cost = sum(item["price"] for item in new_items)
        new_total = round(current_total + added_cost, 2)

        upsert_rows.append(
            {
                "user_id": user_id_str,
                "log_date": date_str,
                "meals": current_meals,
                "daily_total_cost": new_total,
            }
        )
        total_items += len(new_items)

    if not upsert_rows:
        return {"imported_days": 0, "imported_items": 0, "message": "No parseable data found."}

    # ------------------------------------------------------------------
    # 3. Bulk upsert — one round-trip for all days
    # ------------------------------------------------------------------
    try:
        supabase.table("daily_logs").upsert(
            upsert_rows, on_conflict="user_id,log_date"
        ).execute()
    except Exception as e:
        # Supabase postgrest-py 204 bug: upsert succeeded but raised on empty body
        if "204" not in str(e) and getattr(e, "code", "") != "204":
            raise

    imported_days = len(upsert_rows)
    return {
        "imported_days": imported_days,
        "imported_items": total_items,
        "message": f"Successfully imported {total_items} item(s) across {imported_days} day(s).",
    }


# ---------------------------------------------------------------------------
# GET /api/logs/export/{user_id}
# ---------------------------------------------------------------------------

@router.get("/export/{user_id}")
async def export_csv(
    user_id: UUID,
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    month: Optional[int] = Query(default=None, ge=1, le=12),
) -> StreamingResponse:
    """
    Export daily_logs as a CSV file.

    Each meal item gets its own row. Optional ?year= and ?month= filters apply.

    CSV columns: date, item_name, price
    """
    supabase = get_supabase_client()
    user_id_str = str(user_id)

    query = (
        supabase.table("daily_logs")
        .select("log_date, meals, daily_total_cost")
        .eq("user_id", user_id_str)
        .order("log_date", desc=False)
    )

    if year is not None:
        query = query.gte("log_date", f"{year}-01-01").lte("log_date", f"{year}-12-31")
    if month is not None and year is not None:
        m = str(month).zfill(2)
        query = query.gte("log_date", f"{year}-{m}-01").lte("log_date", f"{year}-{m}-31")

    rows: list[dict[str, Any]] = (query.execute().data or [])

    # ------------------------------------------------------------------
    # Build CSV in-memory
    # ------------------------------------------------------------------
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["date", "item_name", "price"])

    for row in rows:
        log_date: str = row.get("log_date") or ""
        meals: list[dict] = row.get("meals") or []
        if meals:
            for meal in meals:
                writer.writerow([
                    log_date,
                    meal.get("item_name", ""),
                    meal.get("price", ""),
                ])
        else:
            # Day exists but has no individual meal items — emit a summary row
            writer.writerow([log_date, "(no items)", row.get("daily_total_cost", "")])

    output.seek(0)

    # Build a descriptive filename
    parts = ["optimeal_report"]
    if year:
        parts.append(str(year))
    if month:
        parts.append(str(month).zfill(2))
    filename = "_".join(parts) + ".csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
