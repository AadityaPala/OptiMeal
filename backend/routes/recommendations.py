from __future__ import annotations

import json
import os
from datetime import date
from typing import Any
from uuid import UUID

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, status
from google import genai
from google.genai import types
from pydantic import BaseModel

from database import get_supabase_client

load_dotenv()

# ---------------------------------------------------------------------------
# Gemini client – reads GEMINI_API_KEY automatically from the environment.
# ---------------------------------------------------------------------------
_gemini_client = genai.Client()

MODEL = "gemini-2.5-flash"

# System instruction that tells the model exactly what role it plays and
# what shape the output must take.
SYSTEM_INSTRUCTION = """You are OptiMeal AI, a professional nutrition and budget-planning assistant.

Your job is to recommend the best meal combinations from a restaurant menu that
fit within a user's remaining daily calorie budget, macro targets, and spending limit.

OUTPUT RULES (non-negotiable):
- Return ONLY a raw JSON array – no markdown fences, no extra text, no comments.
- The array must contain EXACTLY 3 meal combination objects.
- Every object in the array must follow this exact schema:
  {
    "meal_name": "string – short, descriptive name for the combination",
    "items_included": ["string – exact item names from the menu"],
    "total_cost": <float – sum of item prices, two decimal places>,
    "total_calories": <integer>,
    "total_protein": <integer – grams>,
    "total_carbs": <integer – grams>,
    "total_fats": <integer – grams>,
    "reasoning": "string – 1-2 sentences explaining why this combination fits the user's goals"
  }
- Do NOT include items that exceed the remaining budget or calorie cap.
- Rank combinations from best to least optimal (index 0 = best fit).
"""

