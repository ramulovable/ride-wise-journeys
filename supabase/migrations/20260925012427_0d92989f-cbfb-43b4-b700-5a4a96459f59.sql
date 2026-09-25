DROP POLICY IF EXISTS "Signed-in users read ride alert settings" ON public.ride_alert_settings;
CREATE POLICY "Riders and admins read ride alert settings"
ON public.ride_alert_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'rider'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

REVOKE ALL ON public.mobile_otps FROM anon, authenticated;
REVOKE ALL ON public.user_security FROM anon, authenticated;
GRANT ALL ON public.mobile_otps TO service_role;
GRANT ALL ON public.user_security TO service_role;