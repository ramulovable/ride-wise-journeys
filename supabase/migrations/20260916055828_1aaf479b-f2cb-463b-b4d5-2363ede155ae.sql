CREATE TABLE public.dispatch_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_enabled boolean NOT NULL DEFAULT true,
  nearby_dispatch_enabled boolean NOT NULL DEFAULT true,
  en_route_matching_enabled boolean NOT NULL DEFAULT true,
  pickup_radius_km numeric NOT NULL DEFAULT 3,
  route_corridor_km numeric NOT NULL DEFAULT 1.5,
  max_pickup_detour_km numeric NOT NULL DEFAULT 3,
  max_additional_minutes numeric NOT NULL DEFAULT 12,
  max_location_age_seconds integer NOT NULL DEFAULT 180,
  max_gps_accuracy_meters integer NOT NULL DEFAULT 200,
  dispatch_priority text NOT NULL DEFAULT 'combined_matching',
  reserve_exclusive boolean NOT NULL DEFAULT true,
  max_share_passengers integer NOT NULL DEFAULT 0,
  weight_pickup_proximity numeric NOT NULL DEFAULT 1,
  weight_detour numeric NOT NULL DEFAULT 1,
  weight_additional_time numeric NOT NULL DEFAULT 1,
  weight_capacity numeric NOT NULL DEFAULT 0.5,
  require_location_for_dispatch boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_priority_valid CHECK (dispatch_priority IN ('nearest_available_first','en_route_first','combined_matching'))
);
GRANT SELECT ON public.dispatch_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.dispatch_settings TO authenticated;
GRANT ALL ON public.dispatch_settings TO service_role;
ALTER TABLE public.dispatch_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read dispatch settings" ON public.dispatch_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage dispatch settings" ON public.dispatch_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_dispatch_settings_updated BEFORE UPDATE ON public.dispatch_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dispatch_settings_audit AFTER INSERT OR UPDATE OR DELETE ON public.dispatch_settings FOR EACH ROW EXECUTE FUNCTION public.audit_admin_catalog_change();
INSERT INTO public.dispatch_settings DEFAULT VALUES;

CREATE TABLE public.rider_presence (
  rider_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offline',
  current_latitude double precision,
  current_longitude double precision,
  current_accuracy_meters double precision,
  active_vehicle_id uuid REFERENCES public.rider_vehicles(id) ON DELETE SET NULL,
  active_ride_id uuid REFERENCES public.rides(id) ON DELETE SET NULL,
  last_location_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rider_presence_status_valid CHECK (status IN ('offline','online_available','online_on_ride'))
);
GRANT SELECT, INSERT, UPDATE ON public.rider_presence TO authenticated;
GRANT ALL ON public.rider_presence TO service_role;
ALTER TABLE public.rider_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers manage own presence" ON public.rider_presence FOR ALL TO authenticated USING (rider_id = auth.uid()) WITH CHECK (rider_id = auth.uid());
CREATE POLICY "Admins read all presence" ON public.rider_presence FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_rider_presence_updated BEFORE UPDATE ON public.rider_presence FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.rider_live_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.rider_vehicles(id) ON DELETE SET NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_meters double precision,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rider_live_locations_rider_time ON public.rider_live_locations (rider_id, recorded_at DESC);
GRANT SELECT, INSERT ON public.rider_live_locations TO authenticated;
GRANT ALL ON public.rider_live_locations TO service_role;
ALTER TABLE public.rider_live_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers insert own locations" ON public.rider_live_locations FOR INSERT TO authenticated WITH CHECK (rider_id = auth.uid());
CREATE POLICY "Drivers read own locations" ON public.rider_live_locations FOR SELECT TO authenticated USING (rider_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.ride_route_state (
  ride_id uuid PRIMARY KEY REFERENCES public.rides(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.rider_vehicles(id) ON DELETE SET NULL,
  origin_latitude double precision,
  origin_longitude double precision,
  destination_latitude double precision,
  destination_longitude double precision,
  route_geometry jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_latitude double precision,
  current_longitude double precision,
  route_progress numeric NOT NULL DEFAULT 0,
  remaining_distance_km numeric,
  remaining_duration_minutes numeric,
  occupied_passenger_count integer NOT NULL DEFAULT 0,
  remaining_capacity integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ride_route_state_rider ON public.ride_route_state (rider_id, is_active);
GRANT SELECT, INSERT, UPDATE ON public.ride_route_state TO authenticated;
GRANT ALL ON public.ride_route_state TO service_role;
ALTER TABLE public.ride_route_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers manage own route state" ON public.ride_route_state FOR ALL TO authenticated USING (rider_id = auth.uid()) WITH CHECK (rider_id = auth.uid());
CREATE POLICY "Admins read route state" ON public.ride_route_state FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_ride_route_state_updated BEFORE UPDATE ON public.ride_route_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ride_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.rider_vehicles(id) ON DELETE SET NULL,
  stop_type text NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  latitude double precision,
  longitude double precision,
  sequence_order integer NOT NULL DEFAULT 0,
  passenger_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_route_stops_type_valid CHECK (stop_type IN ('pickup','drop')),
  CONSTRAINT ride_route_stops_status_valid CHECK (status IN ('pending','done','cancelled')),
  CONSTRAINT ride_route_stops_unique UNIQUE (ride_id, stop_type)
);
CREATE INDEX idx_ride_route_stops_rider ON public.ride_route_stops (rider_id, sequence_order);
GRANT SELECT, INSERT, UPDATE ON public.ride_route_stops TO authenticated;
GRANT ALL ON public.ride_route_stops TO service_role;
ALTER TABLE public.ride_route_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers manage own stops" ON public.ride_route_stops FOR ALL TO authenticated USING (rider_id = auth.uid()) WITH CHECK (rider_id = auth.uid());
CREATE POLICY "Admins read stops" ON public.ride_route_stops FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_ride_route_stops_updated BEFORE UPDATE ON public.ride_route_stops FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.en_route_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  active_ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.rider_vehicles(id) ON DELETE SET NULL,
  pickup_detour_km numeric,
  route_deviation_km numeric,
  additional_duration_minutes numeric,
  compatibility_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'offered',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT en_route_matches_status_valid CHECK (status IN ('offered','accepted','rejected','expired')),
  CONSTRAINT en_route_matches_unique UNIQUE (new_ride_id, rider_id)
);
CREATE INDEX idx_en_route_matches_rider ON public.en_route_matches (rider_id, status);
GRANT SELECT, INSERT, UPDATE ON public.en_route_matches TO authenticated;
GRANT ALL ON public.en_route_matches TO service_role;
ALTER TABLE public.en_route_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers read own matches" ON public.en_route_matches FOR SELECT TO authenticated USING (rider_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Drivers update own matches" ON public.en_route_matches FOR UPDATE TO authenticated USING (rider_id = auth.uid()) WITH CHECK (rider_id = auth.uid());
CREATE TRIGGER trg_en_route_matches_updated BEFORE UPDATE ON public.en_route_matches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_text_settings (key, value, description) VALUES
  ('enroute_push_title_template', 'En-route share ride request', 'Title for en-route share ride alerts'),
  ('enroute_push_body_template', 'Pickup {pickup} on your way to {drop} · {distance} km · Rs {fare}', 'Body for en-route share ride alerts')
ON CONFLICT (key) DO NOTHING;