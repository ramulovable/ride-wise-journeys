CREATE TABLE IF NOT EXISTS public.ride_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_screen_enabled boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT true,
  vibration_enabled boolean NOT NULL DEFAULT true,
  alert_sound text NOT NULL DEFAULT 'chime',
  alert_duration_seconds integer NOT NULL DEFAULT 30,
  response_timeout_seconds integer NOT NULL DEFAULT 60,
  max_riders_notified integer NOT NULL DEFAULT 5,
  retry_interval_seconds integer NOT NULL DEFAULT 15,
  notification_priority text NOT NULL DEFAULT 'high',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ride_alert_settings TO authenticated;
GRANT INSERT, UPDATE ON public.ride_alert_settings TO authenticated;
GRANT ALL ON public.ride_alert_settings TO service_role;

ALTER TABLE public.ride_alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users read ride alert settings" ON public.ride_alert_settings;
CREATE POLICY "Signed-in users read ride alert settings" ON public.ride_alert_settings
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage ride alert settings" ON public.ride_alert_settings;
CREATE POLICY "Admins manage ride alert settings" ON public.ride_alert_settings
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS set_ride_alert_settings_updated_at ON public.ride_alert_settings;
CREATE TRIGGER set_ride_alert_settings_updated_at
BEFORE UPDATE ON public.ride_alert_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ride_alert_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.ride_alert_settings);