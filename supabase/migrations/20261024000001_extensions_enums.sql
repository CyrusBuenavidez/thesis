-- Migration: 20261024000001_extensions_enums.sql
-- Enables required extensions and creates application domain enums

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- User roles in PECIT Thesis Archive
-- Hierarchy: student (author), advisor (reviewer), librarian (manager), admin, super_admin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM (
      'student',
      'advisor',
      'librarian',
      'admin',
      'super_admin'
    );
  END IF;
END $$;

-- Lifecycle states for theses (8 states)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'thesis_status') THEN
    CREATE TYPE thesis_status AS ENUM (
      'draft',
      'submitted',
      'under_review',
      'revision_requested',
      'accepted',
      'rejected',
      'published',
      'archived'
    );
  END IF;
END $$;

-- Account lifecycle status (active, disabled, graduated)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_status') THEN
    CREATE TYPE profile_status AS ENUM (
      'active',
      'disabled',
      'graduated'
    );
  END IF;
END $$;

-- Access log kind
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_kind') THEN
    CREATE TYPE access_kind AS ENUM (
      'view',
      'download',
      'docx_export'
    );
  END IF;
END $$;
