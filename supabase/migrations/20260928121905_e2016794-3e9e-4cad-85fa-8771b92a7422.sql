DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['languages','vehicle_categories','locations','permission_policies'] LOOP
    EXECUTE format('CREATE POLICY "%s_anon_active_read" ON public.%I FOR SELECT TO anon USING (is_active = true)', t, t);
  END LOOP;
END $$;
ALTER POLICY "languages readable" ON public.languages TO authenticated;
ALTER POLICY categories_read ON public.vehicle_categories TO authenticated;
ALTER POLICY locations_read ON public.locations TO authenticated;
ALTER POLICY "permission policies readable" ON public.permission_policies TO authenticated;
CREATE POLICY "banners_anon_active_read" ON public.promotional_banners FOR SELECT TO anon USING (is_active);
ALTER POLICY "Anyone can view active banners" ON public.promotional_banners TO authenticated;