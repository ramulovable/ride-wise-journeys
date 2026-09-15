ALTER TABLE public.rider_details ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.protect_rider_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.is_verified := OLD.is_verified;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_protect_rider_verified ON public.rider_details;
CREATE TRIGGER trg_protect_rider_verified
BEFORE UPDATE ON public.rider_details
FOR EACH ROW EXECUTE FUNCTION public.protect_rider_verified();