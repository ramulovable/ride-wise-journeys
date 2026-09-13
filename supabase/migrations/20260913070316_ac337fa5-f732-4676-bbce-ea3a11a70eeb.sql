-- 1. New ride status
ALTER TYPE public.ride_status ADD VALUE IF NOT EXISTS 'no_rider_available';

-- 2. Locations PIN + profile referral code
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS pin_code text;
UPDATE public.locations SET pin_code = '847104' WHERE lower(name) LIKE 'bharwara%';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text;

-- 3. Vehicle segments
CREATE TABLE IF NOT EXISTS public.vehicle_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  vehicle_class text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vehicle_segments TO authenticated;
GRANT ALL ON public.vehicle_segments TO service_role;
ALTER TABLE public.vehicle_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "segments readable" ON public.vehicle_segments FOR SELECT TO authenticated USING (true);
CREATE POLICY "segments admin write" ON public.vehicle_segments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_vehicle_segments_updated BEFORE UPDATE ON public.vehicle_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.vehicle_categories ADD COLUMN IF NOT EXISTS segment_id uuid REFERENCES public.vehicle_segments(id);

-- 4. Model variants
CREATE TABLE IF NOT EXISTS public.vehicle_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.vehicle_models(id) ON DELETE CASCADE,
  name text NOT NULL,
  seat_capacity integer NOT NULL DEFAULT 4,
  supports_ac boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, name)
);
GRANT SELECT ON public.vehicle_variants TO authenticated;
GRANT ALL ON public.vehicle_variants TO service_role;
ALTER TABLE public.vehicle_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "variants readable" ON public.vehicle_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "variants admin write" ON public.vehicle_variants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_vehicle_variants_updated BEFORE UPDATE ON public.vehicle_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rider_vehicles ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.vehicle_variants(id);

-- 5. Text settings (support contacts)
CREATE TABLE IF NOT EXISTS public.app_text_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.app_text_settings TO authenticated;
GRANT SELECT ON public.app_text_settings TO anon;
GRANT ALL ON public.app_text_settings TO service_role;
ALTER TABLE public.app_text_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable" ON public.app_text_settings FOR SELECT USING (true);
CREATE POLICY "settings admin update" ON public.app_text_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_app_text_settings_updated BEFORE UPDATE ON public.app_text_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.app_text_settings(key, value, description) VALUES
  ('support_phone','9334039007','Support and WhatsApp contact number'),
  ('support_email','ayankha8866@gmail.com','Support email address')
ON CONFLICT (key) DO NOTHING;

-- 6. Fare change history
CREATE TABLE IF NOT EXISTS public.fare_rule_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  table_name text NOT NULL,
  action text NOT NULL,
  target_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fare_rule_history TO authenticated;
GRANT ALL ON public.fare_rule_history TO service_role;
ALTER TABLE public.fare_rule_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fare history admin read" ON public.fare_rule_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.log_fare_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.fare_rule_history(actor_id, table_name, action, target_id, before_data, after_data)
  VALUES (
    auth.uid(), TG_TABLE_NAME, lower(TG_OP), COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_fare_rules_history ON public.fare_rules;
CREATE TRIGGER trg_fare_rules_history AFTER INSERT OR UPDATE OR DELETE ON public.fare_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_fare_change();
DROP TRIGGER IF EXISTS trg_fare_slabs_history ON public.fare_slabs;
CREATE TRIGGER trg_fare_slabs_history AFTER INSERT OR UPDATE OR DELETE ON public.fare_slabs
  FOR EACH ROW EXECUTE FUNCTION public.log_fare_change();

-- 7. Seed segments and starter brands
INSERT INTO public.vehicle_segments(name, vehicle_class, sort_order) VALUES
  ('Two Wheeler','two_wheeler',1),
  ('Three Wheeler','three_wheeler',2),
  ('Four Wheeler','four_wheeler',3)
ON CONFLICT (name) DO NOTHING;

UPDATE public.vehicle_categories c
SET segment_id = s.id
FROM public.vehicle_segments s
WHERE s.vehicle_class = c.vehicle_class AND c.segment_id IS NULL;

INSERT INTO public.vehicle_brands (category_id, name)
SELECT c.id, b.name
FROM public.vehicle_categories c
JOIN (VALUES
  ('two_wheeler','Bike'),('two_wheeler','Scooty'),
  ('three_wheeler','E-Rickshaw'),('three_wheeler','Auto Rickshaw'),('three_wheeler','Electric Auto'),
  ('four_wheeler','Hatchback'),('four_wheeler','Sedan'),('four_wheeler','SUV'),('four_wheeler','MUV'),('four_wheeler','Passenger Van')
) AS b(vehicle_class, name) ON b.vehicle_class = c.vehicle_class
WHERE c.is_active
  AND NOT EXISTS (
    SELECT 1 FROM public.vehicle_brands eb WHERE eb.category_id = c.id AND lower(eb.name) = lower(b.name)
  );
