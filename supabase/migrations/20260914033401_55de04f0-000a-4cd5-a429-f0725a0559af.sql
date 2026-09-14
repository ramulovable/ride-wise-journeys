CREATE TABLE public.day_night_pricing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled boolean NOT NULL DEFAULT true,
  day_start_time time NOT NULL DEFAULT '05:00',
  night_start_time time NOT NULL DEFAULT '20:00',
  pricing_mode text NOT NULL DEFAULT 'multiplier' CHECK (pricing_mode IN ('multiplier','direct_rate')),
  night_multiplier numeric NOT NULL DEFAULT 2.0 CHECK (night_multiplier > 0),
  night_direct_rate numeric CHECK (night_direct_rate IS NULL OR night_direct_rate > 0),
  applies_to_per_km boolean NOT NULL DEFAULT true,
  applies_to_share boolean NOT NULL DEFAULT true,
  applies_to_reserve boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.day_night_pricing_config TO authenticated;
GRANT ALL ON public.day_night_pricing_config TO service_role;

ALTER TABLE public.day_night_pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view day night config"
ON public.day_night_pricing_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage day night config"
ON public.day_night_pricing_config FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.day_night_vehicle_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_category_id uuid NOT NULL UNIQUE REFERENCES public.vehicle_categories(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  pricing_mode text NOT NULL DEFAULT 'multiplier' CHECK (pricing_mode IN ('multiplier','direct_rate')),
  night_multiplier numeric CHECK (night_multiplier IS NULL OR night_multiplier > 0),
  night_direct_rate numeric CHECK (night_direct_rate IS NULL OR night_direct_rate > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.day_night_vehicle_overrides TO authenticated;
GRANT ALL ON public.day_night_vehicle_overrides TO service_role;

ALTER TABLE public.day_night_vehicle_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view day night overrides"
ON public.day_night_vehicle_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage day night overrides"
ON public.day_night_vehicle_overrides FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_day_night_config_updated BEFORE UPDATE ON public.day_night_pricing_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_day_night_overrides_updated BEFORE UPDATE ON public.day_night_vehicle_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_day_night_config_history AFTER INSERT OR UPDATE OR DELETE ON public.day_night_pricing_config
FOR EACH ROW EXECUTE FUNCTION public.log_fare_change();

CREATE TRIGGER trg_day_night_overrides_history AFTER INSERT OR UPDATE OR DELETE ON public.day_night_vehicle_overrides
FOR EACH ROW EXECUTE FUNCTION public.log_fare_change();

CREATE TRIGGER trg_audit_day_night_config AFTER INSERT OR UPDATE OR DELETE ON public.day_night_pricing_config
FOR EACH ROW EXECUTE FUNCTION public.audit_admin_catalog_change();

CREATE TRIGGER trg_audit_day_night_overrides AFTER INSERT OR UPDATE OR DELETE ON public.day_night_vehicle_overrides
FOR EACH ROW EXECUTE FUNCTION public.audit_admin_catalog_change();

INSERT INTO public.day_night_pricing_config (is_enabled) VALUES (true);