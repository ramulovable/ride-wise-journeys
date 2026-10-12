
-- ========== Field employees ==========
CREATE OR REPLACE FUNCTION public.generate_employee_code()
RETURNS text LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text; i int;
BEGIN
  LOOP
    code := 'STE-';
    FOR i IN 1..8 LOOP code := code || substr(chars, 1 + floor(random()*length(chars))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.field_employees WHERE employee_code = code);
  END LOOP;
  RETURN code;
END $$;

CREATE TABLE public.field_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  employee_code text NOT NULL UNIQUE,
  designation text NOT NULL DEFAULT 'Field Growth Executive',
  territory text NOT NULL,
  reporting_manager_id uuid REFERENCES public.field_employees(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','inactive','exited')),
  can_approve_drivers boolean NOT NULL DEFAULT false,
  monthly_salary numeric NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0),
  commission_plan_note text,
  joining_date date NOT NULL DEFAULT CURRENT_DATE,
  verification_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  incentives_start_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.field_employee_code_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.employee_code := public.generate_employee_code();
  ELSIF NEW.employee_code IS DISTINCT FROM OLD.employee_code
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.verification_token IS DISTINCT FROM OLD.verification_token THEN
    RAISE EXCEPTION 'Employee ID is permanent and cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_field_employee_code BEFORE INSERT OR UPDATE ON public.field_employees
FOR EACH ROW EXECUTE FUNCTION public.field_employee_code_guard();
CREATE TRIGGER trg_field_employees_updated BEFORE UPDATE ON public.field_employees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT ON public.field_employees TO authenticated;
GRANT ALL ON public.field_employees TO service_role;
ALTER TABLE public.field_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage employees" ON public.field_employees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Employee reads own record" ON public.field_employees FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.active_employee_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id FROM public.field_employees WHERE user_id = _user_id AND status = 'active';
$$;

-- ========== Acquisition attribution (permanent) + portfolio manager ==========
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acquired_by_employee_id uuid REFERENCES public.field_employees(id),
  ADD COLUMN IF NOT EXISTS acquisition_date timestamptz,
  ADD COLUMN IF NOT EXISTS acquisition_territory text,
  ADD COLUMN IF NOT EXISTS acquisition_source text,
  ADD COLUMN IF NOT EXISTS portfolio_manager_id uuid REFERENCES public.field_employees(id);

CREATE OR REPLACE FUNCTION public.protect_acquisition()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.acquired_by_employee_id IS NOT NULL AND (
     NEW.acquired_by_employee_id IS DISTINCT FROM OLD.acquired_by_employee_id
     OR NEW.acquisition_date IS DISTINCT FROM OLD.acquisition_date
     OR NEW.acquisition_territory IS DISTINCT FROM OLD.acquisition_territory
     OR NEW.acquisition_source IS DISTINCT FROM OLD.acquisition_source) THEN
    RAISE EXCEPTION 'Acquisition attribution is permanent';
  END IF;
  IF (NEW.acquired_by_employee_id IS DISTINCT FROM OLD.acquired_by_employee_id
      OR NEW.portfolio_manager_id IS DISTINCT FROM OLD.portfolio_manager_id)
     AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
    NEW.acquired_by_employee_id := OLD.acquired_by_employee_id;
    NEW.acquisition_date := OLD.acquisition_date;
    NEW.acquisition_territory := OLD.acquisition_territory;
    NEW.acquisition_source := OLD.acquisition_source;
    NEW.portfolio_manager_id := OLD.portfolio_manager_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_protect_acquisition BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_acquisition();

-- ========== Portfolio assignment history + baseline ==========
CREATE TABLE public.portfolio_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('driver','customer')),
  employee_id uuid NOT NULL REFERENCES public.field_employees(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  assigned_by uuid,
  baseline_rides_30d int NOT NULL DEFAULT 0,
  baseline_active boolean NOT NULL DEFAULT false,
  baseline_subscription_until date
);
CREATE INDEX ON public.portfolio_assignments(employee_id) WHERE ended_at IS NULL;
GRANT SELECT ON public.portfolio_assignments TO authenticated;
GRANT ALL ON public.portfolio_assignments TO service_role;
ALTER TABLE public.portfolio_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read assignments" ON public.portfolio_assignments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Employee reads own assignments" ON public.portfolio_assignments FOR SELECT TO authenticated
  USING (employee_id = public.active_employee_id(auth.uid()));

-- ========== Verified tick audit ==========
CREATE TABLE public.verified_tick_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  old_value boolean,
  new_value boolean NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.verified_tick_audit TO authenticated;
