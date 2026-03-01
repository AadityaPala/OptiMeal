import os
from functools import lru_cache
from typing import Optional

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()


class SupabaseSettingsError(RuntimeError):
  """Raised when Supabase configuration is missing or invalid."""


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
  """
  Returns a singleton Supabase client instance configured from environment
  variables SUPABASE_URL and SUPABASE_KEY.
  """
  url: Optional[str] = os.getenv("SUPABASE_URL")
  key: Optional[str] = os.getenv("SUPABASE_KEY")

  if not url or not key:
    raise SupabaseSettingsError(
        "SUPABASE_URL and SUPABASE_KEY must be set in the environment."
    )

  return create_client(url, key)


@lru_cache(maxsize=1)
def get_supabase_admin_client() -> Client:
  """
  Returns a singleton Supabase client using the service role key.
  This client has admin privileges and bypasses RLS/email confirmations.
  Uses SUPABASE_SERVICE_ROLE_KEY if set, otherwise falls back to SUPABASE_KEY.
  """
  url: Optional[str] = os.getenv("SUPABASE_URL")
  service_role_key: Optional[str] = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

  if not url or not service_role_key:
    raise SupabaseSettingsError(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) must be set in the environment."
    )

  return create_client(url, service_role_key)