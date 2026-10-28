-- Migration: 20261024000005_public_view.sql
-- Creates public view for anonymous and discovery access to published, non-confidential research

CREATE OR REPLACE VIEW public.public_theses
WITH (security_invoker = true) AS
SELECT
  id,
  title,
  abstract,
  department,
  program,
  keywords,
  author_names,
  year,
  doi,
  license,
  published_at
FROM public.theses
WHERE status = 'published'
  AND is_confidential = false
  AND (embargo_until IS NULL OR embargo_until <= now());

-- Grant view permissions to anonymous visitors and authenticated users
GRANT SELECT ON public.public_theses TO anon, authenticated;
