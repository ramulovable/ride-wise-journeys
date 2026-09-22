CREATE OR REPLACE FUNCTION public.award_referral(_referral_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.referral_transactions(referral_id, user_id, amount)
  VALUES (ref.id, ref.referrer_user_id, reward)
  ON CONFLICT (referral_id, user_id) DO NOTHING;

  INSERT INTO public.wallet_transactions(user_id, type, amount, reference_id, note)
  VALUES (ref.referrer_user_id, 'REFERRAL_REWARD', reward, ref.id, 'Referral reward');

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (NULL, 'referral_rewarded', 'referrals', ref.id::text,
          jsonb_build_object('referrer', ref.referrer_user_id, 'referred', ref.referred_user_id,
                             'amount', reward, 'code', ref.code, 'paid_to', 'referrer_only'));
  RETURN true;
END; $function$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(_amount numeric, _upi text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  PERFORM 1 FROM public.wallet_accounts WHERE user_id = uid FOR UPDATE;
  INSERT INTO public.wallet_accounts(user_id) VALUES (uid) ON CONFLICT DO NOTHING;

  SELECT COALESCE(SUM(amount),0) INTO bal FROM public.wallet_transactions WHERE user_id = uid;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Enter the amount you want to withdraw';
  END IF;
  IF bal < min_amt THEN
    RAISE EXCEPTION 'You need at least % in your wallet before you can withdraw', min_amt;
  END IF;
  IF _amount < min_amt THEN
    RAISE EXCEPTION 'Minimum withdrawal amount is %', min_amt;
  END IF;
  IF _amount > max_amt THEN
    RAISE EXCEPTION 'Maximum withdrawal amount is %', max_amt;
  END IF;
  IF _amount > bal THEN
    RAISE EXCEPTION 'You only have % in your wallet', bal;
  END IF;

  INSERT INTO public.withdrawal_requests(user_id, amount, upi_id)
  VALUES (uid, _amount, _upi) RETURNING id INTO new_id;

  INSERT INTO public.wallet_transactions(user_id, type, amount, reference_id, note)
  VALUES (uid, 'WITHDRAWAL_HOLD', -_amount, new_id, 'Withdrawal on hold');

  RETURN new_id;
END; $function$;