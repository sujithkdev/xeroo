BEGIN;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS detected_printers JSONB NOT NULL DEFAULT '[]';
INSERT INTO schema_migrations(version) VALUES('006_desktop_devices');
COMMIT;
