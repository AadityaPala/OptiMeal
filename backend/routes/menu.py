from __future__ import annotations

import io
import json
import os
from typing import Any, List
from uuid import UUID, uuid4

import httpx
import numpy as np
import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field, ValidationError

from database import get_supabase_client

router = APIRouter(
    prefix="/api/menu",
    tags=["menu"],
)


class ParsedMenuItem(BaseModel):
  """
  Parsed representation of a single menu item as returned by the AI model.
  This mirrors the JSON structure expected from the AI parsing step and the
  payload inserted into the menu_items table.
  """

  item_name: str = Field(..., description="Human-readable name of the menu item.")
  price: float = Field(..., ge=0, description="Price in the local currency.")
  est_calories: int = Field(..., ge=0)
  est_protein: int = Field(..., ge=0)
  est_carbs: int = Field(..., ge=0)
  est_fats: int = Field(..., ge=0)


SYSTEM_PROMPT = """
You are an expert nutritionist and menu analyst helping a user understand a
restaurant or cafeteria menu from an image.

Your task:
- Read the attached menu carefully.
- Identify each distinct food or drink item that a user could order.
- For each item, extract:
  - item_name: short, human-readable name.
  - price: numeric price as a float (no currency symbol, just the number).
  - est_calories: estimated total calories as an integer.
  - est_protein: estimated grams of protein as an integer.
  - est_carbs: estimated grams of carbohydrates as an integer.
  - est_fats: estimated grams of fat as an integer.

VERY IMPORTANT OUTPUT INSTRUCTIONS:
- You MUST respond with a STRICT JSON array.
- The JSON must look like:
  [
    {
      "item_name": "Grilled Chicken Bowl",
      "price": 9.99,
      "est_calories": 650,
      "est_protein": 45,
      "est_carbs": 55,
      "est_fats": 18
    }
  ]
- Do NOT include any additional keys.
- Do NOT include comments, explanations, or any text outside the JSON.
- If you are uncertain about a value, provide your best reasonable estimate.
"""


async def extract_menu_items_with_ai(image_bytes: bytes) -> List[ParsedMenuItem]:
  """
  Placeholder AI extraction logic.

  In production, this function should call Gemini or OpenAI with:
  - The SYSTEM_PROMPT above as system / instruction text.
  - The menu image (image_bytes) as input.
  - A JSON or text response that strictly matches the ParsedMenuItem schema.

  Environment variables you will need to configure (depending on provider):
  - GEMINI_API_KEY for Google Gemini (google-generativeai SDK).
  - OPENAI_API_KEY for OpenAI (openai SDK).

  Example (OpenAI, pseudo-code):
  ----------------------------------------------------------------------
  import openai

  openai.api_key = os.getenv("OPENAI_API_KEY")

  response = openai.chat.completions.create(
      model="gpt-4o-mini",
      messages=[
          {"role": "system", "content": SYSTEM_PROMPT},
          {
              "role": "user",
              "content": [
                  {"type": "text", "text": "Analyze this menu image."},
                  {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
              ],
          },
      ],
  )

  raw = response.choices[0].message.content
  data = json.loads(raw)
  items = [ParsedMenuItem(**item) for item in data]
  ----------------------------------------------------------------------

  For now, this implementation returns a static example so the rest of the
  pipeline (upload, storage, database insert) can be wired and tested.
  """
  # TODO: Replace this stub with a real AI call to Gemini or OpenAI.
  example = [
      {
          "item_name": "Sample Grilled Chicken Bowl",
          "price": 9.99,
          "est_calories": 650,
          "est_protein": 45,
          "est_carbs": 55,
          "est_fats": 18,
      },
      {
          "item_name": "House Salad",
          "price": 6.5,
          "est_calories": 220,
          "est_protein": 8,
          "est_carbs": 20,
          "est_fats": 12,
      },
  ]
  return [ParsedMenuItem(**item) for item in example]


