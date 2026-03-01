from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from database import get_supabase_admin_client

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"],
)


class UserSignupPayload(BaseModel):
    email: str
    password: str
    full_name: str


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup_user(payload: UserSignupPayload):
    """
    Creates a Supabase Auth user via the admin API (no confirmation email sent)
    and inserts the matching row into public.users.
    """
    admin = get_supabase_admin_client()

    # 1. Create the auth user with email pre-confirmed so no email is sent.
    user = None
    try:
        auth_resp = admin.auth.admin.create_user({
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
            "user_metadata": {"full_name": payload.full_name},
        })
        user = auth_resp.user
    except Exception as exc:
        detail = str(exc)
        # If the auth user already exists (e.g. orphaned from a previous failed
        # signup attempt), find them and reuse their ID so we can still upsert
        # public.users and complete registration.
        if "already been registered" in detail or "already exists" in detail:
            try:
                all_users = admin.auth.admin.list_users()
                user = next(
                    (u for u in all_users if u.email == payload.email), None
                )
                if user:
                    # Update the password in case it changed, and re-confirm.
                    admin.auth.admin.update_user_by_id(
                        str(user.id),
                        {"password": payload.password, "email_confirm": True},
                    )
            except Exception:
                pass  # fall through to the check below

        if user is None:
            if "already been registered" in detail or "already exists" in detail:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email already exists.",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create auth user: {detail}",
            ) from exc

    if not user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Auth user creation returned no user object.",
        )

    # 2. Upsert the matching row in public.users.
    try:
        admin.table("users").upsert(
            {"id": str(user.id), "email": payload.email, "full_name": payload.full_name},
            on_conflict="id",
        ).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Auth user created but failed to insert into public.users.",
        ) from exc

    return {"message": "User created successfully", "id": str(user.id)}
