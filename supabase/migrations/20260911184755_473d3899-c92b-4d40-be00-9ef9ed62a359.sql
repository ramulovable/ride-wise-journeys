CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.shares_ride_with(_other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rides r
    WHERE (r.customer_id = auth.uid() AND r.rider_id = _other)
       OR (r.rider_id = auth.uid() AND r.customer_id = _other)
  );
$$;
REVOKE ALL ON FUNCTION private.shares_ride_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.shares_ride_with(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "profiles_visible_select" ON public.profiles;
CREATE POLICY "profiles_visible_select" ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR private.has_role(auth.uid(), 'admin')
  OR private.has_role(id, 'rider')
  OR private.shares_ride_with(id)
);
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR private.has_role(auth.uid(), 'admin'))
WITH CHECK (id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "roles_self_select" ON public.user_roles;
CREATE POLICY "roles_self_select" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "categories_admin_write" ON public.vehicle_categories;
CREATE POLICY "categories_admin_write" ON public.vehicle_categories FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "locations_admin_write" ON public.locations;
CREATE POLICY "locations_admin_write" ON public.locations FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "rider_details_self_update" ON public.rider_details;
CREATE POLICY "rider_details_self_update" ON public.rider_details FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'))
WITH CHECK (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "rider_vehicles_read" ON public.rider_vehicles;
CREATE POLICY "rider_vehicles_read" ON public.rider_vehicles FOR SELECT TO authenticated
USING (is_active OR rider_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "rider_vehicles_owner_insert" ON public.rider_vehicles;
CREATE POLICY "rider_vehicles_owner_insert" ON public.rider_vehicles FOR INSERT TO authenticated
WITH CHECK (rider_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "rider_vehicles_owner_update" ON public.rider_vehicles;
CREATE POLICY "rider_vehicles_owner_update" ON public.rider_vehicles FOR UPDATE TO authenticated
USING (rider_id = auth.uid() OR private.has_role(auth.uid(), 'admin'))
WITH CHECK (rider_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "rider_vehicles_owner_delete" ON public.rider_vehicles;
CREATE POLICY "rider_vehicles_owner_delete" ON public.rider_vehicles FOR DELETE TO authenticated
USING (rider_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "subs_read" ON public.subscription_payments;
CREATE POLICY "subs_read" ON public.subscription_payments FOR SELECT TO authenticated
USING (rider_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "subs_admin_insert" ON public.subscription_payments;
CREATE POLICY "subs_admin_insert" ON public.subscription_payments FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "fares_owner_write" ON public.rider_route_fares;
CREATE POLICY "fares_owner_write" ON public.rider_route_fares FOR ALL TO authenticated
USING (rider_id = auth.uid() OR private.has_role(auth.uid(), 'admin'))
WITH CHECK (rider_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "rides_read" ON public.rides;
CREATE POLICY "rides_read" ON public.rides FOR SELECT TO authenticated USING (
  customer_id = auth.uid() OR rider_id = auth.uid() OR private.has_role(auth.uid(), 'admin')
  OR (rider_id IS NULL AND status IN ('requested','searching'))
);
DROP POLICY IF EXISTS "rides_update" ON public.rides;
CREATE POLICY "rides_update" ON public.rides FOR UPDATE TO authenticated USING (
  customer_id = auth.uid() OR rider_id = auth.uid() OR private.has_role(auth.uid(), 'admin')
  OR (rider_id IS NULL AND status IN ('requested','searching'))
) WITH CHECK (
  customer_id = auth.uid() OR rider_id = auth.uid() OR private.has_role(auth.uid(), 'admin')
);
DROP POLICY IF EXISTS "support_read" ON public.support_requests;
CREATE POLICY "support_read" ON public.support_requests FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "support_update" ON public.support_requests;
CREATE POLICY "support_update" ON public.support_requests FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rider_subscription_active(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shares_ride_with(uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.rider_subscription_active(uuid);