BEGIN;
ALTER TABLE documents ADD COLUMN deleted_at TIMESTAMPTZ;
UPDATE documents d SET expires_at=d.uploaded_at + COALESCE((SELECT retention_days FROM shop_settings WHERE shop_id=d.shop_id),7) * interval '1 day' WHERE expires_at IS NULL;
CREATE TABLE request_limits (
 shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
 operation TEXT NOT NULL,
 window_start TIMESTAMPTZ NOT NULL,
 requests INT NOT NULL,
 PRIMARY KEY(shop_id,operation)
);
INSERT INTO schema_migrations(version) VALUES('005_document_lifecycle');
COMMIT;
