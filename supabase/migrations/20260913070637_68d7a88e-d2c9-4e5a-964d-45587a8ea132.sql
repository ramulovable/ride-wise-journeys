CREATE UNIQUE INDEX IF NOT EXISTS ratings_ride_id_key ON public.ratings(ride_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE requested text;
BEGIN
  INSERT INTO public.profiles (id, mobile, full_name, address, referral_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'mobile', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name',''),
    NULLIF(NEW.raw_user_meta_data->>'address',''),
    NULLIF(NEW.raw_user_meta_data->>'referral_code','')
  ) ON CONFLICT (id) DO NOTHING;

  requested := COALESCE(NEW.raw_user_meta_data->>'role','customer');
  IF requested NOT IN ('rider','customer') THEN requested := 'customer'; END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, requested::public.app_role)
  ON CONFLICT DO NOTHING;

  IF requested = 'rider' THEN
    INSERT INTO public.rider_details (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $function$;