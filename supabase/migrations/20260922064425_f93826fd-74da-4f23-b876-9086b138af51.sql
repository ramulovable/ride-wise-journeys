DROP POLICY IF EXISTS rider_vehicles_read ON public.rider_vehicles;
CREATE POLICY rider_vehicles_read ON public.rider_vehicles
FOR SELECT TO authenticated
USING (
  rider_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.shares_ride_with(rider_id)
);

DROP POLICY IF EXISTS "profile photos readable" ON storage.objects;
CREATE POLICY "profile photos readable" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.shares_ride_with(((storage.foldername(name))[1])::uuid)
  )
);

REVOKE ALL ON FUNCTION public.protect_rider_verified() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shares_ride_with(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_wallet(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.award_referral(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_referral_code(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_withdrawal(uuid, withdrawal_status, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wallet_balance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_adjust_wallet(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_broadcast_ride(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advance_rider_ride(uuid, text) FROM PUBLIC, anon;