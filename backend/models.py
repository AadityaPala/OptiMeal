from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, validator


class UserProfile(BaseModel):
  """
  Pydantic model for user profile creation/update requests.
  Mirrors the core fields in the user_profiles table.
  """

  user_id: UUID
  age: Optional[int] = Field(default=None, gt=0)
  weight_kg: Optional[Decimal] = Field(default=None, gt=0)
  height_cm: Optional[Decimal] = Field(default=None, gt=0)
  goal: Optional[Literal["weight_loss", "maintenance", "muscle_gain"]] = None
  dietary_prefs: Optional[dict[str, Any]] = None
  daily_budget: Optional[Decimal] = Field(default=None, ge=0)
  daily_calorie_target: Optional[int] = Field(default=None, ge=0)

  @validator("dietary_prefs", pre=True)
  def empty_dict_to_none(cls, v: Any) -> Any:  # noqa: D417
    """
    Normalize empty dietary preferences to None for consistency.
    """
    if isinstance(v, dict) and not v:
      return None
    return v


class MenuItem(BaseModel):
  """
  Pydantic model for menu item creation/update requests.
  Mirrors the core fields in the menu_items table.
  """

  menu_id: UUID
  item_name: str = Field(..., min_length=1)
  price: Decimal = Field(..., ge=0)
  est_calories: Optional[int] = Field(default=None, ge=0)
  est_protein_g: Optional[Decimal] = Field(default=None, ge=0)
  est_carbs_g: Optional[Decimal] = Field(default=None, ge=0)
  est_fats_g: Optional[Decimal] = Field(default=None, ge=0)