ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS on_the_way_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS arrived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.stamp_ride_status_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE NEW.status
      WHEN 'accepted' THEN NEW.accepted_at := COALESCE(NEW.accepted_at, now());
      WHEN 'on_the_way' THEN NEW.on_the_way_at := COALESCE(NEW.on_the_way_at, now());
      WHEN 'arrived' THEN NEW.arrived_at := COALESCE(NEW.arrived_at, now());
      WHEN 'started' THEN NEW.started_at := COALESCE(NEW.started_at, now());
      WHEN 'completed' THEN NEW.completed_at := COALESCE(NEW.completed_at, now());
      WHEN 'cancelled' THEN NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_stamp_ride_status_timestamps ON public.rides;
CREATE TRIGGER trg_stamp_ride_status_timestamps
BEFORE UPDATE OF status ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.stamp_ride_status_timestamps();