-- schema.sql
-- OptiMeal initial database schema for Supabase/PostgreSQL

-- Enable UUID generation (Supabase usually has this, but keep for portability)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Shared trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

------------------------------------------------------------
-- 1. users
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------
-- 2. user_profiles
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  age SMALLINT CHECK (age > 0),
  weight_kg NUMERIC(6,2) CHECK (weight_kg > 0),
  height_cm NUMERIC(6,2) CHECK (height_cm > 0),
  goal TEXT, -- e.g. 'weight_loss', 'maintenance', 'muscle_gain'
  dietary_prefs JSONB, -- e.g. { "vegan": true, "allergies": ["peanuts"] }
  daily_budget NUMERIC(10,2) CHECK (daily_budget >= 0),
  daily_calorie_target INTEGER CHECK (daily_calorie_target >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------
-- 3. user_preferences
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  favorite_ingredients JSONB DEFAULT '[]'::JSONB,  -- array of strings or objects
  disliked_ingredients JSONB DEFAULT '[]'::JSONB,  -- array of strings or objects
  historical_deficiencies TEXT,                    -- summarized insight text
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE TRIGGER trg_user_preferences_updated_at
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------
-- 4. menus
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  location_name TEXT NOT NULL,
  raw_text TEXT,        -- OCR or pasted text
  image_url TEXT,       -- Supabase Storage or external URL
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_menus_user_id ON public.menus(user_id);

CREATE TRIGGER trg_menus_updated_at
BEFORE UPDATE ON public.menus
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------
-- 5. menu_items
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id UUID NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  price NUMERIC(10,2) CHECK (price >= 0),
  est_calories INTEGER CHECK (est_calories >= 0),
  est_protein_g NUMERIC(6,2) CHECK (est_protein_g >= 0),
  est_carbs_g NUMERIC(6,2) CHECK (est_carbs_g >= 0),
  est_fats_g NUMERIC(6,2) CHECK (est_fats_g >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_menu_items_menu_id ON public.menu_items(menu_id);

CREATE TRIGGER trg_menu_items_updated_at
BEFORE UPDATE ON public.menu_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------
-- 6. daily_logs
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  -- meals stores per-item tracking: [{"item_name": "Pancake", "price": 45}]
  meals JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- daily_total_cost is kept in sync by the API (sum of all meal prices)
  daily_total_cost NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (daily_total_cost >= 0),
  -- legacy nutrition columns (retained for future use)
  total_calories INTEGER CHECK (total_calories >= 0),
  total_protein_g NUMERIC(6,2) CHECK (total_protein_g >= 0),
  total_carbs_g NUMERIC(6,2) CHECK (total_carbs_g >= 0),
  total_fats_g NUMERIC(6,2) CHECK (total_fats_g >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT uq_daily_logs_user_date UNIQUE (user_id, log_date)
);

-- Migration: run this if daily_logs already exists in your database
-- ALTER TABLE public.daily_logs
--   ADD COLUMN IF NOT EXISTS meals JSONB NOT NULL DEFAULT '[]'::JSONB,
--   ADD COLUMN IF NOT EXISTS daily_total_cost NUMERIC(10,2) NOT NULL DEFAULT 0
--     CHECK (daily_total_cost >= 0);

CREATE INDEX idx_daily_logs_user_id ON public.daily_logs(user_id);

CREATE TRIGGER trg_daily_logs_updated_at
BEFORE UPDATE ON public.daily_logs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();