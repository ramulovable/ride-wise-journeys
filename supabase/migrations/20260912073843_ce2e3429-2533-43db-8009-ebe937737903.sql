ALTER TYPE public.booking_type ADD VALUE IF NOT EXISTS 'standard';

ALTER TABLE public.vehicle_categories
  ADD COLUMN IF NOT EXISTS vehicle_class text;
UPDATE public.vehicle_categories
SET vehicle_class = CASE
  WHEN lower(name) ~ '(bike|scooter|two|motor)' THEN 'two_wheeler'
  WHEN lower(name) ~ '(e-rickshaw|rickshaw|auto|three)' THEN 'three_wheeler'
  ELSE 'four_wheeler'
END
WHERE vehicle_class IS NULL;
ALTER TABLE public.vehicle_categories ALTER COLUMN vehicle_class SET NOT NULL;
ALTER TABLE public.vehicle_categories DROP CONSTRAINT IF EXISTS vehicle_categories_vehicle_class_check;
ALTER TABLE public.vehicle_categories ADD CONSTRAINT vehicle_categories_vehicle_class_check
  CHECK (vehicle_class IN ('two_wheeler','three_wheeler','four_wheeler'));

CREATE TABLE public.vehicle_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.vehicle_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, name)
);
GRANT SELECT ON public.vehicle_brands TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vehicle_brands TO authenticated;
GRANT ALL ON public.vehicle_brands TO service_role;
ALTER TABLE public.vehicle_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicle_brands_read" ON public.vehicle_brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "vehicle_brands_admin_write" ON public.vehicle_brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_vehicle_brands_updated BEFORE UPDATE ON public.vehicle_brands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.vehicle_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.vehicle_brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  seat_capacity int NOT NULL DEFAULT 4 CHECK (seat_capacity BETWEEN 1 AND 20),
  supports_ac boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, name)
);
GRANT SELECT ON public.vehicle_models TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vehicle_models TO authenticated;
GRANT ALL ON public.vehicle_models TO service_role;
ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicle_models_read" ON public.vehicle_models FOR SELECT TO authenticated USING (true);
CREATE POLICY "vehicle_models_admin_write" ON public.vehicle_models FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_vehicle_models_updated BEFORE UPDATE ON public.vehicle_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rider_vehicles
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.vehicle_brands(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES public.vehicle_models(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS has_ac boolean NOT NULL DEFAULT false;

CREATE TABLE public.fare_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_class text NOT NULL CHECK (vehicle_class IN ('two_wheeler','three_wheeler','four_wheeler')),
  journey_type text NOT NULL CHECK (journey_type IN ('standard','share','reserve')),
  ac_option text NOT NULL DEFAULT 'any' CHECK (ac_option IN ('any','ac','non_ac')),
  rate_per_km numeric(10,2) CHECK (rate_per_km IS NULL OR rate_per_km > 0),
  included_km numeric(10,2) CHECK (included_km IS NULL OR included_km >= 0),
  extra_km_rate numeric(10,2) CHECK (extra_km_rate IS NULL OR extra_km_rate >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vehicle_class, journey_type, ac_option)
);
GRANT SELECT ON public.fare_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fare_rules TO authenticated;
GRANT ALL ON public.fare_rules TO service_role;
ALTER TABLE public.fare_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fare_rules_read" ON public.fare_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "fare_rules_admin_write" ON public.fare_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_fare_rules_updated BEFORE UPDATE ON public.fare_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fare_slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fare_rule_id uuid NOT NULL REFERENCES public.fare_rules(id) ON DELETE CASCADE,
  min_km numeric(10,2) NOT NULL CHECK (min_km >= 0),
  max_km numeric(10,2) NOT NULL CHECK (max_km > min_km),
  pricing_mode text NOT NULL CHECK (pricing_mode IN ('flat_per_passenger','per_km')),
  rate numeric(10,2) NOT NULL CHECK (rate > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fare_rule_id, min_km, max_km)
);
GRANT SELECT ON public.fare_slabs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fare_slabs TO authenticated;
GRANT ALL ON public.fare_slabs TO service_role;
ALTER TABLE public.fare_slabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fare_slabs_read" ON public.fare_slabs FOR SELECT TO authenticated USING (true);
CREATE POLICY "fare_slabs_admin_write" ON public.fare_slabs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_fare_slabs_updated BEFORE UPDATE ON public.fare_slabs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_audit_logs_admin_read" ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin_audit_logs_admin_insert" ON public.admin_audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND public.has_role(auth.uid(),'admin'));

CREATE TABLE public.ride_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  from_status public.ride_status,
  to_status public.ride_status NOT NULL,
  actor_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ride_status_history TO authenticated;
GRANT ALL ON public.ride_status_history TO service_role;
ALTER TABLE public.ride_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ride_status_history_participant_read" ON public.ride_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_id AND (r.customer_id = auth.uid() OR r.rider_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS distance_km numeric(10,2),
  ADD COLUMN IF NOT EXISTS duration_minutes int,
  ADD COLUMN IF NOT EXISTS requested_vehicle_class text,
  ADD COLUMN IF NOT EXISTS requested_category_id uuid REFERENCES public.vehicle_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_ac boolean,
  ADD COLUMN IF NOT EXISTS fare_snapshot jsonb;
