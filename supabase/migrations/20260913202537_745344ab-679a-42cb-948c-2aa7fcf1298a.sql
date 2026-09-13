CREATE TABLE public.mobile_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('signup','login')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','expired')),
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.mobile_otps TO service_role;

ALTER TABLE public.mobile_otps ENABLE ROW LEVEL SECURITY;

CREATE INDEX mobile_otps_mobile_created_idx ON public.mobile_otps (mobile, created_at DESC);
CREATE INDEX mobile_otps_lookup_idx ON public.mobile_otps (mobile, purpose, status);

CREATE TRIGGER update_mobile_otps_updated_at
BEFORE UPDATE ON public.mobile_otps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();