
ALTER TABLE public.rider_vehicles ADD COLUMN IF NOT EXISTS brand_name text;

CREATE TABLE IF NOT EXISTS public.ride_driver_locations (
  ride_id uuid PRIMARY KEY REFERENCES public.rides(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  heading double precision,
  speed double precision,
  accuracy double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ride_driver_locations TO authenticated;
GRANT ALL ON public.ride_driver_locations TO service_role;

ALTER TABLE public.ride_driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers write their own ride location"
ON public.ride_driver_locations FOR INSERT TO authenticated
WITH CHECK (
  rider_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_id AND r.rider_id = auth.uid())
);

CREATE POLICY "Drivers update their own ride location"
ON public.ride_driver_locations FOR UPDATE TO authenticated
USING (rider_id = auth.uid())
WITH CHECK (rider_id = auth.uid());

CREATE POLICY "Ride participants read the live location"
ON public.ride_driver_locations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rides r
    WHERE r.id = ride_id AND (r.rider_id = auth.uid() OR r.customer_id = auth.uid())
  )
);

CREATE TRIGGER trg_ride_driver_locations_updated
BEFORE UPDATE ON public.ride_driver_locations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_driver_locations;
