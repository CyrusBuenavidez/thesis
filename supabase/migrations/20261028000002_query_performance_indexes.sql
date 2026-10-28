-- Migration: 20261028000002_query_performance_indexes.sql
-- High-impact performance indexes for fast dashboard telemetry, audit trail queries, and management list joins

-- 1. Activity Logs sorting & foreign key lookups (Audit Logs & Dashboard)
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_id ON public.activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON public.activity_logs(action);

-- 2. Theses updated_at & created_at sort order (Thesis Management, Review Queue, Dashboard)
CREATE INDEX IF NOT EXISTS idx_theses_updated_at ON public.theses(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_theses_created_at ON public.theses(created_at DESC);

-- 3. Program & Department relational joins
CREATE INDEX IF NOT EXISTS idx_programs_department_id ON public.programs(department_id);

-- 4. User profile role & status filtering (Eligible advisors, active counts)
CREATE INDEX IF NOT EXISTS idx_profiles_role_status ON public.profiles(role, status);

-- 5. PDF annotations foreign key join
CREATE INDEX IF NOT EXISTS idx_pdf_annotations_thesis_id ON public.pdf_annotations(thesis_id);