GRANT ALL ON public.verified_tick_audit TO service_role;
ALTER TABLE public.verified_tick_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read tick audit" ON public.verified_tick_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.log_verified_tick()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    INSERT INTO public.verified_tick_audit(driver_id, old_value, new_value, actor_id)
    VALUES (NEW.user_id, OLD.is_verified, NEW.is_verified, auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_log_verified_tick AFTER UPDATE ON public.rider_details
FOR EACH ROW EXECUTE FUNCTION public.log_verified_tick();

-- ========== Driver monetization ==========
CREATE TABLE public.driver_monetization_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan_type text NOT NULL CHECK (plan_type IN ('subscription','commission')),
  city text,
  vehicle_category_id uuid REFERENCES public.vehicle_categories(id),
  rider_id uuid,
  monthly_fee numeric CHECK (monthly_fee IS NULL OR monthly_fee >= 0),
  grace_days int NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
  commission_type text CHECK (commission_type IN ('percent','fixed')),
  commission_value numeric CHECK (commission_value IS NULL OR commission_value >= 0),
  min_commission numeric,
  max_commission numeric,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_dmp_updated BEFORE UPDATE ON public.driver_monetization_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
GRANT SELECT ON public.driver_monetization_plans TO authenticated;
GRANT ALL ON public.driver_monetization_plans TO service_role;
ALTER TABLE public.driver_monetization_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in read plans" ON public.driver_monetization_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage plans" ON public.driver_monetization_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.rider_details
  ADD COLUMN IF NOT EXISTS monetization_plan_id uuid REFERENCES public.driver_monetization_plans(id),
  ADD COLUMN IF NOT EXISTS commission_plan_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Only admins may switch commission mode
CREATE OR REPLACE FUNCTION public.protect_rider_monetization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.commission_plan_active IS DISTINCT FROM OLD.commission_plan_active
      OR NEW.monetization_plan_id IS DISTINCT FROM OLD.monetization_plan_id)
     AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
    NEW.commission_plan_active := OLD.commission_plan_active;
    NEW.monetization_plan_id := OLD.monetization_plan_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_protect_rider_monetization BEFORE UPDATE ON public.rider_details
FOR EACH ROW EXECUTE FUNCTION public.protect_rider_monetization();

CREATE OR REPLACE FUNCTION public.enforce_rider_online()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.is_online AND NOT (
    NEW.is_approved AND NOT NEW.is_blocked
    AND ((NEW.subscription_valid_until IS NOT NULL AND NEW.subscription_valid_until >= CURRENT_DATE)
         OR NEW.commission_plan_active)
  ) THEN
    NEW.is_online := false;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.accept_broadcast_ride(_ride_id uuid, _vehicle_id uuid)
 RETURNS boolean LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE won boolean;
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.rider_details rd
    JOIN public.rider_vehicles rv ON rv.rider_id = rd.user_id
    JOIN public.rides r ON r.id = _ride_id
    WHERE rd.user_id = uid AND rd.is_approved AND NOT rd.is_blocked AND rd.is_online
      AND (rd.subscription_valid_until >= CURRENT_DATE OR rd.commission_plan_active)
      AND rv.id = _vehicle_id AND rv.rider_id = uid AND rv.is_active
      AND rv.vehicle_category_id = r.requested_category_id
      AND (r.requested_ac IS NULL OR rv.has_ac = r.requested_ac)
  ) THEN RAISE EXCEPTION 'Vehicle is not eligible for this booking'; END IF;
  UPDATE public.rides SET rider_id = uid, vehicle_id = _vehicle_id,
    vehicle_category_id = requested_category_id, status = 'accepted', accepted_at = now()
  WHERE id = _ride_id AND rider_id IS NULL AND status IN ('requested','searching');
  GET DIAGNOSTICS won = ROW_COUNT;
  RETURN won;
END; $function$;

-- ========== Financial ledger (immutable) ==========
CREATE TABLE public.financial_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_type text NOT NULL CHECK (txn_type IN ('subscription_payment','ride_commission','employee_salary','employee_commission','employee_bonus','adjustment_reversal')),
  amount numeric NOT NULL,
  user_id uuid,
  employee_id uuid REFERENCES public.field_employees(id),
  ride_id uuid,
  plan_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected','collected')),
  reference text,
  note text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX financial_ledger_ride_commission_uniq ON public.financial_ledger(ride_id) WHERE txn_type = 'ride_commission';
GRANT SELECT ON public.financial_ledger TO authenticated;
GRANT ALL ON public.financial_ledger TO service_role;
ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ledger" ON public.financial_ledger FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Employee reads own pay" ON public.financial_ledger FOR SELECT TO authenticated
  USING (employee_id = public.active_employee_id(auth.uid()) AND txn_type IN ('employee_salary','employee_commission','employee_bonus'));
