-- Migration: 20261024000008_settings_seed.sql
-- Seed initial system settings

INSERT INTO public.settings (key, value, description)
VALUES
  (
    'google_login_enabled',
    'false'::jsonb,
    'Whether Google Workspace OAuth login is active (deferred per master prompt)'
  ),
  (
    'google_auto_provision',
    'false'::jsonb,
    'Whether unregistered Workspace users can automatically provision student accounts on first sign-in'
  ),
  (
    'allowed_email_domains',
    '["pecit.edu.ph"]'::jsonb,
    'List of institutional email domains allowed for institutional sign-in'
  ),
  (
    'admin_contact_email',
    '"admin@pecit.edu.ph"'::jsonb,
    'Administrator contact email address for account support'
  ),
  (
    'retention_policy',
    '{"audit_log_years": 7, "closed_account_retention_days": 365}'::jsonb,
    'Data Privacy Act (RA 10173) retention policies for audit records and graduated accounts'
  )
ON CONFLICT (key) DO NOTHING;
