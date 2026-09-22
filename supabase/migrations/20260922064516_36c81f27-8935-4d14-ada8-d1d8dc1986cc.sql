-- Trigger-only helper: not meant to be called directly
REVOKE ALL ON FUNCTION public.protect_rider_verified() FROM authenticated;

-- Public banner policy should use the internal helper (private schema is not API-exposed)
GRANT USAGE ON SCHEMA private TO anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, app_role) TO anon;
DROP POLICY IF EXISTS "Anyone can view active banners" ON public.promotional_banners;
CREATE POLICY "Anyone can view active banners" ON public.promotional_banners
FOR SELECT TO anon, authenticated
USING (is_active OR private.has_role(auth.uid(), 'admin'::app_role));

-- Role check no longer needs elevated privileges: it reads role rows the caller may already read
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$function$;