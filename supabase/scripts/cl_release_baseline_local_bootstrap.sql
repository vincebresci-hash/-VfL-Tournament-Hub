-- Local-only bootstrap for the CL migration baseline audit.
--
-- This file creates the minimum Supabase-managed surface required to replay the
-- repository migrations in an isolated PostgreSQL instance. It must never be
-- executed against a hosted Supabase project.

\if :{?CL_BASELINE_LOCAL_ONLY}
\else
  \echo 'Refusing to run: pass -v CL_BASELINE_LOCAL_ONLY=1 in an isolated local database.'
  \quit 3
\endif

DO $bootstrap$
BEGIN
  IF current_setting('listen_addresses') NOT IN ('127.0.0.1', 'localhost') THEN
    RAISE EXCEPTION 'local bootstrap requires a loopback-only PostgreSQL instance';
  END IF;
END
$bootstrap$;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text NOT NULL,
  owner uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN position('/' IN name) = 0 THEN ARRAY[]::text[]
    ELSE string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
  END
$$;

GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;
GRANT SELECT ON storage.buckets, storage.objects TO anon, authenticated;
GRANT ALL ON storage.buckets, storage.objects TO service_role;

