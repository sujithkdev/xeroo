BEGIN;
ALTER TABLE orders ADD COLUMN checkout_payload JSONB;
ALTER TABLE orders DROP CONSTRAINT orders_order_status_check;
ALTER TABLE orders ADD CHECK(order_status IN ('pending','accepted','queued','downloading','printing','submitted','ready','completed','collected','cancelled','failed','cancel_requested','waiting_approval','waiting_cash','error'));
CREATE TABLE checkout_state (
 shop_id UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
 quotes JSONB NOT NULL DEFAULT '[]'::jsonb
);
ALTER TABLE print_rules ADD COLUMN slot_page_capacity INT NOT NULL DEFAULT 500 CHECK(slot_page_capacity>0);
INSERT INTO schema_migrations(version) VALUES('003_checkout');
COMMIT;
