DROP INDEX IF EXISTS public.locations_provider_place_id_unique;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_provider_place_id_key UNIQUE (provider_place_id);

ALTER TABLE public.rider_route_fares
  ADD COLUMN distance_km numeric(10,1),
  ADD COLUMN duration_minutes integer,
  ADD CONSTRAINT rider_route_fares_distance_check CHECK (distance_km IS NULL OR distance_km > 0),
  ADD CONSTRAINT rider_route_fares_duration_check CHECK (duration_minutes IS NULL OR duration_minutes > 0);