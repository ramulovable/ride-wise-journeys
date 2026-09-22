-- Languages
CREATE TABLE IF NOT EXISTS public.languages (
  code text PRIMARY KEY,
  native_name text NOT NULL,
  english_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.languages TO anon, authenticated;
GRANT ALL ON public.languages TO service_role;
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "languages readable" ON public.languages FOR SELECT USING (true);
CREATE POLICY "languages admin write" ON public.languages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_languages_updated BEFORE UPDATE ON public.languages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.languages (code, native_name, english_name, sort_order) VALUES
  ('en','English','English',1),
  ('hi','हिन्दी','Hindi',2),
  ('mai','मैथिली','Maithili',3),
  ('bho','भोजपुरी','Bhojpuri',4),
  ('mr','मराठी','Marathi',5),
  ('gu','ગુજરાતી','Gujarati',6),
  ('bn','বাংলা','Bengali',7),
  ('as','অসমীয়া','Assamese',8),
  ('or','ଓଡ଼ିଆ','Odia',9),
  ('pa','ਪੰਜਾਬੀ','Punjabi',10),
  ('ta','தமிழ்','Tamil',11),
  ('te','తెలుగు','Telugu',12),
  ('kn','ಕನ್ನಡ','Kannada',13),
  ('ml','മലയാളം','Malayalam',14),
  ('ur','اردو','Urdu',15),
  ('ne','नेपाली','Nepali',16),
  ('kok','कोंकणी','Konkani',17),
  ('ks','کٲشُر','Kashmiri',18),
  ('sd','سنڌي','Sindhi',19),
  ('sa','संस्कृतम्','Sanskrit',20),
  ('sat','ᱥᱟᱱᱛᱟᱲᱤ','Santali',21),
  ('brx','बड़ो','Bodo',22),
  ('doi','डोगरी','Dogri',23),
  ('mni','ꯃꯤꯇꯩꯂꯣꯟ','Manipuri',24)
ON CONFLICT (code) DO NOTHING;

-- PIN security
CREATE TABLE IF NOT EXISTS public.user_security (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash text,
  pin_salt text,
  pin_set_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.user_security TO service_role;
ALTER TABLE public.user_security ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_user_security_updated BEFORE UPDATE ON public.user_security
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auth attempt audit
CREATE TABLE IF NOT EXISTS public.auth_attempt_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile text NOT NULL,
  kind text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.auth_attempt_logs TO service_role;
ALTER TABLE public.auth_attempt_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth logs admin read" ON public.auth_attempt_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.auth_attempt_logs TO authenticated;
CREATE INDEX IF NOT EXISTS idx_auth_attempts_mobile ON public.auth_attempt_logs (mobile, created_at DESC);

-- Permission policy
CREATE TABLE IF NOT EXISTS public.permission_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL,
  required_for text NOT NULL DEFAULT 'all',
  is_mandatory boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission_policies TO anon, authenticated;
GRANT ALL ON public.permission_policies TO service_role;
ALTER TABLE public.permission_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permission policies readable" ON public.permission_policies FOR SELECT USING (true);
CREATE POLICY "permission policies admin write" ON public.permission_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_permission_policies_updated BEFORE UPDATE ON public.permission_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.permission_policies (permission_key, display_name, description, required_for, is_mandatory, sort_order) VALUES
  ('location','Location','Drivers share live location so nearby bookings reach them, and customers see the driver on the map.','rider',true,1),
  ('notifications','Notifications','Ride requests and ride status updates arrive instantly on your phone.','all',false,2),
  ('camera','Camera','Only used when you choose to take a new profile photo.','all',false,3),
  ('photos','Photos','Only used when you pick a profile photo from your gallery.','all',false,4)
ON CONFLICT (permission_key) DO NOTHING;

-- Per-user permission status
CREATE TABLE IF NOT EXISTS public.user_permission_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  platform text,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  granted_at timestamptz,
  denied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_key)
);
GRANT SELECT, INSERT, UPDATE ON public.user_permission_status TO authenticated;
GRANT ALL ON public.user_permission_status TO service_role;
ALTER TABLE public.user_permission_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own permission status" ON public.user_permission_status FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "insert own permission status" ON public.user_permission_status FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "update own permission status" ON public.user_permission_status FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_user_permission_status_updated BEFORE UPDATE ON public.user_permission_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Profile extras
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS onboarding_step text NOT NULL DEFAULT 'done';

-- Settings
INSERT INTO public.app_settings (key, numeric_value, description) VALUES
  ('pin_length', 4, 'Number of digits in the login PIN'),
  ('max_failed_pin_attempts', 5, 'Wrong PIN attempts before temporary lockout'),
  ('pin_lockout_minutes', 15, 'Minutes a user stays locked out after too many wrong PINs'),
  ('otp_expiry_seconds', 300, 'How long an SMS code stays valid'),
  ('otp_resend_cooldown_seconds', 60, 'Wait time before another SMS code can be sent'),
  ('otp_max_attempts', 5, 'Wrong code attempts allowed per SMS code'),
  ('otp_enabled', 1, 'SMS code verification switched on (1) or off (0)'),
  ('pin_login_enabled', 1, 'PIN login switched on (1) or off (0)')
ON CONFLICT (key) DO NOTHING;