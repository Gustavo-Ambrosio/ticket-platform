CREATE TABLE rate_limits(bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TRIGGER earlier_lot BEFORE INSERT ON orders WHEN NEW.status='pending'
BEGIN
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM lots l JOIN lots chosen ON chosen.id=NEW.lot_id
  WHERE l.event_id=chosen.event_id AND l.position<chosen.position AND l.enabled=1
  AND l.capacity>COALESCE((SELECT SUM(quantity) FROM orders WHERE lot_id=l.id AND status IN ('paid','pending')),0)
 ) THEN RAISE(ABORT,'EARLIER_LOT') END;
 SELECT CASE WHEN NEW.amount_cents != NEW.quantity*(SELECT price_cents FROM lots WHERE id=NEW.lot_id)
 THEN RAISE(ABORT,'PRICE_CHANGED') END;
END;
