
-- 1. referral_codes
CREATE TABLE public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own referral code" ON public.referral_codes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_referral_codes_updated BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. generator now checks the new table too
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
DECLARE candidate text;
DECLARE i int;
BEGIN
  LOOP
    candidate := 'ST';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = candidate)
      AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE my_referral_code = candidate);
  END LOOP;
  RETURN candidate;
END; $$;

-- 3. ensure_referral_code: lazily create with collision retry
CREATE OR REPLACE FUNCTION public.ensure_referral_code(_user_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE target uuid := COALESCE(_user_id, auth.uid());
DECLARE existing text;
DECLARE candidate text;
DECLARE attempts int := 0;
BEGIN
  IF target IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF target <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT code INTO existing FROM public.referral_codes WHERE user_id = target;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  LOOP
    attempts := attempts + 1;
    candidate := COALESCE((SELECT my_referral_code FROM public.profiles WHERE id = target), public.generate_referral_code());
    IF EXISTS (SELECT 1 FROM public.referral_codes WHERE code = candidate) THEN
      candidate := public.generate_referral_code();
    END IF;
    BEGIN
      INSERT INTO public.referral_codes(user_id, code) VALUES (target, candidate);
      UPDATE public.profiles SET my_referral_code = candidate WHERE id = target;
      RETURN candidate;
    EXCEPTION WHEN unique_violation THEN
      IF attempts > 10 THEN RAISE; END IF;
    END;
  END LOOP;
END; $$;

REVOKE ALL ON FUNCTION public.ensure_referral_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_referral_code(uuid) TO authenticated, service_role;

-- 4. backfill every existing customer / rider
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT p.id FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IN ('customer','rider')
    WHERE NOT EXISTS (SELECT 1 FROM public.referral_codes rc WHERE rc.user_id = p.id)
  LOOP
    PERFORM public.ensure_referral_code(r.id);
  END LOOP;
END $$;

-- 5. referrals: spec column names + reward metadata
ALTER TABLE public.referrals RENAME COLUMN referrer_id TO referrer_user_id;
ALTER TABLE public.referrals RENAME COLUMN referred_id TO referred_user_id;
ALTER TABLE public.referrals
  ADD COLUMN referral_code_id uuid REFERENCES public.referral_codes(id),
  ADD COLUMN reward_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN eligible_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER trg_referrals_updated BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

UPDATE public.referrals r
SET referral_code_id = rc.id
FROM public.referral_codes rc
WHERE rc.user_id = r.referrer_user_id AND r.referral_code_id IS NULL;

UPDATE public.referrals SET eligible_at = rewarded_at WHERE status = 'rewarded' AND eligible_at IS NULL;

-- 6. new settings
INSERT INTO public.app_settings(key, numeric_value, description) VALUES
  ('referral_program_enabled', 1, 'Referral programme on (1) or off (0)'),
  ('referral_max_per_user', 0, 'Maximum rewarded referrals per user (0 = unlimited)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_text_settings(key, value, description) VALUES
  ('referral_reward_condition', 'first_ride', 'When the referral reward is credited'),
  ('referral_invite_url', 'https://shahintravels.app', 'Link shared with the invite message'),
  ('referral_invite_message', 'Book rides with Shahin Travels. Use my referral code {code} and we both earn {reward}. {link}', 'Invite message template'),
  ('referral_copy_toast', 'Referral code copied.', 'Confirmation shown after copying the code')
ON CONFLICT (key) DO NOTHING;

-- 7. signup: create code + validated referral link
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE requested text;
DECLARE entered_code text;
DECLARE referrer uuid;
DECLARE code_row RECORD;
DECLARE enabled numeric;
DECLARE limit_per_user numeric;
DECLARE rewarded_count numeric;
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

  PERFORM public.ensure_referral_code(NEW.id);

  IF entered_code IS NOT NULL THEN
    SELECT numeric_value INTO enabled FROM public.app_settings WHERE key = 'referral_program_enabled';
    SELECT numeric_value INTO limit_per_user FROM public.app_settings WHERE key = 'referral_max_per_user';
    IF COALESCE(enabled, 1) = 1 THEN
      SELECT rc.* INTO code_row FROM public.referral_codes rc
      JOIN public.profiles p ON p.id = rc.user_id
      WHERE rc.code = entered_code AND rc.is_active AND NOT p.is_blocked;

      IF code_row.user_id IS NOT NULL AND code_row.user_id <> NEW.id THEN
        referrer := code_row.user_id;
        SELECT count(*) INTO rewarded_count FROM public.referrals
        WHERE referrer_user_id = referrer AND status = 'rewarded';
        IF COALESCE(limit_per_user, 0) = 0 OR rewarded_count < limit_per_user THEN
          INSERT INTO public.referrals(referrer_user_id, referred_user_id, code, referral_code_id)
          VALUES (referrer, NEW.id, entered_code, code_row.id)
          ON CONFLICT (referred_user_id) DO NOTHING;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

-- 8. reward crediting from the ledger, once per referral
CREATE OR REPLACE FUNCTION public.credit_ride_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE reward numeric;
DECLARE enabled numeric;
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

    SELECT numeric_value INTO enabled FROM public.app_settings WHERE key = 'referral_program_enabled';
    SELECT numeric_value INTO reward FROM public.app_settings WHERE key = 'referral_reward_amount';
    reward := COALESCE(reward, 20);

    IF COALESCE(enabled, 1) = 1 AND reward > 0 THEN
      FOR ref IN
        SELECT * FROM public.referrals
        WHERE status = 'pending' AND referred_user_id IN (NEW.customer_id, NEW.rider_id)
        FOR UPDATE
      LOOP
        UPDATE public.referrals
        SET status = 'rewarded', rewarded_at = now(), eligible_at = now(), reward_amount = reward
        WHERE id = ref.id AND status = 'pending';
        IF FOUND THEN
          INSERT INTO public.wallet_accounts(user_id) VALUES (ref.referrer_user_id) ON CONFLICT DO NOTHING;
          INSERT INTO public.wallet_accounts(user_id) VALUES (ref.referred_user_id) ON CONFLICT DO NOTHING;
          INSERT INTO public.wallet_transactions(user_id, type, amount, reference_id, note)
          VALUES (ref.referrer_user_id, 'REFERRAL_REWARD', reward, ref.id, 'Referral reward'),
                 (ref.referred_user_id, 'REFERRAL_REWARD', reward, ref.id, 'Referral reward');
          INSERT INTO public.referral_transactions(referral_id, user_id, amount)
          VALUES (ref.id, ref.referrer_user_id, reward), (ref.id, ref.referred_user_id, reward);
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
