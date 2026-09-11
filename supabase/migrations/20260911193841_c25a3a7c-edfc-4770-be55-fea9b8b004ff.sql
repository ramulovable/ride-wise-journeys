DROP POLICY IF EXISTS "profiles_visible_select" ON public.profiles;
CREATE POLICY "profiles_visible_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR private.has_role(auth.uid(), 'admin')
  OR private.shares_ride_with(id)
);

DROP POLICY IF EXISTS "ratings_read" ON public.ratings;
CREATE POLICY "ratings_participant_read"
ON public.ratings
FOR SELECT
TO authenticated
USING (
  customer_id = auth.uid()
  OR rider_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "rider_details_read" ON public.rider_details;
CREATE POLICY "rider_details_authorized_read"
ON public.rider_details
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin')
  OR private.shares_ride_with(user_id)
);

DROP POLICY IF EXISTS "fares_read" ON public.rider_route_fares;
CREATE POLICY "fares_active_or_owner_read"
ON public.rider_route_fares
FOR SELECT
TO authenticated
USING (
  is_active
  OR rider_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin')
);

CREATE OR REPLACE VIEW public.available_rider_offers
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  fare.rider_id,
  fare.vehicle_id,
  fare.from_location_id,
  fare.to_location_id,
  profile.full_name AS rider_name,
  vehicle.vehicle_category_id,
  vehicle.vehicle_number,
  vehicle.seat_capacity,
  fare.share_fare,
  fare.reserve_fare,
  COALESCE(rating.average_rating, 0::numeric) AS average_rating,
  COALESCE(rating.rating_count, 0::bigint) AS rating_count
FROM public.rider_route_fares AS fare
JOIN public.rider_details AS rider ON rider.user_id = fare.rider_id
JOIN public.profiles AS profile ON profile.id = fare.rider_id
JOIN public.rider_vehicles AS vehicle
  ON vehicle.id = fare.vehicle_id
 AND vehicle.rider_id = fare.rider_id
LEFT JOIN (
  SELECT rider_id, avg(stars::numeric) AS average_rating, count(*) AS rating_count
  FROM public.ratings
  GROUP BY rider_id
) AS rating ON rating.rider_id = fare.rider_id
WHERE fare.is_active
  AND vehicle.is_active
  AND rider.is_approved
  AND NOT rider.is_blocked
  AND rider.is_online
  AND rider.subscription_valid_until IS NOT NULL
  AND rider.subscription_valid_until >= CURRENT_DATE;

REVOKE ALL ON public.available_rider_offers FROM PUBLIC, anon;
GRANT SELECT ON public.available_rider_offers TO authenticated;
GRANT ALL ON public.available_rider_offers TO service_role;