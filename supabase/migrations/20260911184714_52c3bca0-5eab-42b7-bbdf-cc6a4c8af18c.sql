ALTER TABLE public.rider_details
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

REVOKE UPDATE ON public.rider_details FROM authenticated;
GRANT UPDATE (vehicle_category_id, vehicle_number, vehicle_model, license_number, seat_capacity, base_location_id, is_online) ON public.rider_details TO authenticated;

CREATE TABLE public.rider_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_category_id uuid NOT NULL REFERENCES public.vehicle_categories(id) ON DELETE RESTRICT,
  vehicle_number text NOT NULL,
  vehicle_model text,
  license_number text,
  seat_capacity int NOT NULL DEFAULT 4 CHECK (seat_capacity > 0 AND seat_capacity <= 20),
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  qr_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rider_id, vehicle_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rider_vehicles TO authenticated;
GRANT ALL ON public.rider_vehicles TO service_role;
ALTER TABLE public.rider_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rider_vehicles_read" ON public.rider_vehicles FOR SELECT TO authenticated
USING (is_active OR rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "rider_vehicles_owner_insert" ON public.rider_vehicles FOR INSERT TO authenticated
WITH CHECK (rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "rider_vehicles_owner_update" ON public.rider_vehicles FOR UPDATE TO authenticated
USING (rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "rider_vehicles_owner_delete" ON public.rider_vehicles FOR DELETE TO authenticated
USING (rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_rider_vehicles_updated BEFORE UPDATE ON public.rider_vehicles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rider_route_fares
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.rider_vehicles(id) ON DELETE CASCADE;
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.rider_vehicles(id) ON DELETE SET NULL;

ALTER TABLE public.rider_route_fares
  DROP CONSTRAINT IF EXISTS rider_route_fares_rider_id_from_location_id_to_location_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS rider_route_fares_vehicle_direction_unique
  ON public.rider_route_fares(vehicle_id, from_location_id, to_location_id)
  WHERE vehicle_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rider_route_fares_legacy_direction_unique
  ON public.rider_route_fares(rider_id, from_location_id, to_location_id)
  WHERE vehicle_id IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_rider_online()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_online AND NOT (
    NEW.is_approved
    AND NOT NEW.is_blocked
    AND NEW.subscription_valid_until IS NOT NULL
    AND NEW.subscription_valid_until >= CURRENT_DATE
  ) THEN
    NEW.is_online := false;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.rider_subscription_active(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rider_details
    WHERE user_id = _user_id
      AND is_approved
      AND NOT is_blocked
      AND subscription_valid_until IS NOT NULL
      AND subscription_valid_until >= CURRENT_DATE
  );
$$;
REVOKE ALL ON FUNCTION public.rider_subscription_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_subscription_active(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.keep_single_primary_vehicle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE public.rider_vehicles SET is_primary = false
    WHERE rider_id = NEW.rider_id AND id <> NEW.id AND is_primary;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.keep_single_primary_vehicle() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_single_primary_vehicle
AFTER INSERT OR UPDATE OF is_primary ON public.rider_vehicles
FOR EACH ROW WHEN (NEW.is_primary) EXECUTE FUNCTION public.keep_single_primary_vehicle();

CREATE INDEX IF NOT EXISTS idx_rider_vehicles_rider ON public.rider_vehicles(rider_id, is_active);
CREATE INDEX IF NOT EXISTS idx_fares_vehicle ON public.rider_route_fares(vehicle_id, is_active);
CREATE INDEX IF NOT EXISTS idx_rides_vehicle ON public.rides(vehicle_id, created_at DESC);