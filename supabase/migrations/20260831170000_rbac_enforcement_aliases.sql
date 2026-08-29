-- =============================================================================
-- RBAC enforcement aliases (communications.manage, cancellations.manage)
-- Production: NOT auto-applied.
-- =============================================================================

INSERT INTO public.rbac_permissions (key, name, category) VALUES
  ('communications.manage', 'Kommunikation verwalten', 'communications'),
  ('cancellations.manage', 'Absagen verwalten', 'cancellations')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key IN ('communications.manage', 'communications.send', 'communications.view')
WHERE r.key IN ('SUPER_ADMIN', 'COMMUNICATION_MANAGER')
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key = 'communications.manage'
WHERE r.key = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key IN ('cancellations.manage', 'cancellations.decide', 'cancellations.view')
WHERE r.key IN ('SUPER_ADMIN', 'APPLICATION_MANAGER')
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key = 'cancellations.manage'
WHERE r.key = 'ADMIN'
ON CONFLICT DO NOTHING;
