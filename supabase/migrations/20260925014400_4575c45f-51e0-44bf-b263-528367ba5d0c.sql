CREATE OR REPLACE FUNCTION public.credit_ride_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE condition_code text;
DECLARE condition_event text;
DECLARE ref RECORD;
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') AND NEW.rider_id IS NOT NULL THEN
    -- Cash-only model: the driver collects the fare in cash directly from the
    -- customer, so we only record the earning for reports. No wallet credit.
    INSERT INTO public.earning_transactions(ride_id, rider_id, amount)
    VALUES (NEW.id, NEW.rider_id, COALESCE(NEW.total_fare,0))
    ON CONFLICT (ride_id) DO NOTHING;

    INSERT INTO public.wallet_accounts(user_id) VALUES (NEW.rider_id) ON CONFLICT DO NOTHING;

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
END; $function$;