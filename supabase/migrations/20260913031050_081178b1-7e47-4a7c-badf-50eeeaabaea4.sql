CREATE TABLE public.ride_dismissals (
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rider_id, ride_id)
);

GRANT SELECT, INSERT, DELETE ON public.ride_dismissals TO authenticated;
GRANT ALL ON public.ride_dismissals TO service_role;

ALTER TABLE public.ride_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Riders can read own ride dismissals"
ON public.ride_dismissals
FOR SELECT
TO authenticated
USING (rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Riders can dismiss broadcasts for themselves"
ON public.ride_dismissals
FOR INSERT
TO authenticated
WITH CHECK (
  rider_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.rides
    WHERE rides.id = ride_dismissals.ride_id
      AND rides.rider_id IS NULL
      AND rides.status IN ('requested', 'searching')
  )
);

CREATE POLICY "Riders can restore own dismissed broadcasts"
ON public.ride_dismissals
FOR DELETE
TO authenticated
USING (rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_ride_dismissals_ride_id ON public.ride_dismissals(ride_id);