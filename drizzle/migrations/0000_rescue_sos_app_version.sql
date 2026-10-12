ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS app_version text, ADD COLUMN IF NOT EXISTS app_version_seen_at timestamptz;

CREATE TABLE public.rescue_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'rescue' CHECK (kind IN ('rescue','sos')),
  ride_id uuid REFERENCES public.rides(id) ON DELETE SET NULL,
  latitude double precision,
  longitude double precision,
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT ON public.rescue_requests TO authenticated;
GRANT ALL ON public.rescue_requests TO service_role;
ALTER TABLE public.rescue_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rescue_read_riders_admin" ON public.rescue_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'rider'));

CREATE TABLE public.rescue_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.rescue_requests(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL,
  response text NOT NULL CHECK (response IN ('accepted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, responder_id)
);
GRANT SELECT ON public.rescue_responses TO authenticated;
GRANT ALL ON public.rescue_responses TO service_role;
ALTER TABLE public.rescue_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rescue_resp_read" ON public.rescue_responses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'rider'));

CREATE TABLE public.driver_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  phone text NOT NULL CHECK (phone ~ '^[0-9+]{3,15}$'),
  relation text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_emergency_contacts TO authenticated;
GRANT ALL ON public.driver_emergency_contacts TO service_role;
ALTER TABLE public.driver_emergency_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_own" ON public.driver_emergency_contacts FOR ALL TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (driver_id = auth.uid());
CREATE INDEX ON public.driver_emergency_contacts(driver_id);
CREATE INDEX ON public.rescue_requests(status, created_at DESC);