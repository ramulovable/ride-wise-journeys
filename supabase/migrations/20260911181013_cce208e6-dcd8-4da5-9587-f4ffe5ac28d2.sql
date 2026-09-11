
-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin','rider','customer');
CREATE TYPE public.ride_status AS ENUM ('requested','searching','accepted','on_the_way','arrived','started','completed','cancelled');
CREATE TYPE public.booking_type AS ENUM ('share','reserve');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  photo_url text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- new user -> profile + role from signup metadata (admin never self-assignable)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE requested text;
BEGIN
  INSERT INTO public.profiles (id, mobile, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'mobile', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name','')
  ) ON CONFLICT (id) DO NOTHING;

  requested := COALESCE(NEW.raw_user_meta_data->>'role','customer');
  IF requested NOT IN ('rider','customer') THEN requested := 'customer'; END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, requested::public.app_role)
  ON CONFLICT DO NOTHING;

  IF requested = 'rider' THEN
    INSERT INTO public.rider_details (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

-- CATALOG
CREATE TABLE public.vehicle_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  seat_capacity int NOT NULL DEFAULT 4,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vehicle_categories TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.vehicle_categories TO authenticated;
GRANT ALL ON public.vehicle_categories TO service_role;
ALTER TABLE public.vehicle_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  area text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.locations TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- RIDER
CREATE TABLE public.rider_details (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_category_id uuid REFERENCES public.vehicle_categories(id) ON DELETE SET NULL,
  vehicle_number text,
  vehicle_model text,
  license_number text,
  seat_capacity int NOT NULL DEFAULT 4,
  base_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  is_approved boolean NOT NULL DEFAULT false,
  is_online boolean NOT NULL DEFAULT false,
  subscription_valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rider_details TO authenticated;
GRANT ALL ON public.rider_details TO service_role;
ALTER TABLE public.rider_details ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_rider_details_updated BEFORE UPDATE ON public.rider_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.rider_subscription_active(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rider_details
    WHERE user_id = _user_id AND is_approved AND subscription_valid_until IS NOT NULL
      AND subscription_valid_until >= CURRENT_DATE
  );
$$;

-- force offline / block online without active subscription
CREATE OR REPLACE FUNCTION public.enforce_rider_online()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_online AND NOT (NEW.is_approved AND NEW.subscription_valid_until IS NOT NULL AND NEW.subscription_valid_until >= CURRENT_DATE) THEN
    NEW.is_online := false;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_enforce_rider_online BEFORE INSERT OR UPDATE ON public.rider_details FOR EACH ROW EXECUTE FUNCTION public.enforce_rider_online();

CREATE TABLE public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  months int NOT NULL DEFAULT 1 CHECK (months > 0),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date NOT NULL,
  note text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.subscription_payments TO authenticated;
GRANT ALL ON public.subscription_payments TO service_role;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rider_route_fares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  to_location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  share_fare numeric(10,2) NOT NULL CHECK (share_fare >= 0),
  reserve_fare numeric(10,2) NOT NULL CHECK (reserve_fare >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_location_id <> to_location_id),
  UNIQUE (rider_id, from_location_id, to_location_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rider_route_fares TO authenticated;
GRANT ALL ON public.rider_route_fares TO service_role;
ALTER TABLE public.rider_route_fares ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fares_updated BEFORE UPDATE ON public.rider_route_fares FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RIDES
CREATE TABLE public.rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rider_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_location_id uuid NOT NULL REFERENCES public.locations(id),
  to_location_id uuid NOT NULL REFERENCES public.locations(id),
  vehicle_category_id uuid REFERENCES public.vehicle_categories(id) ON DELETE SET NULL,
  booking_type public.booking_type NOT NULL,
  passengers int NOT NULL DEFAULT 1 CHECK (passengers > 0),
  unit_fare numeric(10,2) NOT NULL,
  total_fare numeric(10,2) NOT NULL,
  status public.ride_status NOT NULL DEFAULT 'requested',
  pickup_note text,
  cancel_reason text,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cash_collected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rides TO authenticated;
GRANT ALL ON public.rides TO service_role;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_rides_updated BEFORE UPDATE ON public.rides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_rides_customer ON public.rides(customer_id, created_at DESC);
CREATE INDEX idx_rides_rider ON public.rides(rider_id, created_at DESC);

CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL UNIQUE REFERENCES public.rides(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars int NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  admin_reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.support_requests TO authenticated;
GRANT ALL ON public.support_requests TO service_role;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_support_updated BEFORE UPDATE ON public.support_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- POLICIES
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "roles_self_select" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "categories_read" ON public.vehicle_categories FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "categories_admin_write" ON public.vehicle_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "locations_read" ON public.locations FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "locations_admin_write" ON public.locations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "rider_details_read" ON public.rider_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "rider_details_self_update" ON public.rider_details FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rider_details_self_insert" ON public.rider_details FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "subs_read" ON public.subscription_payments FOR SELECT TO authenticated USING (rider_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "subs_admin_insert" ON public.subscription_payments FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "fares_read" ON public.rider_route_fares FOR SELECT TO authenticated USING (true);
CREATE POLICY "fares_owner_write" ON public.rider_route_fares FOR ALL TO authenticated USING (rider_id = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (rider_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "rides_read" ON public.rides FOR SELECT TO authenticated USING (
  customer_id = auth.uid() OR rider_id = auth.uid() OR public.has_role(auth.uid(),'admin')
  OR (rider_id IS NULL AND status IN ('requested','searching'))
);
CREATE POLICY "rides_customer_insert" ON public.rides FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "rides_update" ON public.rides FOR UPDATE TO authenticated USING (
  customer_id = auth.uid() OR rider_id = auth.uid() OR public.has_role(auth.uid(),'admin')
  OR (rider_id IS NULL AND status IN ('requested','searching'))
) WITH CHECK (
  customer_id = auth.uid() OR rider_id = auth.uid() OR public.has_role(auth.uid(),'admin')
);

CREATE POLICY "ratings_read" ON public.ratings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ratings_customer_insert" ON public.ratings FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());

CREATE POLICY "support_read" ON public.support_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "support_insert" ON public.support_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "support_update" ON public.support_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.rides;
