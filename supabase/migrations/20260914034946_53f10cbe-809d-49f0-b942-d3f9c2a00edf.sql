CREATE TABLE public.three_wheeler_reserve_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled boolean NOT NULL DEFAULT true,
  min_km numeric NOT NULL DEFAULT 15.00,
  max_km numeric NOT NULL DEFAULT 35.00,
  fixed_fare numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.three_wheeler_reserve_config TO authenticated;
GRANT ALL ON public.three_wheeler_reserve_config TO service_role;

ALTER TABLE public.three_wheeler_reserve_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read reserve config"
ON public.three_wheeler_reserve_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage reserve config"
ON public.three_wheeler_reserve_config FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_three_wheeler_reserve_config_updated_at
BEFORE UPDATE ON public.three_wheeler_reserve_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER log_three_wheeler_reserve_config_changes
AFTER INSERT OR UPDATE OR DELETE ON public.three_wheeler_reserve_config
FOR EACH ROW EXECUTE FUNCTION public.log_fare_change();

INSERT INTO public.three_wheeler_reserve_config (is_enabled, min_km, max_km, fixed_fare)
VALUES (true, 15.00, 35.00, 0);