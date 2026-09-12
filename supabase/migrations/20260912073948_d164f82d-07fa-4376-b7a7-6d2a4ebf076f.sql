CREATE OR REPLACE FUNCTION public.validate_fare_slab_overlap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_active AND EXISTS (
    SELECT 1 FROM public.fare_slabs s
    WHERE s.fare_rule_id = NEW.fare_rule_id AND s.is_active AND s.id <> NEW.id
      AND numrange(s.min_km, s.max_km, '[]') && numrange(NEW.min_km, NEW.max_km, '[]')
  ) THEN
    RAISE EXCEPTION 'Fare distance ranges cannot overlap';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.validate_fare_slab_overlap() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validate_fare_slab_overlap ON public.fare_slabs;
CREATE TRIGGER trg_validate_fare_slab_overlap BEFORE INSERT OR UPDATE ON public.fare_slabs
FOR EACH ROW EXECUTE FUNCTION public.validate_fare_slab_overlap();

CREATE OR REPLACE FUNCTION public.audit_admin_catalog_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid();
DECLARE row_id text;
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'admin') THEN RETURN COALESCE(NEW, OLD); END IF;
  row_id := COALESCE(NEW.id, OLD.id)::text;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    actor,
    lower(TG_OP),
    TG_TABLE_NAME,
    row_id,
    jsonb_build_object('before', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
                       'after', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END)
  );
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.audit_admin_catalog_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_audit_vehicle_categories AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_categories
FOR EACH ROW EXECUTE FUNCTION public.audit_admin_catalog_change();
CREATE TRIGGER trg_audit_vehicle_brands AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_brands
FOR EACH ROW EXECUTE FUNCTION public.audit_admin_catalog_change();
CREATE TRIGGER trg_audit_vehicle_models AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_models
FOR EACH ROW EXECUTE FUNCTION public.audit_admin_catalog_change();
CREATE TRIGGER trg_audit_fare_rules AFTER INSERT OR UPDATE OR DELETE ON public.fare_rules
FOR EACH ROW EXECUTE FUNCTION public.audit_admin_catalog_change();
CREATE TRIGGER trg_audit_fare_slabs AFTER INSERT OR UPDATE OR DELETE ON public.fare_slabs
FOR EACH ROW EXECUTE FUNCTION public.audit_admin_catalog_change();