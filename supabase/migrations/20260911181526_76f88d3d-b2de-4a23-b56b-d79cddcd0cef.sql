
CREATE OR REPLACE FUNCTION public.shares_ride_with(_other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rides r
    WHERE (r.customer_id = auth.uid() AND r.rider_id = _other)
       OR (r.rider_id = auth.uid() AND r.customer_id = _other)
  );
$$;
REVOKE ALL ON FUNCTION public.shares_ride_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_ride_with(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
CREATE POLICY "profiles_visible_select" ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(id, 'rider')
  OR public.shares_ride_with(id)
);