CREATE POLICY "Driver reads own charges" ON public.financial_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND txn_type IN ('subscription_payment','ride_commission'));

CREATE OR REPLACE FUNCTION public.ledger_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Ledger entries cannot be deleted'; END IF;
  IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.txn_type IS DISTINCT FROM OLD.txn_type
     OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Ledger amounts are immutable; record a reversal instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ledger_immutable BEFORE UPDATE OR DELETE ON public.financial_ledger
FOR EACH ROW EXECUTE FUNCTION public.ledger_immutable();

-- Ride commission for commission-plan drivers (separate from existing completion trigger)
CREATE OR REPLACE FUNCTION public.charge_ride_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rd RECORD; p RECORD; amt numeric;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.rider_id IS NOT NULL THEN
    SELECT * INTO rd FROM public.rider_details WHERE user_id = NEW.rider_id;
    IF rd.commission_plan_active AND rd.monetization_plan_id IS NOT NULL THEN
      SELECT * INTO p FROM public.driver_monetization_plans WHERE id = rd.monetization_plan_id AND plan_type = 'commission';
      IF p.id IS NOT NULL THEN
        amt := CASE WHEN p.commission_type = 'percent' THEN COALESCE(NEW.total_fare,0) * COALESCE(p.commission_value,0) / 100
                    ELSE COALESCE(p.commission_value,0) END;
        IF p.min_commission IS NOT NULL THEN amt := GREATEST(amt, p.min_commission); END IF;
        IF p.max_commission IS NOT NULL THEN amt := LEAST(amt, p.max_commission); END IF;
        INSERT INTO public.financial_ledger(txn_type, amount, user_id, employee_id, ride_id, plan_id, status, reference, note)
        SELECT 'ride_commission', round(amt,2), NEW.rider_id, pr.portfolio_manager_id, NEW.id, p.id, 'pending', NEW.id::text, 'Commission on completed ride'
        FROM public.profiles pr WHERE pr.id = NEW.rider_id
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_charge_ride_commission AFTER UPDATE ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.charge_ride_commission();

-- ========== Compensation rules, targets, earnings ==========
CREATE TABLE public.compensation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('new_driver','qualified_driver','new_customer','qualified_customer','driver_renewal','customer_reactivation','performance_bonus','target_bonus','quality_bonus')),
  amount numeric NOT NULL CHECK (amount >= 0),
  min_completed_rides int NOT NULL DEFAULT 0,
  require_kyc boolean NOT NULL DEFAULT true,
  require_monetization boolean NOT NULL DEFAULT true,
  dormant_days int NOT NULL DEFAULT 30,
  territory text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.compensation_rules TO authenticated;
GRANT ALL ON public.compensation_rules TO service_role;
ALTER TABLE public.compensation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage comp rules" ON public.compensation_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Employees read comp rules" ON public.compensation_rules FOR SELECT TO authenticated
  USING (public.active_employee_id(auth.uid()) IS NOT NULL);

CREATE TABLE public.employee_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.field_employees(id),
  month date NOT NULL,
  metric text NOT NULL CHECK (metric IN ('new_drivers','qualified_drivers','new_customers','qualified_customers','renewals','reactivations','completed_rides','portfolio_active')),
  target_value int NOT NULL CHECK (target_value > 0),
  slabs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month, metric)
);
GRANT SELECT ON public.employee_targets TO authenticated;
GRANT ALL ON public.employee_targets TO service_role;
ALTER TABLE public.employee_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage targets" ON public.employee_targets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Employee reads own targets" ON public.employee_targets FOR SELECT TO authenticated
  USING (employee_id = public.active_employee_id(auth.uid()));

CREATE TABLE public.employee_qualified_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.field_employees(id),
  event_type text NOT NULL,
  subject_id uuid NOT NULL,
  period_key text NOT NULL DEFAULT 'once',
  rule_id uuid REFERENCES public.compensation_rules(id),
  amount numeric NOT NULL DEFAULT 0,
  ledger_id uuid REFERENCES public.financial_ledger(id),
  qualified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_type, subject_id, period_key)
);
GRANT SELECT ON public.employee_qualified_events TO authenticated;
GRANT ALL ON public.employee_qualified_events TO service_role;
ALTER TABLE public.employee_qualified_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read events" ON public.employee_qualified_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Employee reads own events" ON public.employee_qualified_events FOR SELECT TO authenticated
  USING (employee_id = public.active_employee_id(auth.uid()));
