
CREATE POLICY "vehicle images read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-images');
CREATE POLICY "vehicle images admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-images' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "vehicle images admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicle-images' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "vehicle images admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vehicle-images' AND public.has_role(auth.uid(),'admin'));
