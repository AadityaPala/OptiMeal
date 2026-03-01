from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from database import get_supabase_client

router = APIRouter(
    prefix="/api/profile",
    tags=["profile"],
)


class ProfilePayload(BaseModel):
  """
  Request payload for creating or updating a user's profile.

  Note: The underlying `user_profiles` table uses `user_id` as its primary key,
  so this endpoint behaves like an upsert (create or update) based on user_id.
  """

  user_id: UUID = Field(..., description="ID of the user this profile belongs to.")
  age: Optional[int] = Field(default=None, gt=0)
  weight_kg: Optional[Decimal] = Field(default=None, gt=0)
  height_cm: Optional[Decimal] = Field(default=None, gt=0)
  goal: Optional[str] = Field(
      default=None,
      description="High-level goal, e.g. 'weight_loss', 'maintenance', 'muscle_gain'.",
  )
  dietary_prefs: Optional[dict[str, Any]] = Field(
      default=None,
      description="Arbitrary JSON describing dietary preferences/restrictions.",
  )
  daily_budget: Optional[Decimal] = Field(default=None, ge=0)
  preferred_currency: Optional[str] = Field(
      default=None,
      description="ISO 4217 currency code, e.g. 'USD', 'EUR'.",
  )
  # daily_calorie_target is optional and may be computed later; left out for now.


@router.post(
    "",
    status_code=status.HTTP_200_OK,
)
async def upsert_profile(payload: ProfilePayload) -> dict[str, Any]:
  """
  Create or update a user's profile record in Supabase.

  This endpoint writes to the `user_profiles` table, keyed by `user_id`.

  Expected JSON body:
  {
    "user_id": "uuid-string",
    "age": 21,
    "weight_kg": 70.5,
    "height_cm": 175.0,
    "goal": "maintenance",
    "dietary_prefs": {...},
    "daily_budget": 20.0
  }

  Environment variables required:
  - SUPABASE_URL, SUPABASE_KEY (already used by `get_supabase_client`).
  """
  supabase = get_supabase_client()

  row = {
      "user_id": str(payload.user_id),
      "age": payload.age,
      "weight_kg": float(payload.weight_kg) if payload.weight_kg is not None else None,
      "height_cm": float(payload.height_cm) if payload.height_cm is not None else None,
      "goal": payload.goal,
      "dietary_prefs": payload.dietary_prefs,
      "daily_budget": float(payload.daily_budget)
      if payload.daily_budget is not None
      else None,
      "preferred_currency": payload.preferred_currency,
  }

  # Simple debug logging to trace the row being written.
  print("[Profile] Upserting user profile row:", row)

  try:
    # Upsert based on user_id primary key.
    resp = (
        supabase.table("user_profiles")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
  except Exception as exc:  # pragma: no cover - defensive
    print("[Profile] Exception while upserting profile:", exc)
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Failed to persist user profile in the database.",
    ) from exc

  error = getattr(resp, "error", None)
  if error:
    print("[Profile] Supabase error response:", error)
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Failed to upsert user profile: {error}",
    )

  data = getattr(resp, "data", None) or {}
  print("[Profile] Upserted profile row:", data)
  return {"profile": data}

