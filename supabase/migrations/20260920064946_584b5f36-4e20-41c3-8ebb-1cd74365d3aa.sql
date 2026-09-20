CREATE TABLE IF NOT EXISTS public.broadcast_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('all','customers','riders')),
  action_path text NOT NULL DEFAULT '/',
  recipient_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.broadcast_messages TO authenticated;
GRANT ALL ON public.broadcast_messages TO service_role;

ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read broadcasts" ON public.broadcast_messages;
CREATE POLICY "Admins read broadcasts" ON public.broadcast_messages
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Service role manages broadcasts" ON public.broadcast_messages;
CREATE POLICY "Service role manages broadcasts" ON public.broadcast_messages
FOR ALL TO service_role USING (true) WITH CHECK (true);