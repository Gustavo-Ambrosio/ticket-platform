import sqlite3, pathlib, unittest
root=pathlib.Path(__file__).resolve().parent.parent
class Inventory(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  for migration in sorted((root/'migrations').glob('*.sql')): self.db.executescript(migration.read_text(encoding='utf-8'))
 def reserve(self,ident,lot,qty,price):
  self.db.execute('INSERT INTO orders(id,access_token,lot_id,quantity,amount_cents,buyer_name,buyer_email) VALUES (?,?,?,?,?,?,?)',(ident,ident,lot,qty,price,'Teste','teste@example.com'))
 def test_capacity_and_next_lot(self):
  self.db.execute("UPDATE lots SET capacity=2 WHERE id='raiz'")
  with self.assertRaisesRegex(sqlite3.IntegrityError,'EARLIER_LOT'): self.reserve('early','crescer',1,8000)
  self.reserve('first','raiz',2,12000)
  with self.assertRaisesRegex(sqlite3.IntegrityError,'SOLD_OUT'): self.reserve('excess','raiz',1,6000)
  self.reserve('next','crescer',1,8000)
 def test_price_cannot_be_changed(self):
  with self.assertRaisesRegex(sqlite3.IntegrityError,'PRICE_CHANGED'):self.reserve('fake','raiz',2,1)
 def test_tickets_idempotent_checkin_atomic(self):
  self.reserve('one','raiz',1,6000)
  self.db.execute("UPDATE orders SET status='paid' WHERE id='one'")
  for code in ['code1','code2']:self.db.execute("INSERT OR IGNORE INTO tickets(code,order_id,ordinal) VALUES (?,'one',1)",(code,))
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM tickets').fetchone()[0],1)
  query="UPDATE tickets SET checked_in_at=CURRENT_TIMESTAMP WHERE code='code1' AND checked_in_at IS NULL AND EXISTS(SELECT 1 FROM orders WHERE id=tickets.order_id AND status='paid')"
  self.assertEqual(self.db.execute(query).rowcount,1)
  self.assertEqual(self.db.execute(query).rowcount,0)
 def test_refunded_ticket_cannot_enter(self):
  self.reserve('one','raiz',1,6000)
  self.db.execute("INSERT INTO tickets(code,order_id,ordinal) VALUES ('code','one',1)")
  self.db.execute("UPDATE orders SET status='refunded' WHERE id='one'")
  n=self.db.execute("UPDATE tickets SET checked_in_at=CURRENT_TIMESTAMP WHERE code='code' AND checked_in_at IS NULL AND EXISTS(SELECT 1 FROM orders WHERE id=tickets.order_id AND status='paid')").rowcount
  self.assertEqual(n,0)
if __name__=='__main__':unittest.main()
