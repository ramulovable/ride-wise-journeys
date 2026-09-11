CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  numeric_value numeric NOT NULL CHECK (numeric_value >= 0),
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_authenticated_read"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "app_settings_admin_update"
ON public.app_settings
FOR UPDATE
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();