CREATE TABLE IF NOT EXISTS public.referral_reward_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL,
  event_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.referral_reward_conditions TO authenticated;
GRANT ALL ON public.referral_reward_conditions TO service_role;
ALTER TABLE public.referral_reward_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users read reward conditions" ON public.referral_reward_conditions;
CREATE POLICY "Signed-in users read reward conditions"
  ON public.referral_reward_conditions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage reward conditions" ON public.referral_reward_conditions;
CREATE POLICY "Admins manage reward conditions"
  ON public.referral_reward_conditions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_referral_reward_conditions_updated ON public.referral_reward_conditions;
CREATE TRIGGER trg_referral_reward_conditions_updated
  BEFORE UPDATE ON public.referral_reward_conditions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.referral_reward_conditions (code, display_name, description, event_type, sort_order)
VALUES
  ('new_account_created', 'New account created',
   'Reward is credited when a new user successfully creates an account through a valid referral.',
   'NEW_ACCOUNT_CREATED', 1),
  ('first_ride', 'First completed ride',
   'Reward is credited after the invited person completes their first ride.',
   'FIRST_COMPLETED_RIDE', 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.app_text_settings (key, value, description)
VALUES ('referral_reward_condition', 'new_account_created', 'Which event credits the referral reward')
ON CONFLICT (key) DO UPDATE SET value = 'new_account_created';

-- One reward row per referral and person: makes reward crediting idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS referral_transactions_unique_payout
  ON public.referral_transactions (referral_id, user_id);

-- Shared, idempotent reward routine used by every referral event.
CREATE OR REPLACE FUNCTION public.award_referral(_referral_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE ref RECORD;
DECLARE reward numeric;
DECLARE enabled numeric;
DECLARE limit_per_user numeric;
DECLARE rewarded_count numeric;
DECLARE referrer_blocked boolean;
BEGIN
  SELECT * INTO ref FROM public.referrals WHERE id = _referral_id FOR UPDATE;
  IF ref IS NULL OR ref.status <> 'pending' THEN RETURN false; END IF;
  IF ref.referrer_user_id = ref.referred_user_id THEN RETURN false; END IF;

  SELECT numeric_value INTO enabled FROM public.app_settings WHERE key = 'referral_program_enabled';
  IF COALESCE(enabled, 1) <> 1 THEN RETURN false; END IF;

  SELECT is_blocked INTO referrer_blocked FROM public.profiles WHERE id = ref.referrer_user_id;
  IF COALESCE(referrer_blocked, false) THEN RETURN false; END IF;

  SELECT numeric_value INTO reward FROM public.app_settings WHERE key = 'referral_reward_amount';
  reward := COALESCE(reward, 20);
  IF reward <= 0 THEN RETURN false; END IF;

  SELECT numeric_value INTO limit_per_user FROM public.app_settings WHERE key = 'referral_max_per_user';
  SELECT count(*) INTO rewarded_count FROM public.referrals
  WHERE referrer_user_id = ref.referrer_user_id AND status = 'rewarded';
  IF COALESCE(limit_per_user, 0) > 0 AND rewarded_count >= limit_per_user THEN RETURN false; END IF;

  UPDATE public.referrals
  SET status = 'rewarded', rewarded_at = now(), eligible_at = now(), reward_amount = reward
  WHERE id = ref.id AND status = 'pending';
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.wallet_accounts(user_id) VALUES (ref.referrer_user_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.wallet_accounts(user_id) VALUES (ref.referred_user_id) ON CONFLICT DO NOTHING;

  INSERT INTO public.referral_transactions(referral_id, user_id, amount)
  VALUES (ref.id, ref.referrer_user_id, reward), (ref.id, ref.referred_user_id, reward)
  ON CONFLICT (referral_id, user_id) DO NOTHING;

  INSERT INTO public.wallet_transactions(user_id, type, amount, reference_id, note)
  VALUES (ref.referrer_user_id, 'REFERRAL_REWARD', reward, ref.id, 'Referral reward'),
         (ref.referred_user_id, 'REFERRAL_REWARD', reward, ref.id, 'Referral reward');

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (NULL, 'referral_rewarded', 'referrals', ref.id::text,
          jsonb_build_object('referrer', ref.referrer_user_id, 'referred', ref.referred_user_id,
                             'amount', reward, 'code', ref.code));
  RETURN true;
END; $$;

-- Signup: create the referral link and pay immediately when configured to do so.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE requested text;
DECLARE entered_code text;
DECLARE referrer uuid;
DECLARE code_row RECORD;
DECLARE enabled numeric;
DECLARE limit_per_user numeric;
DECLARE rewarded_count numeric;
DECLARE new_referral_id uuid;
DECLARE condition_code text;
DECLARE condition_event text;
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
          ON CONFLICT (referred_user_id) DO NOTHING
          RETURNING id INTO new_referral_id;

          SELECT value INTO condition_code FROM public.app_text_settings WHERE key = 'referral_reward_condition';
          SELECT event_type INTO condition_event FROM public.referral_reward_conditions
          WHERE code = COALESCE(condition_code, 'new_account_created') AND is_active;

          IF new_referral_id IS NOT NULL AND COALESCE(condition_event, 'NEW_ACCOUNT_CREATED') = 'NEW_ACCOUNT_CREATED' THEN
            PERFORM public.award_referral(new_referral_id);
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

-- Ride completion pays referrals only when that condition is the configured one.
CREATE OR REPLACE FUNCTION public.credit_ride_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE condition_code text;
DECLARE condition_event text;
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

    SELECT value INTO condition_code FROM public.app_text_settings WHERE key = 'referral_reward_condition';
    SELECT event_type INTO condition_event FROM public.referral_reward_conditions
    WHERE code = COALESCE(condition_code, 'new_account_created') AND is_active;

    IF COALESCE(condition_event, 'NEW_ACCOUNT_CREATED') = 'FIRST_COMPLETED_RIDE' THEN
      FOR ref IN
        SELECT id FROM public.referrals
        WHERE status = 'pending' AND referred_user_id IN (NEW.customer_id, NEW.rider_id)
      LOOP
        PERFORM public.award_referral(ref.id);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END; $$;