@router.post(
    "/upload",
    status_code=status.HTTP_201_CREATED,
)
async def upload_menu(
    user_id: UUID = Form(..., description="ID of the user uploading this menu."),
    location_name: str | None = Form(
        None,
        description="Optional human-readable location or venue name.",
    ),
    file: UploadFile = File(
        ...,
        description="Image file of the menu (photo or screenshot).",
    ),
    original_currency: str | None = Form(
        None,
        description="ISO 4217 currency code for prices on this menu (e.g. 'USD', 'EUR').",
    ),
) -> dict[str, Any]:
  """
  Upload a menu file, parse it into structured items, and persist both
  the menu and its items in Supabase.

  Supported file types:
  - Image (image/*): parsed via AI vision model.
  - CSV (.csv): parsed via pandas.read_csv().
  - Excel (.xlsx, .xls): parsed via pandas.read_excel().

  Steps:
  1. Validate and read the uploaded file.
  2. Store it in Supabase Storage bucket 'menus' and obtain a public URL.
  3. If image: call AI parsing helper to extract structured items.
     If CSV/Excel: parse via pandas and convert to ParsedMenuItem objects.
  4. Insert a new row into the `menus` table and capture the menu_id.
  5. Bulk insert the parsed items into the `menu_items` table.
  6. Return the created menu_id, image_url, and parsed items to the client.

  Required environment variables:
  - SUPABASE_URL, SUPABASE_KEY: for database and storage access.
  - GEMINI_API_KEY or OPENAI_API_KEY: for the AI provider (once wired).
  """
  content_type = (file.content_type or "").lower()
  filename = (file.filename or "").lower()
  ext = os.path.splitext(filename)[1]

  is_image = content_type.startswith("image/")
  is_excel = ext in (".xlsx", ".xls") or content_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  is_csv = (
      ext == ".csv"
      or content_type in ("text/csv", "application/vnd.ms-excel")
  )

  if not (is_image or is_csv or is_excel):
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Uploaded file must be an image, CSV, or Excel file.",
    )

  supabase = get_supabase_client()

  # Read the file bytes from the uploaded file.
  file_bytes = await file.read()
  if not file_bytes:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Uploaded file is empty.",
    )

  # Derive a safe file path for Supabase Storage.
  if not ext:
    ext = ".jpg" if is_image else ".csv" if is_csv else ".xlsx"
  storage_path = f"{user_id}/{uuid4()}{ext}"

  # Upload to Supabase Storage (bucket: 'menus') and build a public URL.
  try:
    bucket = supabase.storage.from_("menus")
    print(
        "[Menu] Starting storage upload",
        {
            "bucket": "menus",
            "path": storage_path,
            "size_bytes": len(file_bytes),
            "content_type": file.content_type,
        },
    )
    bucket.upload(storage_path, file_bytes, {"content-type": file.content_type})
    image_url = bucket.get_public_url(storage_path)
    print("[Menu] Storage upload completed", {"path": storage_path, "url": image_url})
  except Exception as exc:  # pragma: no cover - defensive
    print("[Menu] Failed to upload file to storage:", exc)
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Failed to store menu file in Supabase Storage.",
    ) from exc

  # Decide how to extract items based on file type.
  if is_csv or is_excel:
    # Parse CSV or Excel via pandas and convert to ParsedMenuItem objects.
    try:
      # Reset the UploadFile cursor in case downstream code inspects it.
      await file.seek(0)

      if is_excel:
        # openpyxl for .xlsx, xlrd for .xls
        engine = "xlrd" if ext == ".xls" else "openpyxl"
        df = pd.read_excel(io.BytesIO(file_bytes), engine=engine)
      else:
        df = pd.read_csv(io.BytesIO(file_bytes))

      # Normalize column names to lower-case and strip whitespace.
      df.columns = [str(c).lower().strip() for c in df.columns]

      # Replace all NaN-like values with None so that any intermediate
      # DataFrame -> dict conversion will be JSON-serializable.
      df = df.replace({np.nan: None})

      parsed_items: List[ParsedMenuItem] = []
      for idx, row in df.iterrows():
        try:
          item_name = str(row.get("item_name", "")).strip()
          if not item_name or (isinstance(item_name, float) and pd.isna(item_name)):
            continue

          price = float(row.get("price", 0) or 0)
          est_calories = int(float(row.get("est_calories", 0) or 0))
          est_protein = int(float(row.get("est_protein", 0) or 0))
          est_carbs = int(float(row.get("est_carbs", 0) or 0))
          est_fats = int(float(row.get("est_fats", 0) or 0))

          item = ParsedMenuItem(
              item_name=item_name,
              price=max(0, price),
              est_calories=max(0, est_calories),
              est_protein=max(0, est_protein),
              est_carbs=max(0, est_carbs),
              est_fats=max(0, est_fats),
          )
          parsed_items.append(item)
        except (ValueError, TypeError) as exc:
          print(f"[Menu] Skipping invalid row {idx}: {row.to_dict()} ({exc})")
          continue
    except Exception as exc:  # pragma: no cover - defensive
      print("Pandas Error:", exc)
      raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail=str(exc),
      ) from exc
  else:
    # Use AI to extract structured menu items from the image.
    try:
      parsed_items = await extract_menu_items_with_ai(file_bytes)
    except (ValidationError, json.JSONDecodeError) as exc:
      raise HTTPException(
          status_code=status.HTTP_502_BAD_GATEWAY,
          detail="AI response could not be parsed into structured menu items.",
      ) from exc
    except Exception as exc:  # pragma: no cover - defensive
      print("[Menu] AI parsing failed:", exc)
      raise HTTPException(
          status_code=status.HTTP_502_BAD_GATEWAY,
          detail="AI parsing failed.",
      ) from exc

  if not parsed_items:
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="No menu items could be extracted from the uploaded file.",
    )

  # Insert a new menu row.
  resolved_location_name = location_name or "Unnamed Location"
  try:
    menu_payload = {
        "user_id": str(user_id),
        "location_name": resolved_location_name,
        "image_url": image_url,
        "raw_text": None,
        "original_currency": (original_currency or "USD").upper(),
    }
    menu_resp = supabase.table("menus").insert(menu_payload).execute()
  except Exception as exc:  # pragma: no cover - defensive
    print("[Menu] Exception while inserting menu record:", exc)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(exc),
    ) from exc

  menu_error = getattr(menu_resp, "error", None)
  if menu_error:
    print("[Menu] Supabase error creating menu:", menu_error)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(menu_error),
    )

  menu_data_list = getattr(menu_resp, "data", None) or []
  if not menu_data_list:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Menu insert did not return any data.",
    )

  menu_id = menu_data_list[0].get("id")
  if not menu_id:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Menu ID not returned from database insert.",
    )

  # Bulk insert menu items.
  rows = []
  for item in parsed_items:
    rows.append(
        {
            "menu_id": str(menu_id),
            "item_name": item.item_name,
            "price": item.price,
            "est_calories": item.est_calories,
            # Map AI fields to DB column names with _g suffix.
            "est_protein_g": item.est_protein,
            "est_carbs_g": item.est_carbs,
            "est_fats_g": item.est_fats,
        }
    )

  try:
    items_resp = supabase.table("menu_items").insert(rows).execute()
  except Exception as exc:  # pragma: no cover - defensive
    print("[Menu] Exception while inserting menu items:", exc)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(exc),
    ) from exc

  items_error = getattr(items_resp, "error", None)
  if items_error:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(items_error),
    )

  # Respond with the created menu and parsed items for the frontend.
  return {
      "menu_id": str(menu_id),
      "image_url": image_url,
      "items": [item.model_copy(update={}) for item in parsed_items],
  }


