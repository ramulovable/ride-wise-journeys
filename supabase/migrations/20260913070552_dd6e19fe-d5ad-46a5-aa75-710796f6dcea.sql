CREATE POLICY "profile photos readable" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-photos');
CREATE POLICY "profile photos owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "profile photos owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "profile photos owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);