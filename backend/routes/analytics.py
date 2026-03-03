from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query
from database import get_supabase_client

router = APIRouter(
    prefix="/api/analytics",
    tags=["analytics"],
)

# Ordered month abbreviations (index 0 = January)
MONTH_LABELS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


# ---------------------------------------------------------------------------
# GET /api/analytics/spending/{user_id}?year={year}
# ---------------------------------------------------------------------------

@router.get(
    "/spending/{user_id}",
    response_model=list[dict[str, Any]],
    summary="Monthly spending aggregation for a given year",
)
async def monthly_spending(
    user_id: UUID,
    year: int = Query(..., ge=2000, le=2100, description="Calendar year, e.g. 2025"),
) -> list[dict[str, Any]]:
    """
    Aggregate `daily_total_cost` by month for the given user and year.

    Returns a Recharts-ready array with all 12 months (zero-filled where
    there are no logs):

        [{"month": "Jan", "spent": 1200.0}, {"month": "Feb", "spent": 0.0}, ...]
    """
    supabase = get_supabase_client()
    user_id_str = str(user_id)

    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"

    resp = (
        supabase.table("daily_logs")
        .select("log_date, daily_total_cost")
        .eq("user_id", user_id_str)
        .gte("log_date", start_date)
        .lte("log_date", end_date)
        .execute()
    )

    rows: list[dict] = resp.data or []

    # Accumulate totals keyed by 1-based month number
    monthly: dict[int, float] = defaultdict(float)
    for row in rows:
        log_date: str = row.get("log_date") or ""
        cost = float(row.get("daily_total_cost") or 0)
        if log_date:
            # "YYYY-MM-DD" → month as int
            month_num = int(log_date[5:7])
            monthly[month_num] += cost

    return [
        {
            "month": MONTH_LABELS[m - 1],
            "spent": round(monthly.get(m, 0.0), 2),
        }
        for m in range(1, 13)
    ]


# ---------------------------------------------------------------------------
# GET /api/analytics/top-items/{user_id}
# ---------------------------------------------------------------------------

@router.get(
    "/top-items/{user_id}",
    response_model=list[dict[str, Any]],
    summary="Top 5 most frequently purchased items in the last 30 days",
)
async def top_items(user_id: UUID) -> list[dict[str, Any]]:
    """
    Parse the `meals` JSONB arrays from the last 30 days of daily_logs and
    return the 5 items with the highest purchase frequency.

    Each element of the response includes:
    - `item_name`  – display name of the meal item
    - `count`      – how many times it was logged
    - `total_spent`– cumulative cost across all occurrences
    """
    supabase = get_supabase_client()
    user_id_str = str(user_id)

    cutoff = (date.today() - timedelta(days=30)).isoformat()

    resp = (
        supabase.table("daily_logs")
        .select("meals")
        .eq("user_id", user_id_str)
        .gte("log_date", cutoff)
        .execute()
    )

    rows: list[dict] = resp.data or []

    freq: dict[str, int] = defaultdict(int)
    total_cost: dict[str, float] = defaultdict(float)

    for row in rows:
        meals: list[dict] = row.get("meals") or []
        for meal in meals:
            name: str = (meal.get("item_name") or "").strip()
            if name:
                freq[name] += 1
                total_cost[name] += float(meal.get("price") or 0)

    # Sort by frequency descending, take top 5
    top_5 = sorted(freq.items(), key=lambda kv: kv[1], reverse=True)[:5]

    return [
        {
            "item_name": name,
            "count": count,
            "total_spent": round(total_cost[name], 2),
        }
        for name, count in top_5
    ]
