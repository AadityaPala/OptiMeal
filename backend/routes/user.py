from __future__ import annotations

import json
import os
from typing import Any
from uuid import UUID

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, status
from google import genai
from google.genai import types
from pydantic import BaseModel

from database import get_supabase_client

load_dotenv()

# ---------------------------------------------------------------------------
# Gemini client
# ---------------------------------------------------------------------------
_gemini_client = genai.Client()
MODEL = "gemini-2.5-flash"

ROUTINE_ANALYSIS_SYSTEM_INSTRUCTION = """You are an expert nutritionist and dietitian with 20+ years of clinical experience.

A user will describe their typical daily eating routine.
You will also receive their personal health profile (goals, weight, height, age, dietary preferences).

Your task is to analyze their routine and identify nutritional gaps and excesses relative to their personal goals.

Be specific, practical, and encouraging. Focus on the most impactful changes.

OUTPUT RULES (non-negotiable):
- Return ONLY a raw JSON object – no markdown fences, no extra text, no explanations outside the JSON.
- The object must follow this exact schema:
  {
    "lacking": ["string – specific nutrient or macro the user needs more of, e.g., 'Fiber (aim for 25-38g/day)'"],
    "excess": ["string – specific nutrient, macro, or food component they consume too much of"],
    "summary": "string – 2-3 encouraging sentences summarizing what to change and why, written directly to the user"
  }
- "lacking" and "excess" must each be arrays of strings (can be empty arrays if nothing notable).
- The "summary" must be warm and motivating, not clinical or harsh.
"""


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RoutineAnalysisRequest(BaseModel):
    user_id: UUID
    routine_description: str


class RoutineAnalysisResult(BaseModel):
    lacking: list[str]
    excess: list[str]
    summary: str


router = APIRouter(
    prefix="/api/user",
    tags=["user"],
)


# ---------------------------------------------------------------------------
# Helper: build user profile context string
# ---------------------------------------------------------------------------

def _build_profile_context(profile: dict[str, Any]) -> str:
    """Format the user's profile into a readable context block for the prompt."""
    goal = profile.get("goal") or "not specified"
    age = profile.get("age")
    weight_kg = profile.get("weight_kg")
    height_cm = profile.get("height_cm")
    calorie_target = profile.get("daily_calorie_target")
    daily_budget = profile.get("daily_budget")
    dietary_prefs = profile.get("dietary_prefs") or {}

    lines = [
        f"Health Goal: {goal}",
    ]
    if age:
        lines.append(f"Age: {age}")
    if weight_kg:
        lines.append(f"Weight: {weight_kg} kg")
    if height_cm:
        lines.append(f"Height: {height_cm} cm")
    if calorie_target:
        lines.append(f"Daily Calorie Target: {calorie_target} kcal")
    if daily_budget:
        lines.append(f"Daily Food Budget: ${float(daily_budget):.2f}")
    if dietary_prefs:
        lines.append(f"Dietary Preferences / Restrictions: {json.dumps(dietary_prefs)}")

    return "\n".join(lines) if lines else "No profile data available."


# ---------------------------------------------------------------------------
# Route: POST /api/user/analyze-routine
# ---------------------------------------------------------------------------

@router.post(
    "/analyze-routine",
    status_code=status.HTTP_200_OK,
    response_model=RoutineAnalysisResult,
)
async def analyze_routine(payload: RoutineAnalysisRequest) -> RoutineAnalysisResult:
    """
    Analyze a user's self-described routine diet against their health profile.

    Flow:
      1. Fetch the user's profile (goals, biometrics, dietary preferences).
      2. Build a structured prompt with both the profile and the routine description.
      3. Call Gemini with a nutritionist system prompt + JSON response enforcement.
      4. Parse and validate the structured output via Pydantic.
      5. Persist the analysis to `user_preferences.historical_deficiencies` as JSON.
      6. Return the structured analysis to the client.
    """
    supabase = get_supabase_client()
    user_id_str = str(payload.user_id)

    # ------------------------------------------------------------------
    # 1. Fetch user profile
    # ------------------------------------------------------------------
    profile_resp = (
        supabase.table("user_profiles")
        .select("goal, age, weight_kg, height_cm, daily_calorie_target, daily_budget, dietary_prefs")
        .eq("user_id", user_id_str)
        .maybe_single()
        .execute()
    )
    profile: dict[str, Any] = profile_resp.data or {}

    # ------------------------------------------------------------------
    # 2. Build prompt
    # ------------------------------------------------------------------
    profile_context = _build_profile_context(profile)

    prompt = (
        f"## User Health Profile\n{profile_context}\n\n"
        f"## User's Typical Daily Diet (self-described)\n{payload.routine_description}\n\n"
        "Analyze this routine diet against the user's health profile and goals. "
        "Return ONLY a raw JSON object as specified – nothing else."
    )

    # ------------------------------------------------------------------
    # 3. Call Gemini
    # ------------------------------------------------------------------
    try:
        response = _gemini_client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=ROUTINE_ANALYSIS_SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                temperature=0.4,
            ),
        )

        raw_text: str = response.text.strip()

        # Defensively strip any stray markdown fences
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()

        analysis_data: dict[str, Any] = json.loads(raw_text)
        analysis = RoutineAnalysisResult(**analysis_data)

    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI returned an invalid JSON response. Please try again.",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"The AI analysis service is temporarily unavailable: {exc}",
        ) from exc

    # ------------------------------------------------------------------
    # 4. Persist the analysis to user_preferences.historical_deficiencies
    #    We store it as a JSON string so the full structured result survives.
    # ------------------------------------------------------------------
    persisted_value = json.dumps(analysis.model_dump())

    try:
        supabase.table("user_preferences").upsert(
            {
                "user_id": user_id_str,
                "historical_deficiencies": persisted_value,
            },
            on_conflict="user_id",
        ).execute()
    except Exception as exc:
        # Non-fatal – log and continue so the user still gets their analysis.
        print(f"[analyze-routine] Failed to persist analysis for user {user_id_str}: {exc}")

    return analysis
