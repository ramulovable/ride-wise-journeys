UPDATE public.fare_slabs s SET is_active = false, updated_at = now()
FROM public.fare_rules r
WHERE s.fare_rule_id = r.id AND r.vehicle_class = 'three_wheeler' AND r.journey_type = 'reserve';

UPDATE public.fare_rules SET is_active = false, updated_at = now()
WHERE vehicle_class = 'three_wheeler' AND journey_type = 'reserve';