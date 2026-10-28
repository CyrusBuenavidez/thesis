-- Migration: 20261028000001_security_invoker_view.sql
-- Switch public_theses view to security_invoker = true
-- Resolves Supabase Database Advisor Lint 0010 (security_definer_view)

ALTER VIEW public.public_theses
  SET (security_invoker = true);
