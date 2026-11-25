-- Read-only catalog inventory for the CL migration baseline audit.
-- Returns metadata and hashes only; no participant rows or secrets are read.

WITH catalog_objects AS (
  SELECT
    'relation'::text AS object_kind,
    format('%I.%I', n.nspname, c.relname) AS object_key,
    md5(concat_ws('|', c.relkind, c.relrowsecurity, c.relforcerowsecurity)) AS fingerprint,
    jsonb_build_object(
      'relkind', c.relkind,
      'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity
    ) AS details
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'S')

  UNION ALL

  SELECT
    'column',
    format('%I.%I.%I', n.nspname, c.relname, a.attname),
    md5(concat_ws('|',
      format_type(a.atttypid, a.atttypmod),
      a.attnotnull,
      COALESCE(pg_get_expr(d.adbin, d.adrelid), ''),
      a.attidentity,
      a.attgenerated
    )),
    jsonb_build_object(
      'type', format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull,
      'default', pg_get_expr(d.adbin, d.adrelid),
      'identity', a.attidentity,
      'generated', a.attgenerated
    )
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm')
    AND a.attnum > 0
    AND NOT a.attisdropped

  UNION ALL

  SELECT
    'constraint',
    format('%I.%I.%I', n.nspname, c.relname, con.conname),
    md5(regexp_replace(pg_get_constraintdef(con.oid, true), '\s+', ' ', 'g')),
    jsonb_build_object(
      'type', con.contype,
      'validated', con.convalidated,
      'definition', regexp_replace(pg_get_constraintdef(con.oid, true), '\s+', ' ', 'g')
    )
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND con.contype <> 'n'

  UNION ALL

  SELECT
    'index',
    format('%I.%I.%I', ns.nspname, tbl.relname, idx.relname),
    md5(regexp_replace(pg_get_indexdef(i.indexrelid), '\s+', ' ', 'g')),
    jsonb_build_object(
      'valid', i.indisvalid,
      'ready', i.indisready,
      'definition', regexp_replace(pg_get_indexdef(i.indexrelid), '\s+', ' ', 'g')
    )
  FROM pg_index i
  JOIN pg_class idx ON idx.oid = i.indexrelid
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
  WHERE ns.nspname = 'public'

  UNION ALL

  SELECT
    'function',
    format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
    md5(concat_ws('|',
      regexp_replace(p.prosrc, '\s+', '', 'g'),
      pg_get_function_result(p.oid),
      p.prosecdef,
      p.provolatile,
      p.proisstrict,
      p.proleakproof,
      COALESCE(p.proconfig::text, ''),
      COALESCE(pg_get_expr(p.proargdefaults, 0), '')
    )),
    jsonb_build_object(
      'body_hash', md5(regexp_replace(p.prosrc, '\s+', '', 'g')),
      'result', pg_get_function_result(p.oid),
      'language', l.lanname,
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'strict', p.proisstrict,
      'leakproof', p.proleakproof,
      'config', p.proconfig,
      'defaults_hash', md5(COALESCE(pg_get_expr(p.proargdefaults, 0), '')),
      'acl', COALESCE(p.proacl::text, '')
    )
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend dep
      WHERE dep.classid = 'pg_proc'::regclass
        AND dep.objid = p.oid
        AND dep.deptype = 'e'
    )

  UNION ALL

  SELECT
    'trigger',
    format('%I.%I.%I', n.nspname, c.relname, t.tgname),
    md5(regexp_replace(pg_get_triggerdef(t.oid, true), '\s+', ' ', 'g')),
    jsonb_build_object(
      'enabled', t.tgenabled,
      'definition', regexp_replace(pg_get_triggerdef(t.oid, true), '\s+', ' ', 'g')
    )
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'auth')
    AND NOT t.tgisinternal

  UNION ALL

  SELECT
    'policy',
    format('%I.%I.%I', schemaname, tablename, policyname),
    md5(concat_ws('|', permissive, roles::text, cmd, COALESCE(qual, ''), COALESCE(with_check, ''))),
    jsonb_build_object(
      'permissive', permissive,
      'roles', roles,
      'command', cmd,
      'using', qual,
      'with_check', with_check
    )
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')

  UNION ALL

  SELECT
    'enum',
    format('%I.%I.%s', n.nspname, t.typname, e.enumsortorder),
    md5(e.enumlabel),
    jsonb_build_object('label', e.enumlabel)
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE n.nspname = 'public'

  UNION ALL

  SELECT
    'table_grant',
    format('%I.%I.%I.%s', n.nspname, c.relname, grantee.rolname, acl.privilege_type),
    md5(acl.is_grantable::text),
    jsonb_build_object('grantable', acl.is_grantable)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(
    COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, c.relowner))
  ) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
    AND grantee.rolname IN ('anon', 'authenticated', 'service_role')

  UNION ALL

  SELECT
    'routine_grant',
    format('%I.%I(%s).%I.%s', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), grantee.rolname, acl.privilege_type),
    md5(acl.is_grantable::text),
    jsonb_build_object('grantable', acl.is_grantable)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND grantee.rolname IN ('anon', 'authenticated', 'service_role')

  UNION ALL

  SELECT
    'storage_bucket',
    format('storage.buckets.%s', b.id),
    md5(concat_ws('|', b.name, b.public, b.file_size_limit, b.allowed_mime_types::text)),
    jsonb_build_object(
      'name', b.name,
      'public', b.public,
      'file_size_limit', b.file_size_limit,
      'allowed_mime_types', b.allowed_mime_types
    )
  FROM storage.buckets b
  WHERE b.id IN ('club-logos', 'avatars', 'partner-logos', 'inbox-attachments')

  UNION ALL

  SELECT
    'seed_key',
    format('public.app_settings.%s', s.key),
    md5(concat_ws('|', s.value::text, COALESCE(s.description, ''))),
    jsonb_build_object('present', true)
  FROM public.app_settings s

  UNION ALL

  SELECT
    'seed_key',
    format('public.email_templates.%s', t.name),
    md5(concat_ws('|', t.subject, t.body, t.type::text, t.active)),
    jsonb_build_object('type', t.type, 'active', t.active)
  FROM public.email_templates t

  UNION ALL

  SELECT
    'seed_key',
    format('public.rbac_roles.%s', r.key),
    md5(concat_ws('|', r.name, COALESCE(r.description, ''), r.is_system)),
    jsonb_build_object('present', true)
  FROM public.rbac_roles r

  UNION ALL

  SELECT
    'seed_key',
    format('public.rbac_permissions.%s', p.key),
    md5(concat_ws('|', p.name, COALESCE(p.description, ''), p.category)),
    jsonb_build_object('present', true)
  FROM public.rbac_permissions p
)
SELECT object_kind, object_key, fingerprint, details
FROM catalog_objects
ORDER BY object_kind, object_key;
