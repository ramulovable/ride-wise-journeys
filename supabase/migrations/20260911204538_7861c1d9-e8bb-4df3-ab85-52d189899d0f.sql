ALTER TABLE public.locations
  ADD COLUMN provider_place_id text,
  ADD COLUMN formatted_address text,
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN source text NOT NULL DEFAULT 'preset';

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_name_key;

ALTER TABLE public.locations
  ADD CONSTRAINT locations_source_check CHECK (source IN ('preset', 'google')),
  ADD CONSTRAINT locations_latitude_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT locations_longitude_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

CREATE UNIQUE INDEX locations_provider_place_id_unique
  ON public.locations(provider_place_id)
  WHERE provider_place_id IS NOT NULL;

CREATE INDEX locations_name_search_idx ON public.locations(lower(name));

COMMENT ON COLUMN public.locations.provider_place_id IS 'Canonical external place identifier for live search results';
COMMENT ON COLUMN public.locations.formatted_address IS 'Full human-readable address for disambiguation';
COMMENT ON COLUMN public.locations.source IS 'Whether the location is an original preset or selected from Google Places';