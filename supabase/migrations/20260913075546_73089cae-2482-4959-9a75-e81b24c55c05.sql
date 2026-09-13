
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_ride_completion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_admin_catalog_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.keep_single_primary_vehicle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_ride_status_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_fare_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_wallet(uuid) FROM PUBLIC, anon;
