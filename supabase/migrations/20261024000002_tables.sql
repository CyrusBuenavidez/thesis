-- Migration: 20261024000002_tables.sql
-- Creates core tables for PECIT Thesis Archive System

-- 1. Profiles (source of truth for identity, role, and contact data)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'student',
  department text,
  program text,
  status profile_status NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT false,
  privacy_consent_at timestamptz,
  phone text,
  address text,
  birth_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Theses (main research records)
CREATE TABLE IF NOT EXISTS public.theses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  abstract text NOT NULL,
  status thesis_status NOT NULL DEFAULT 'draft',
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  primary_supervisor_id uuid REFERENCES public.profiles(id),
  department text NOT NULL,
  program text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  author_names text[] NOT NULL DEFAULT '{}',
  year integer,
  doi text,
  license text,
  is_confidential boolean NOT NULL DEFAULT false,
  embargo_until timestamptz,
  consent_accepted_at timestamptz,
  consent_version text,
  published_at timestamptz,
  review_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_vector tsvector,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Thesis Authors (group authors and co-author access)
CREATE TABLE IF NOT EXISTS public.thesis_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES public.theses(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_thesis_authors_thesis_profile UNIQUE (thesis_id, profile_id)
);

-- 4. Thesis Versions (manuscript files in R2)
CREATE TABLE IF NOT EXISTS public.thesis_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES public.theses(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  r2_key text NOT NULL,
  docx_r2_key text,
  file_size bigint NOT NULL,
  sha256 text NOT NULL,
  change_notes text,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_thesis_versions_thesis_version UNIQUE (thesis_id, version_number)
);

-- 5. PDF Annotations (page comments saved during review)
CREATE TABLE IF NOT EXISTS public.pdf_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES public.theses(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.thesis_versions(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL,
  highlight_coords jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Activity Logs (append-only audit trail)
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid REFERENCES public.theses(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_status thesis_status,
  to_status thesis_status,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Notifications (in-app notifications)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  thesis_id uuid REFERENCES public.theses(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Access Logs (confidential file view / download audits for DPA compliance)
CREATE TABLE IF NOT EXISTS public.access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES public.theses(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.thesis_versions(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  kind access_kind NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Settings (system settings, branding, allowed domains)
CREATE TABLE IF NOT EXISTS public.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