ALTER TABLE public.rides DROP CONSTRAINT IF EXISTS rides_requested_vehicle_class_check;
ALTER TABLE public.rides ADD CONSTRAINT rides_requested_vehicle_class_check
  CHECK (requested_vehicle_class IS NULL OR requested_vehicle_class IN ('two_wheeler','three_wheeler','four_wheeler'));

CREATE OR REPLACE FUNCTION public.log_ride_status_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ride_status_history(ride_id, from_status, to_status, actor_id, reason)
    VALUES (NEW.id, NULL, NEW.status, auth.uid(), NEW.cancel_reason);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.ride_status_history(ride_id, from_status, to_status, actor_id, reason)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), NEW.cancel_reason);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.log_ride_status_history() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_ride_status_history ON public.rides;
CREATE TRIGGER trg_ride_status_history AFTER INSERT OR UPDATE OF status ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.log_ride_status_history();

CREATE OR REPLACE FUNCTION public.accept_broadcast_ride(_ride_id uuid, _vehicle_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE won boolean;
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.rider_details rd
    JOIN public.rider_vehicles rv ON rv.rider_id = rd.user_id
    JOIN public.rides r ON r.id = _ride_id
    WHERE rd.user_id = uid AND rd.is_approved AND NOT rd.is_blocked AND rd.is_online
      AND rd.subscription_valid_until >= CURRENT_DATE
      AND rv.id = _vehicle_id AND rv.rider_id = uid AND rv.is_active
      AND rv.vehicle_category_id = r.requested_category_id
      AND (r.requested_ac IS NULL OR rv.has_ac = r.requested_ac)
  ) THEN RAISE EXCEPTION 'Vehicle is not eligible for this booking'; END IF;
  UPDATE public.rides SET rider_id = uid, vehicle_id = _vehicle_id,
    vehicle_category_id = requested_category_id, status = 'accepted', accepted_at = now()
  WHERE id = _ride_id AND rider_id IS NULL AND status IN ('requested','searching');
  GET DIAGNOSTICS won = ROW_COUNT;
  RETURN won;
END; $$;
REVOKE ALL ON FUNCTION public.accept_broadcast_ride(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_broadcast_ride(uuid,uuid) TO authenticated, service_role;

INSERT INTO public.fare_rules(vehicle_class, journey_type, ac_option, rate_per_km, included_km, extra_km_rate)
VALUES
 ('two_wheeler','standard','any',30,5,30),
 ('three_wheeler','share','any',NULL,NULL,10),
 ('three_wheeler','reserve','any',NULL,NULL,10),
 ('four_wheeler','standard','ac',NULL,NULL,NULL),
 ('four_wheeler','standard','non_ac',NULL,NULL,NULL)
ON CONFLICT (vehicle_class,journey_type,ac_option) DO NOTHING;

INSERT INTO public.fare_slabs(fare_rule_id,min_km,max_km,pricing_mode,rate)
SELECT id,0,5,'flat_per_passenger',30 FROM public.fare_rules WHERE vehicle_class='three_wheeler' AND journey_type='share' AND ac_option='any'
ON CONFLICT DO NOTHING;
INSERT INTO public.fare_slabs(fare_rule_id,min_km,max_km,pricing_mode,rate)
SELECT id,20,35,'flat_per_passenger',50 FROM public.fare_rules WHERE vehicle_class='three_wheeler' AND journey_type='share' AND ac_option='any'
ON CONFLICT DO NOTHING;
INSERT INTO public.fare_slabs(fare_rule_id,min_km,max_km,pricing_mode,rate)
SELECT id,0,5,'per_km',20 FROM public.fare_rules WHERE vehicle_class='three_wheeler' AND journey_type='reserve' AND ac_option='any'
ON CONFLICT DO NOTHING;
INSERT INTO public.fare_slabs(fare_rule_id,min_km,max_km,pricing_mode,rate)
SELECT id,20,35,'per_km',30 FROM public.fare_rules WHERE vehicle_class='three_wheeler' AND journey_type='reserve' AND ac_option='any'
ON CONFLICT DO NOTHING;

REVOKE INSERT, UPDATE, DELETE ON public.rider_route_fares FROM authenticated;
DROP POLICY IF EXISTS "fares_owner_write" ON public.rider_route_fares;
CREATE POLICY "fares_admin_legacy_write" ON public.rider_route_fares FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_vehicle_brands_category ON public.vehicle_brands(category_id,is_active);
CREATE INDEX IF NOT EXISTS idx_vehicle_models_brand ON public.vehicle_models(brand_id,is_active);
CREATE INDEX IF NOT EXISTS idx_fare_slabs_rule_distance ON public.fare_slabs(fare_rule_id,min_km,max_km) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_rides_broadcast ON public.rides(requested_category_id,status,created_at) WHERE rider_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ride_status_history_ride ON public.ride_status_history(ride_id,created_at);