BEGIN;
ALTER TABLE orders DROP CONSTRAINT orders_amount_paise_check;
ALTER TABLE orders ADD CONSTRAINT orders_amount_paise_check CHECK (
 amount_paise > 0 OR (amount_paise = 0 AND COALESCE(checkout_payload->>'synthetic','false')='true')
);
INSERT INTO schema_migrations(version) VALUES('007_printer_test_orders');
COMMIT;
