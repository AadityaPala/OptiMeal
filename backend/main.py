from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import get_supabase_client
from routes.menu import router as menu_router
from routes.profile import router as profile_router
from routes.recommendations import router as recommendations_router
from routes.auth import router as auth_router


def create_app() -> FastAPI:
  """
  Application factory for the OptiMeal backend.
  """
  app = FastAPI(
      title="OptiMeal API",
      version="0.1.0",
      description="Backend service for the OptiMeal health & budget tracker.",
  )

  # CORS configuration for local Next.js (and future mobile dev)
  origins = [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:19006",   # Expo web (optional)
      "http://127.0.0.1:19006",
    ]

  app.add_middleware(
      CORSMiddleware,
      allow_origins=origins,
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
  )

  # Routers
  app.include_router(auth_router)
  app.include_router(recommendations_router)
  app.include_router(menu_router)
  app.include_router(profile_router)

  @app.get("/health", tags=["system"])
  async def health_check() -> dict[str, str]:
    """
    Lightweight health check endpoint.
    """
    return {"status": "ok"}

  @app.get("/api/health/supabase", tags=["system"])
  async def supabase_health() -> dict[str, Any]:
    """
    Temporary health check to verify connectivity to Supabase.

    Tries a very small query against the `users` table. If the client cannot
    connect or the query fails, the error is captured and returned so you can
    see it in the browser without digging through logs.
    """
    try:
      client = get_supabase_client()
      resp = client.table("users").select("id").limit(1).execute()
      error = getattr(resp, "error", None)
      if error:
        return {"status": "error", "error": str(error)}
      return {"status": "connected"}
    except Exception as exc:  # pragma: no cover - defensive
      return {"status": "error", "error": str(exc)}

  return app


app = create_app()