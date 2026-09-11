ALTER TABLE public.rider_route_fares
ADD CONSTRAINT rider_route_fares_rider_vehicle_route_key
UNIQUE (rider_id, vehicle_id, from_location_id, to_location_id);