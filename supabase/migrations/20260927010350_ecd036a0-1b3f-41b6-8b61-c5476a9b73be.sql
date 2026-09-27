CREATE TABLE public.eticket_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled boolean NOT NULL DEFAULT false,
  commission_type text NOT NULL DEFAULT 'percent' CHECK (commission_type IN ('percent','flat')),
  commission_value numeric NOT NULL DEFAULT 0 CHECK (commission_value >= 0),
  insurance_enabled boolean NOT NULL DEFAULT false,
  insurance_charge numeric NOT NULL DEFAULT 0 CHECK (insurance_charge >= 0),
  insurance_provider text,
  insurance_policy_number text,
  insurance_claim_rules text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.eticket_settings TO authenticated;
GRANT ALL ON public.eticket_settings TO service_role;
ALTER TABLE public.eticket_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in read eticket settings" ON public.eticket_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins update eticket settings" ON public.eticket_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.eticket_settings (is_enabled) VALUES (false);
CREATE TRIGGER trg_eticket_settings_updated BEFORE UPDATE ON public.eticket_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.eticket_fares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_category_id uuid NOT NULL UNIQUE REFERENCES public.vehicle_categories(id),
  base_fare numeric NOT NULL DEFAULT 0 CHECK (base_fare >= 0),
  per_km_rate numeric NOT NULL DEFAULT 0 CHECK (per_km_rate >= 0),
  min_fare numeric NOT NULL DEFAULT 0 CHECK (min_fare >= 0),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.eticket_fares TO authenticated;
GRANT ALL ON public.eticket_fares TO service_role;
ALTER TABLE public.eticket_fares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in read eticket fares" ON public.eticket_fares FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert eticket fares" ON public.eticket_fares FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update eticket fares" ON public.eticket_fares FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_eticket_fares_updated BEFORE UPDATE ON public.eticket_fares FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.etickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pnr text NOT NULL UNIQUE,
  customer_id uuid NOT NULL,
  passenger_name text NOT NULL,
  passenger_mobile text NOT NULL,
  vehicle_category_id uuid NOT NULL REFERENCES public.vehicle_categories(id),
  from_location_id uuid NOT NULL REFERENCES public.locations(id),
  to_location_id uuid NOT NULL REFERENCES public.locations(id),
  pickup_landmark text,
  passengers integer NOT NULL DEFAULT 1 CHECK (passengers BETWEEN 1 AND 10),
  distance_km numeric,
  fare_amount numeric NOT NULL CHECK (fare_amount >= 0),
  insurance_opted boolean NOT NULL DEFAULT false,
  insurance_charge numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL CHECK (total_amount >= 0),
  fare_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_status text NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PAID','FAILED','REFUNDED')),
  payment_gateway text,
  payment_order_id text,
  payment_id text,
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','ACTIVE','IN_PROGRESS','COMPLETED','CANCELLED')),
  qr_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  driver_id uuid,
  vehicle_id uuid REFERENCES public.rider_vehicles(id),
  commission_amount numeric,
  driver_net_amount numeric,
  paid_at timestamptz,
  scanned_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_etickets_customer ON public.etickets(customer_id, created_at DESC);
CREATE INDEX idx_etickets_driver ON public.etickets(driver_id, created_at DESC);
GRANT SELECT ON public.etickets TO authenticated;
GRANT ALL ON public.etickets TO service_role;
ALTER TABLE public.etickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers read own etickets" ON public.etickets FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY "Drivers read assigned etickets" ON public.etickets FOR SELECT TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "Admins read all etickets" ON public.etickets FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_etickets_updated BEFORE UPDATE ON public.etickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.generate_eticket_pnr() RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text; i int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP code := code || substr(chars, 1 + floor(random()*length(chars))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.etickets WHERE pnr = code);
  END LOOP;
  RETURN code;
END $$;