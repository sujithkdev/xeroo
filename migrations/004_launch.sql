BEGIN;
ALTER TABLE checkout_state ADD COLUMN launch JSONB NOT NULL DEFAULT '{}'::jsonb;
INSERT INTO schema_migrations(version) VALUES('004_launch');
COMMIT;
