DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND cmd='SELECT' AND qual='true' AND roles='{authenticated}'
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING (auth.uid() IS NOT NULL)', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER POLICY "categories_read" ON public.vehicle_categories USING (is_active = true OR public.has_role(auth.uid(),'admin'));
ALTER POLICY "locations_read" ON public.locations USING (is_active = true OR public.has_role(auth.uid(),'admin'));
ALTER POLICY "languages readable" ON public.languages USING (is_active = true OR public.has_role(auth.uid(),'admin'));
ALTER POLICY "permission policies readable" ON public.permission_policies USING (is_active = true OR public.has_role(auth.uid(),'admin'));

ALTER POLICY "vehicle images read" ON storage.objects USING (bucket_id = 'vehicle-images' AND auth.uid() IS NOT NULL);
ALTER POLICY "Authenticated can read banner images" ON storage.objects USING (bucket_id = 'promotional-banners' AND auth.uid() IS NOT NULL);