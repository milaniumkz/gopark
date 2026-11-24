-- Only execute for an explicitly requested reset, after a verified backup.
-- Preserve the unique active owner exactly, including credentials and MFA state.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE public.users IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.users WHERE role::text = 'owner') <> 1 THEN
    RAISE EXCEPTION 'Reset requires exactly one owner; no account will be guessed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE role::text = 'owner' AND status::text = 'active') THEN
    RAISE EXCEPTION 'Owner must already be active before reset';
  END IF;
END
$guard$;
CREATE TEMP TABLE reset_preserved_owner ON COMMIT DROP AS
  SELECT * FROM public.users WHERE role::text = 'owner';
DO $truncate$
DECLARE targets text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename)
    INTO targets FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
  IF targets IS NULL THEN RAISE EXCEPTION 'No application tables found'; END IF;
  EXECUTE 'TRUNCATE TABLE ' || targets || ' RESTART IDENTITY CASCADE';
END
$truncate$;
INSERT INTO public.users SELECT * FROM reset_preserved_owner;
DO $verify$
DECLARE t record; n bigint;
BEGIN
  IF (SELECT count(*) FROM public.users) <> 1 THEN
    RAISE EXCEPTION 'Owner preservation failed';
  END IF;
  IF EXISTS (
    (SELECT * FROM public.users EXCEPT ALL SELECT * FROM reset_preserved_owner)
    UNION ALL
    (SELECT * FROM reset_preserved_owner EXCEPT ALL SELECT * FROM public.users)
  ) THEN RAISE EXCEPTION 'Owner data changed; rolling back'; END IF;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename NOT IN ('users', '_prisma_migrations') LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t.tablename) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'Table % was not emptied', t.tablename; END IF;
  END LOOP;
END
$verify$;
COMMIT;
SELECT id, email, role, status FROM public.users;
