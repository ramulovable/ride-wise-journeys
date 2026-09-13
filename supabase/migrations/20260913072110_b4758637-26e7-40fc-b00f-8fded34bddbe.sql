
-- === Referral code on profiles ===
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS my_referral_code text;

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
DECLARE candidate text;
DECLARE i int;
BEGIN
  LOOP
    candidate := 'ST';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE my_referral_code = candidate);
  END LOOP;
  RETURN candidate;
END; $$;

UPDATE public.profiles SET my_referral_code = public.generate_referral_code() WHERE my_referral_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_my_referral_code_key ON public.profiles (my_referral_code);

-- === Wallet ===
DO $$ BEGIN
  CREATE TYPE public.wallet_txn_type AS ENUM ('REFERRAL_REWARD','RIDE_EARNING','WITHDRAWAL_HOLD','WITHDRAWAL_DEBIT','WITHDRAWAL_REVERSAL','ADMIN_ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.withdrawal_status AS ENUM ('PENDING','APPROVED','PROCESSING','PAID','REJECTED','FAILED','REVERSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.wallet_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_accounts TO authenticated;
GRANT ALL ON public.wallet_accounts TO service_role;
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet own read" ON public.wallet_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.wallet_txn_type NOT NULL,
  amount numeric(12,2) NOT NULL,
  reference_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_transactions_user_idx ON public.wallet_transactions (user_id, created_at DESC);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet txn own read" ON public.wallet_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.ensure_wallet(_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.wallet_accounts(user_id) VALUES (_user_id) ON CONFLICT DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.ensure_wallet(uuid) FROM PUBLIC, anon, authenticated;

INSERT INTO public.wallet_accounts(user_id) SELECT id FROM public.profiles ON CONFLICT DO NOTHING;

-- === Earnings ===
CREATE TABLE IF NOT EXISTS public.earning_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL UNIQUE REFERENCES public.rides(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS earning_transactions_rider_idx ON public.earning_transactions (rider_id, created_at DESC);
GRANT SELECT ON public.earning_transactions TO authenticated;
GRANT ALL ON public.earning_transactions TO service_role;
ALTER TABLE public.earning_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "earnings own read" ON public.earning_transactions FOR SELECT TO authenticated
  USING (rider_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- === Referrals ===
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referrer_id <> referred_id)
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_id, created_at DESC);
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referrals own read" ON public.referrals FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referred_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.referral_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_transactions TO authenticated;
GRANT ALL ON public.referral_transactions TO service_role;
ALTER TABLE public.referral_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referral txn own read" ON public.referral_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- === Withdrawals ===
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  upi_id text NOT NULL,
  status public.withdrawal_status NOT NULL DEFAULT 'PENDING',
  admin_note text,
  reference_utr text,
  processed_by uuid REFERENCES auth.users(id),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS withdrawal_requests_user_idx ON public.withdrawal_requests (user_id, created_at DESC);
GRANT SELECT ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "withdrawals own read" ON public.withdrawal_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_withdrawal_updated BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.admin_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount numeric(12,2) NOT NULL,
  withdrawal_request_id uuid REFERENCES public.withdrawal_requests(id) ON DELETE SET NULL,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_wallet_transactions TO authenticated;
GRANT ALL ON public.admin_wallet_transactions TO service_role;
ALTER TABLE public.admin_wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin ledger read" ON public.admin_wallet_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- === Vehicle images ===
CREATE TABLE IF NOT EXISTS public.vehicle_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.vehicle_categories(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.vehicle_brands(id) ON DELETE CASCADE,
  model_id uuid REFERENCES public.vehicle_models(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.vehicle_variants(id) ON DELETE CASCADE,
  image_path text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (category_id IS NOT NULL OR brand_id IS NOT NULL OR model_id IS NOT NULL OR variant_id IS NOT NULL)
);
GRANT SELECT ON public.vehicle_images TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_images TO authenticated;
GRANT ALL ON public.vehicle_images TO service_role;
ALTER TABLE public.vehicle_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicle images read" ON public.vehicle_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "vehicle images admin write" ON public.vehicle_images FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_vehicle_images_updated BEFORE UPDATE ON public.vehicle_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === Notifications ===
CREATE TABLE IF NOT EXISTS public.notification_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  push_token text NOT NULL UNIQUE,
  device_type text NOT NULL DEFAULT 'web',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_devices TO authenticated;
GRANT ALL ON public.notification_devices TO service_role;
ALTER TABLE public.notification_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devices own" ON public.notification_devices FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_notification_devices_updated BEFORE UPDATE ON public.notification_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ride_id uuid REFERENCES public.rides(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel text NOT NULL DEFAULT 'push',
  delivered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications own read" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- === Settings ===
INSERT INTO public.app_settings(key, numeric_value, description) VALUES
  ('referral_reward_amount', 20, 'Referral reward per side in rupees'),
  ('withdrawal_min_amount', 100, 'Minimum withdrawal amount'),
  ('withdrawal_max_amount', 10000, 'Maximum withdrawal amount')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_text_settings(key, value, description) VALUES
  ('qr_base_url', 'https://shahintravels.app/vehicle', 'Base URL encoded in vehicle QR codes'),
  ('push_title_template', 'New ride request', 'Push notification title for ride requests'),
  ('push_body_template', '{pickup} to {drop} · {distance} km · Rs {fare}', 'Push notification body template')
ON CONFLICT (key) DO NOTHING;

-- === Signup: referral code + wallet + referral link ===
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE requested text;
DECLARE entered_code text;
DECLARE referrer uuid;
BEGIN
  entered_code := upper(NULLIF(trim(NEW.raw_user_meta_data->>'referral_code'),''));

  INSERT INTO public.profiles (id, mobile, full_name, address, referral_code, my_referral_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'mobile', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name',''),
    NULLIF(NEW.raw_user_meta_data->>'address',''),
    entered_code,
    public.generate_referral_code()
  ) ON CONFLICT (id) DO NOTHING;

  requested := COALESCE(NEW.raw_user_meta_data->>'role','customer');
  IF requested NOT IN ('rider','customer') THEN requested := 'customer'; END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, requested::public.app_role)
  ON CONFLICT DO NOTHING;

  IF requested = 'rider' THEN
    INSERT INTO public.rider_details (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.wallet_accounts(user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;

  IF entered_code IS NOT NULL THEN
    SELECT id INTO referrer FROM public.profiles WHERE my_referral_code = entered_code AND id <> NEW.id;
    IF referrer IS NOT NULL THEN
      INSERT INTO public.referrals(referrer_id, referred_id, code)
      VALUES (referrer, NEW.id, entered_code) ON CONFLICT (referred_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

-- === Ride completion: earnings + referral reward ===
CREATE OR REPLACE FUNCTION public.credit_ride_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reward numeric;
DECLARE ref RECORD;
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') AND NEW.rider_id IS NOT NULL THEN
    INSERT INTO public.earning_transactions(ride_id, rider_id, amount)
    VALUES (NEW.id, NEW.rider_id, COALESCE(NEW.total_fare,0))
    ON CONFLICT (ride_id) DO NOTHING;

    IF FOUND THEN
      INSERT INTO public.wallet_accounts(user_id) VALUES (NEW.rider_id) ON CONFLICT DO NOTHING;
      INSERT INTO public.wallet_transactions(user_id, type, amount, reference_id, note)
      VALUES (NEW.rider_id, 'RIDE_EARNING', COALESCE(NEW.total_fare,0), NEW.id, 'Ride earning');
    END IF;

    SELECT numeric_value INTO reward FROM public.app_settings WHERE key = 'referral_reward_amount';
    reward := COALESCE(reward, 20);

    FOR ref IN
      SELECT * FROM public.referrals
      WHERE status = 'pending' AND referred_id IN (NEW.customer_id, NEW.rider_id)
    LOOP
      UPDATE public.referrals SET status = 'rewarded', rewarded_at = now() WHERE id = ref.id;
      INSERT INTO public.wallet_accounts(user_id) VALUES (ref.referrer_id) ON CONFLICT DO NOTHING;
      INSERT INTO public.wallet_accounts(user_id) VALUES (ref.referred_id) ON CONFLICT DO NOTHING;
      INSERT INTO public.wallet_transactions(user_id, type, amount, reference_id, note)
      VALUES (ref.referrer_id, 'REFERRAL_REWARD', reward, ref.id, 'Referral reward'),
             (ref.referred_id, 'REFERRAL_REWARD', reward, ref.id, 'Referral reward');
      INSERT INTO public.referral_transactions(referral_id, user_id, amount)
      VALUES (ref.id, ref.referrer_id, reward), (ref.id, ref.referred_id, reward);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_credit_ride_completion ON public.rides;
CREATE TRIGGER trg_credit_ride_completion AFTER INSERT OR UPDATE OF status ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.credit_ride_completion();

-- === Wallet balance helper ===
CREATE OR REPLACE FUNCTION public.wallet_balance(_user_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount),0) FROM public.wallet_transactions WHERE user_id = _user_id;
$$;

-- === Withdrawal request ===
CREATE OR REPLACE FUNCTION public.request_withdrawal(_amount numeric, _upi text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
DECLARE bal numeric;
DECLARE min_amt numeric;
DECLARE max_amt numeric;
DECLARE new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _upi IS NULL OR _upi !~ '^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$' THEN
    RAISE EXCEPTION 'Enter a valid UPI ID';
  END IF;
  SELECT numeric_value INTO min_amt FROM public.app_settings WHERE key = 'withdrawal_min_amount';
  SELECT numeric_value INTO max_amt FROM public.app_settings WHERE key = 'withdrawal_max_amount';
  min_amt := COALESCE(min_amt, 100); max_amt := COALESCE(max_amt, 10000);
  IF _amount IS NULL OR _amount < min_amt OR _amount > max_amt THEN
    RAISE EXCEPTION 'Amount must be between % and %', min_amt, max_amt;
  END IF;

  PERFORM 1 FROM public.wallet_accounts WHERE user_id = uid FOR UPDATE;
  INSERT INTO public.wallet_accounts(user_id) VALUES (uid) ON CONFLICT DO NOTHING;

  SELECT COALESCE(SUM(amount),0) INTO bal FROM public.wallet_transactions WHERE user_id = uid;
  IF bal < _amount THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  INSERT INTO public.withdrawal_requests(user_id, amount, upi_id)
  VALUES (uid, _amount, _upi) RETURNING id INTO new_id;

  INSERT INTO public.wallet_transactions(user_id, type, amount, reference_id, note)
  VALUES (uid, 'WITHDRAWAL_HOLD', -_amount, new_id, 'Withdrawal on hold');

  RETURN new_id;
END; $$;

-- === Admin withdrawal processing ===
CREATE OR REPLACE FUNCTION public.admin_update_withdrawal(_id uuid, _status public.withdrawal_status, _utr text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
DECLARE req RECORD;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT * INTO req FROM public.withdrawal_requests WHERE id = _id FOR UPDATE;
  IF req IS NULL THEN RAISE EXCEPTION 'Withdrawal request not found'; END IF;
  IF req.status IN ('PAID','REJECTED','FAILED','REVERSED') THEN RAISE EXCEPTION 'This request is already closed'; END IF;

  UPDATE public.withdrawal_requests
  SET status = _status,
      reference_utr = COALESCE(NULLIF(trim(_utr),''), reference_utr),
      admin_note = COALESCE(NULLIF(trim(_note),''), admin_note),
      processed_by = uid,
      processed_at = now()
  WHERE id = _id;

  IF _status = 'PAID' THEN
    INSERT INTO public.wallet_transactions(user_id, type, amount, reference_id, note)
    VALUES (req.user_id, 'WITHDRAWAL_DEBIT', 0, req.id, 'Payout completed');
    INSERT INTO public.admin_wallet_transactions(direction, amount, withdrawal_request_id, note, created_by)
    VALUES ('out', req.amount, req.id, COALESCE(NULLIF(trim(_utr),''),'Payout'), uid);
  ELSIF _status IN ('REJECTED','FAILED','REVERSED') THEN
    INSERT INTO public.wallet_transactions(user_id, type, amount, reference_id, note)
    VALUES (req.user_id, 'WITHDRAWAL_REVERSAL', req.amount, req.id, 'Withdrawal returned to wallet');
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (uid, 'withdrawal_' || lower(_status::text), 'withdrawal_requests', _id::text, jsonb_build_object('utr', _utr, 'note', _note));
  RETURN true;
END; $$;

-- === Admin wallet adjustment ===
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(_user_id uuid, _amount numeric, _note text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  INSERT INTO public.wallet_accounts(user_id) VALUES (_user_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.wallet_transactions(user_id, type, amount, note)
  VALUES (_user_id, 'ADMIN_ADJUSTMENT', _amount, COALESCE(_note,'Admin adjustment'));
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.credit_ride_completion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon;
