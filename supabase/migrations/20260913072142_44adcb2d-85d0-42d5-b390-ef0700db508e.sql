
REVOKE ALL ON FUNCTION public.wallet_balance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_withdrawal(uuid, public.withdrawal_status, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_adjust_wallet(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_wallet(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_ride_completion() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.wallet_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_withdrawal(uuid, public.withdrawal_status, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_wallet(uuid, numeric, text) TO authenticated;
