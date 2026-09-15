CREATE POLICY "Authenticated can read banner images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'promotional-banners');

CREATE POLICY "Admins can upload banner images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'promotional-banners' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can update banner images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'promotional-banners' AND public.has_role(auth.uid(),'admin'))
WITH CHECK (bucket_id = 'promotional-banners' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can delete banner images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'promotional-banners' AND public.has_role(auth.uid(),'admin'));