# ---------------------------------------------------------------------------
# GET /api/menu  – list all menus for a user
# ---------------------------------------------------------------------------

@router.get("", status_code=status.HTTP_200_OK)
async def list_menus(user_id: UUID) -> dict[str, Any]:
  """
  Return all menus belonging to `user_id`, ordered newest-first.
  Each entry contains: id, location_name, image_url, created_at.
  """
  supabase = get_supabase_client()
  try:
    resp = (
        supabase.table("menus")
        .select("id, location_name, image_url, created_at")
        .eq("user_id", str(user_id))
        .order("created_at", desc=True)
        .execute()
    )
  except Exception as exc:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to fetch menus.",
    ) from exc

  return {"menus": resp.data or []}


# ---------------------------------------------------------------------------
# GET /api/menu/{menu_id}  – single menu + all its items
# ---------------------------------------------------------------------------

@router.get("/{menu_id}", status_code=status.HTTP_200_OK)
async def get_menu(menu_id: UUID, user_id: UUID | None = None) -> dict[str, Any]:
  """
  Return the menu row plus all associated `menu_items`, keyed by menu_id.
  Pass an optional `user_id` to enable automatic currency conversion based on the
  user's `preferred_currency` profile setting.
  """
  supabase = get_supabase_client()
  try:
    menu_resp = (
        supabase.table("menus")
        .select("id, user_id, location_name, image_url, created_at")
        .eq("id", str(menu_id))
        .maybe_single()
        .execute()
    )
  except Exception as exc:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to fetch menu.",
    ) from exc

  menu = menu_resp.data if menu_resp is not None else None
  if not menu:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Menu {menu_id} not found.",
    )

  try:
    items_resp = (
        supabase.table("menu_items")
        .select("id, item_name, price, est_calories, est_protein_g, est_carbs_g, est_fats_g")
        .eq("menu_id", str(menu_id))
        .order("item_name")
        .execute()
    )
  except Exception as exc:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to fetch menu items.",
    ) from exc

  # ---------------------------------------------------------------------------
  # Currency conversion (optional – triggered when caller passes user_id)
  # ---------------------------------------------------------------------------
  original_currency = (menu.get("original_currency") or "USD").upper()
  converted_currency = original_currency
  items: list[dict] = items_resp.data or []

  if user_id is not None:
    try:
      profile_resp = (
          supabase.table("user_profiles")
          .select("preferred_currency")
          .eq("user_id", str(user_id))
          .maybe_single()
          .execute()
      )
      profile_data = profile_resp.data if profile_resp is not None else None
      preferred = ((profile_data or {}).get("preferred_currency") or "USD").upper()

      if preferred != original_currency:
        rate_url = f"https://open.er-api.com/v6/latest/{original_currency}"
        async with httpx.AsyncClient(timeout=5.0) as client:
          rate_resp = await client.get(rate_url)
          rate_resp.raise_for_status()
          rate_json = rate_resp.json()

        rate = rate_json.get("rates", {}).get(preferred)
        if rate:
          items = [
              {**item, "price": round(float(item.get("price") or 0) * rate, 2)}
              for item in items
          ]
          converted_currency = preferred
    except Exception as exc:
      print(f"[Menu] Currency conversion failed, returning original prices: {exc}")

  return {"menu": menu, "items": items, "converted_currency": converted_currency}


# ---------------------------------------------------------------------------
# DELETE /api/menu/{menu_id}  – permanently remove a menu (owner only)
# ---------------------------------------------------------------------------

@router.delete("/{menu_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_menu(menu_id: UUID, user_id: UUID) -> None:
  """
  Delete a menu and all its items (cascade handled by the DB foreign key).
  Verifies that `user_id` owns the menu before deleting.
  """
  supabase = get_supabase_client()

  # Verify ownership.
  try:
    resp = (
        supabase.table("menus")
        .select("id, user_id")
        .eq("id", str(menu_id))
        .maybe_single()
        .execute()
    )
  except Exception as exc:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to fetch menu.",
    ) from exc

  menu = resp.data if resp is not None else None
  if not menu:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Menu {menu_id} not found.",
    )
  if menu.get("user_id") != str(user_id):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You are not authorized to delete this menu.",
    )

  try:
    supabase.table("menus").delete().eq("id", str(menu_id)).execute()
  except Exception as exc:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to delete menu.",
    ) from exc