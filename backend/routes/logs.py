from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from database import get_supabase_client

router = APIRouter(
    prefix="/api/logs",
    tags=["logs"],
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AddMealRequest(BaseModel):
    """Payload for adding a single meal entry to a day's log."""

    user_id: UUID
    log_date: date = Field(..., description="ISO date string, e.g. '2024-12-12'")
    item_name: str = Field(..., min_length=1, max_length=200)
    price: float = Field(..., ge=0)


# ---------------------------------------------------------------------------
# POST /api/logs/add
# ---------------------------------------------------------------------------

@router.post(
    "/add",
    status_code=status.HTTP_200_OK,
    response_model=dict[str, Any],
)
async def add_meal_log(payload: AddMealRequest) -> dict[str, Any]:
    """
    Append a single meal item to the user's daily log for the given date.

    Behaviour:
    - If a log already exists for (user_id, date): appends the new item to
      the `meals` JSONB array and increments `daily_total_cost`.
    - If no log exists yet: inserts a brand-new row.

    The unique constraint on (user_id, log_date) guarantees one row per day.
    """
    supabase = get_supabase_client()
    user_id_str = str(payload.user_id)
    date_str = payload.log_date.isoformat()
    price_float = float(payload.price)
    new_item = {"item_name": payload.item_name, "price": price_float}

    # ------------------------------------------------------------------
    # 1. Fetch existing row for this (user_id, date) — null-safe
    # ------------------------------------------------------------------
    existing_resp = (
        supabase.table("daily_logs")
        .select("meals, daily_total_cost")
        .eq("user_id", user_id_str)
        .eq("log_date", date_str)
        .maybe_single()
        .execute()
    )
    existing_data = getattr(existing_resp, "data", None) if existing_resp else None

    if existing_data:
        current_meals: list[dict] = list(existing_data.get("meals") or [])
        current_total = float(existing_data.get("daily_total_cost") or 0.0)
    else:
        current_meals = []
        current_total = 0.0

    # ------------------------------------------------------------------
    # 2. Append new item and compute updated total
    # ------------------------------------------------------------------
    current_meals.append(new_item)
    new_total = round(current_total + price_float, 2)

    # ------------------------------------------------------------------
    # 3. Upsert (insert or update) into daily_logs
    # ------------------------------------------------------------------
    upsert_payload = {
        "user_id": user_id_str,
        "log_date": date_str,
        "meals": current_meals,
        "daily_total_cost": new_total,
    }
    try:
        upsert_resp = (
            supabase.table("daily_logs")
            .upsert(upsert_payload, on_conflict="user_id,log_date")
            .execute()
        )
        row = upsert_resp.data[0] if (upsert_resp and upsert_resp.data) else {}
    except Exception as e:
        if "204" in str(e) or getattr(e, "code", "") == "204":
            # postgrest-py 204 No Content bug — upsert succeeded, no body returned
            row = upsert_payload
        else:
            raise HTTPException(status_code=500, detail=str(e))

    return {
        "user_id": user_id_str,
        "log_date": date_str,
        "meals": row.get("meals", []),
        "daily_total_cost": float(row.get("daily_total_cost") or 0),
    }


# ---------------------------------------------------------------------------
# GET /api/logs/hierarchy/{user_id}
# ---------------------------------------------------------------------------

@router.get(
    "/hierarchy/{user_id}",
    status_code=status.HTTP_200_OK,
    response_model=dict[str, Any],
)
async def get_log_hierarchy(user_id: UUID) -> dict[str, Any]:
    """
    Return all meal logs for the user organised into a nested hierarchy.

    Response shape:
    {
      "2024": {
        "12": {
          "total_expenditure": 1500.0,
          "days": [
            {"date": "2024-12-01", "meals": [...], "cost": 45.0},
            {"date": "2024-12-12", "meals": [...], "cost": 90.0}
          ]
        },
        "11": { ... }
      },
      "2023": { ... }
    }

    Sorting guarantees:
    - Years:  descending  (newest year first)
    - Months: descending within each year  (December → January)
    - Days:   ascending within each month  (1st → last)
    """
    supabase = get_supabase_client()
    user_id_str = str(user_id)

    # Fetch all logs for this user ordered ascending by date so days inside
    # each month bucket are naturally in chronological order.
    resp = (
        supabase.table("daily_logs")
        .select("log_date, meals, daily_total_cost")
        .eq("user_id", user_id_str)
        .order("log_date", desc=False)
        .execute()
    )
    rows: list[dict[str, Any]] = resp.data or []

    # ------------------------------------------------------------------
    # Build the nested structure in Python
    # ------------------------------------------------------------------
    # Using a plain dict with an inner defaultdict equivalent built manually
    hierarchy: dict[str, dict[str, dict[str, Any]]] = defaultdict(
        lambda: defaultdict(lambda: {"total_expenditure": 0.0, "days": []})
    )

    for row in rows:
        d = date.fromisoformat(row["log_date"])
        year_key = str(d.year)
        month_key = str(d.month)   # e.g. "3", "12" – no zero-padding
        cost = float(row.get("daily_total_cost") or 0)
        meals = row.get("meals") or []

        bucket = hierarchy[year_key][month_key]
        bucket["total_expenditure"] = round(bucket["total_expenditure"] + cost, 2)
        bucket["days"].append(
            {
                "date": row["log_date"],   # "2024-12-12"
                "meals": meals,
                "cost": cost,
            }
        )

    # ------------------------------------------------------------------
    # Convert to regular dicts and apply sorting.
    # Days are already ascending (DB ORDER BY); years and months are sorted here.
    # ------------------------------------------------------------------
    result: dict[str, Any] = {}
    for year in sorted(hierarchy.keys(), reverse=True):       # years descending
        result[year] = {}
        for month in sorted(hierarchy[year].keys(), key=int, reverse=True):  # months descending
            bucket = dict(hierarchy[year][month])
            # days retain their ascending order from the DB query
            result[year][month] = bucket

    return result
