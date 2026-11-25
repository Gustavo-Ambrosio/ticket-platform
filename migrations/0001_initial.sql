PRAGMA foreign_keys = ON;
CREATE TABLE events (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT NOT NULL, starts_at TEXT NOT NULL,
 city TEXT NOT NULL, venue TEXT NOT NULL, description TEXT NOT NULL, instagram_url TEXT,
 published INTEGER NOT NULL DEFAULT 1, demo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE lots (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), name TEXT NOT NULL,
 price_cents INTEGER NOT NULL CHECK(price_cents > 0), capacity INTEGER NOT NULL CHECK(capacity >= 0),
 position INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE orders (
 id TEXT PRIMARY KEY, access_token TEXT NOT NULL UNIQUE, lot_id TEXT NOT NULL REFERENCES lots(id),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 6), amount_cents INTEGER NOT NULL,
 buyer_name TEXT NOT NULL, buyer_email TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled','refunded','charged_back')),
 preference_id TEXT, payment_id TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX orders_lot_status ON orders(lot_id,status);
CREATE TABLE tickets (
 code TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), ordinal INTEGER NOT NULL,
 checked_in_at TEXT, UNIQUE(order_id,ordinal)
);
CREATE TRIGGER reserve_capacity BEFORE INSERT ON orders WHEN NEW.status = 'pending'
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM lots WHERE id=NEW.lot_id AND enabled=1)
 THEN RAISE(ABORT, 'LOT_UNAVAILABLE') END;
 SELECT CASE WHEN NEW.quantity + COALESCE((SELECT SUM(quantity) FROM orders WHERE lot_id=NEW.lot_id AND status IN ('pending','paid')),0)
 > (SELECT capacity FROM lots WHERE id=NEW.lot_id) THEN RAISE(ABORT, 'SOLD_OUT') END;
END;
INSERT INTO events VALUES ('encontro-na-floresta','Encontro na Floresta','Uma nova frequência. A mesma conexão.','2027-02-13T18:00:00-03:00','Francisco Beltrão – PR','Local demonstrativo · a definir','Um encontro entre música, natureza e pessoas. Uma jornada de psytrance para dançar, se conectar e viver a pista com o Coletivo Green Culture. Informações e valores ilustrativos para apresentação da plataforma.',NULL,1,1);
INSERT INTO lots VALUES ('raiz','encontro-na-floresta','Raiz',6000,50,1,1),('crescer','encontro-na-floresta','Crescer',8000,100,2,1),('florescer','encontro-na-floresta','Florescer',10000,100,3,1);
