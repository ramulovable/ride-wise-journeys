CREATE OR REPLACE FUNCTION public.protect_rider_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.is_verified := OLD.is_verified;
  END IF;
  RETURN NEW;
END; $function$;