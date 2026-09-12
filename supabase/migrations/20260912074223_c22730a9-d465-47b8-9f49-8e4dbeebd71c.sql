CREATE OR REPLACE FUNCTION public.advance_rider_ride(_ride_id uuid, _action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _expected public.ride_status;
  _next public.ride_status;
BEGIN
  CASE _action
    WHEN 'on_the_way' THEN _expected := 'accepted'; _next := 'on_the_way';
    WHEN 'arrived' THEN _expected := 'on_the_way'; _next := 'arrived';
    WHEN 'started' THEN _expected := 'arrived'; _next := 'started';
    WHEN 'completed' THEN _expected := 'started'; _next := 'completed';
    ELSE RAISE EXCEPTION 'Invalid ride action';
  END CASE;

  UPDATE public.rides
  SET status = _next,
      cash_collected = CASE WHEN _next = 'completed' THEN true ELSE cash_collected END
  WHERE id = _ride_id
    AND rider_id = auth.uid()
    AND status = _expected;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_rider_ride(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_rider_ride(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_rider_ride(uuid, text) TO service_role;