router = APIRouter(
    prefix="/api/recommendations",
    tags=["recommendations"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class RecommendationRequest(BaseModel):
  """
  Request payload for generating menu recommendations.
  """
  user_id: UUID
  menu_id: UUID


class MealRecommendation(BaseModel):
  """Single AI-generated meal combination recommendation."""
  meal_name: str
  items_included: list[str]
  total_cost: float
  total_calories: int
  total_protein: int
  total_carbs: int
  total_fats: int
  reasoning: str


# ---------------------------------------------------------------------------
# Helper: build the user-context block sent to Gemini
# ---------------------------------------------------------------------------

def _build_user_context(profile: dict[str, Any], today_log: dict[str, Any] | None) -> str:
  """Return a compact text block describing what the user still needs today."""

  goal = profile.get("goal", "not specified")
  daily_budget = float(profile.get("daily_budget") or 0)
  calorie_target = int(profile.get("daily_calorie_target") or 0)
  dietary_prefs = profile.get("dietary_prefs") or {}

  spent_today = float((today_log or {}).get("total_spent") or 0)
  calories_today = int((today_log or {}).get("total_calories") or 0)
  protein_today = int((today_log or {}).get("total_protein_g") or 0)

  budget_remaining = max(0.0, daily_budget - spent_today)
  calories_remaining = max(0, calorie_target - calories_today)

  lines = [
      f"Goal: {goal}",
      f"Daily budget: ${daily_budget:.2f}  |  Spent so far: ${spent_today:.2f}  |  Remaining: ${budget_remaining:.2f}",
      f"Daily calorie target: {calorie_target} kcal  |  Consumed: {calories_today} kcal  |  Remaining: {calories_remaining} kcal",
      f"Protein consumed today: {protein_today} g",
  ]

  if dietary_prefs:
      lines.append(f"Dietary preferences / restrictions: {json.dumps(dietary_prefs)}")

  return "\n".join(lines)


def _build_menu_context(menu_items: list[dict[str, Any]]) -> str:
  """Return a compact JSON representation of menu items for the prompt."""
  compact = [
      {
          "name": item.get("item_name"),
          "price": float(item.get("price") or 0),
          "calories": item.get("est_calories"),
          "protein_g": float(item.get("est_protein_g") or 0),
          "carbs_g": float(item.get("est_carbs_g") or 0),
          "fats_g": float(item.get("est_fats_g") or 0),
      }
      for item in menu_items
  ]
  return json.dumps(compact, indent=2)


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post(
    "/generate",
    status_code=status.HTTP_200_OK,
    response_model=dict[str, Any],
)
async def generate_recommendations(payload: RecommendationRequest) -> dict[str, Any]:
  """
  Generate top meal recommendations for a user given a specific menu.

  Flow:
    1. Fetch user profile (budget, calorie target, goal, dietary prefs).
    2. Fetch today's daily log to compute what the user has already consumed.
    3. Fetch the menu items for the requested menu.
    4. Build a structured prompt and call Gemini 2.5 Flash with
       response_mime_type="application/json" to guarantee JSON output.
    5. Parse, validate, and return the recommendations.
  """
  supabase = get_supabase_client()

  # ------------------------------------------------------------------
  # 1. Fetch user profile
  # ------------------------------------------------------------------
  profile_resp = (
      supabase.table("user_profiles")
      .select("*")
      .eq("user_id", str(payload.user_id))
      .maybe_single()
      .execute()
  )
  profile: dict[str, Any] = profile_resp.data or {}

  # ------------------------------------------------------------------
  # 2. Fetch today's daily log (may not exist yet – that's fine)
  # ------------------------------------------------------------------
  today_str = date.today().isoformat()
  today_log: dict[str, Any] | None = None
  try:
      log_resp = (
          supabase.table("daily_logs")
          .select("total_spent, total_calories, total_protein_g")
          .eq("user_id", str(payload.user_id))
          .eq("log_date", today_str)
          .maybe_single()
          .execute()
      )
      today_log = log_resp.data if log_resp is not None else None
  except Exception:
      # If the table doesn't exist yet or any other error, treat as no log.
      today_log = None

  # ------------------------------------------------------------------
  # 3. Fetch menu items
  # ------------------------------------------------------------------
  items_resp = (
      supabase.table("menu_items")
      .select("*")
      .eq("menu_id", str(payload.menu_id))
      .execute()
  )
  menu_items: list[dict[str, Any]] = items_resp.data or []

  if not menu_items:
      raise HTTPException(
          status_code=status.HTTP_404_NOT_FOUND,
          detail=f"No menu items found for menu_id={payload.menu_id}.",
      )

  # ------------------------------------------------------------------
  # 3b. Optionally convert prices based on user's preferred currency
  # ------------------------------------------------------------------
  preferred_currency: str = ((profile.get("preferred_currency") or "USD")).upper()
  try:
      menu_resp = (
          supabase.table("menus")
          .select("original_currency")
          .eq("id", str(payload.menu_id))
          .maybe_single()
          .execute()
      )
      original_currency = ((menu_resp.data or {}).get("original_currency") or "USD").upper()
      if preferred_currency != original_currency:
          rate_url = f"https://open.er-api.com/v6/latest/{original_currency}"
          async with httpx.AsyncClient(timeout=5.0) as client:
              rate_resp = await client.get(rate_url)
              rate_resp.raise_for_status()
              rate = rate_resp.json().get("rates", {}).get(preferred_currency)
          if rate:
              menu_items = [
                  {**item, "price": round(float(item.get("price") or 0) * rate, 2)}
                  for item in menu_items
              ]
  except Exception as exc:
      print(f"[Recommendations] Currency conversion failed, using original prices: {exc}")

  # ------------------------------------------------------------------
  # 4. Build prompt and call Gemini
  # ------------------------------------------------------------------
  user_context = _build_user_context(profile, today_log)
  menu_context = _build_menu_context(menu_items)

  prompt = (
      f"## User Context\n{user_context}\n\n"
      f"## Available Menu Items\n{menu_context}\n\n"
      "Based on the user context above, recommend the best meal combinations "
      "from the menu. Remember to return ONLY a raw JSON array – nothing else."
  )

  try:
      response = _gemini_client.models.generate_content(
          model=MODEL,
          contents=prompt,
          config=types.GenerateContentConfig(
              system_instruction=SYSTEM_INSTRUCTION,
              response_mime_type="application/json",
              temperature=0.3,  # low temperature for consistent, structured output
          ),
      )

      raw_text: str = response.text.strip()

      # Defensively strip any stray markdown fences the model may emit
      # even when response_mime_type is set (edge case observed on free tier).
      if raw_text.startswith("```"):
          raw_text = raw_text.split("```")[1]
          if raw_text.startswith("json"):
              raw_text = raw_text[4:]
          raw_text = raw_text.strip()

      recommendations_data: list[dict[str, Any]] = json.loads(raw_text)

      # Validate each item against the Pydantic schema for type safety.
      recommendations = [MealRecommendation(**item) for item in recommendations_data]

  except json.JSONDecodeError as exc:
      raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail="AI returned an invalid JSON response. Please try again.",
      ) from exc
  except Exception as exc:
      # Covers Gemini rate-limit errors, network failures, quota exhaustion, etc.
      raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail="The AI recommendation service is temporarily unavailable. Please try again.",
      ) from exc

  return {
      "user_id": str(payload.user_id),
      "menu_id": str(payload.menu_id),
      "daily_budget": float(profile.get("daily_budget") or 0),
      "recommendations": [rec.model_dump() for rec in recommendations],
  }