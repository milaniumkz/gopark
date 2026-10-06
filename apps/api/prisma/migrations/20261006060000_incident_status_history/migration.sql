-- Preserve every status/stage transition, including updates made outside mobile API.
ALTER TABLE "incidents" ADD COLUMN "status_history" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE FUNCTION record_incident_status_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_history := jsonb_build_array(jsonb_build_object(
      'status', NEW.status, 'serviceStage', NEW.service_stage,
      'changedAt', clock_timestamp()));
  ELSE
    NEW.status_history := OLD.status_history;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.service_stage IS DISTINCT FROM OLD.service_stage THEN
      NEW.status_history := OLD.status_history || jsonb_build_array(jsonb_build_object(
        'status', NEW.status, 'serviceStage', NEW.service_stage,
        'changedAt', clock_timestamp()));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incident_status_history
BEFORE INSERT OR UPDATE ON "incidents"
FOR EACH ROW EXECUTE FUNCTION record_incident_status_history();
-- Existing rows keep empty history: past transition times cannot be reconstructed.
