CREATE TABLE public.promotional_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  image_url text,
  action_url text,
  badge_text text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.promotional_banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotional_banners TO authenticated;
GRANT ALL ON public.promotional_banners TO service_role;

ALTER TABLE public.promotional_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active banners"
ON public.promotional_banners FOR SELECT
TO anon, authenticated
USING (is_active OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage banners"
ON public.promotional_banners FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_promotional_banners_updated
BEFORE UPDATE ON public.promotional_banners
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.promotional_banners (title, subtitle, badge_text, action_url, display_order) VALUES
('Welcome to Shahin Travels', 'Fast & safe local rides in Darbhanga — Bike, Auto, Car', 'Welcome', '/app', 1),
('Refer & Earn ₹20', 'Share your referral code & get instant wallet rewards', 'Earn', '/referral', 2),
('Become a Shahin Driver', 'Register your vehicle, daily rides, only ₹99/mo subscription', 'Drive', '/rider', 3),
('24x7 WhatsApp Support', 'Tap to chat directly on +91 93340 39007', 'Support', 'https://wa.me/919334039007', 4);