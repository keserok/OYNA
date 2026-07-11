-- ==============================================================================
-- OYNA APP - CONFLICT PREVENTION TRIGGER
-- Prevents a Goalkeeper or Referee from accepting a match 
-- if they already have an accepted match in the same time slot and date.
-- ==============================================================================

CREATE OR REPLACE FUNCTION check_match_conflict()
RETURNS TRIGGER AS $$
DECLARE
    conflict_count INT;
BEGIN
    -- Only check if the status is changing to 'ACCEPTED'
    IF NEW.status = 'ACCEPTED' AND (OLD.status IS NULL OR OLD.status != 'ACCEPTED') THEN
        
        -- Check if there's already an accepted offer for the same provider, date, and time
        SELECT COUNT(*)
        INTO conflict_count
        FROM service_offers
        WHERE provider_id = NEW.provider_id
          AND id != NEW.id
          AND status = 'ACCEPTED'
          AND offer_date = NEW.offer_date
          AND offer_time = NEW.offer_time;

        -- If a conflict is found, abort the transaction and raise an exception
        IF conflict_count > 0 THEN
            RAISE EXCEPTION 'CONFLICT_DETECTED: Kullanıcının bu tarih ve saatte zaten onaylanmış bir maçı bulunmaktadır.';
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger on the service_offers table
DROP TRIGGER IF EXISTS trg_check_match_conflict ON service_offers;
CREATE TRIGGER trg_check_match_conflict
BEFORE UPDATE ON service_offers
FOR EACH ROW
EXECUTE FUNCTION check_match_conflict();
