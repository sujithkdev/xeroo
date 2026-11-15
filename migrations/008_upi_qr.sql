BEGIN;
ALTER TABLE orders DROP CONSTRAINT orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('online','cash','upi_qr'));

INSERT INTO schema_migrations(version) VALUES ('008_upi_qr');
COMMIT;
