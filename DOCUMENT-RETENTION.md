# Document lifecycle and priority fixes

Apply migrations before starting the updated multi-shop server:

```powershell
npm run db:migrate
```

The migration command uses `.env.multishop.local`. For another deployment, run `scripts/migrate.cjs` with its DATABASE_URL. Migration 005 adds document deletion markers, backfills upload expiry dates, and creates shared request budgets. No PDF bytes are deleted by the migration.

Full-document quotes reuse the original upload. Subset/reordered-page quotes still create a separate printable PDF. Failed metadata inserts attempt to delete their uploaded object. Quotes abandoned before checkout are eligible for retention cleanup.

## Cleanup

Local preview: `npm run cleanup` (uses `.env.local`, defaults to 30 days via RETENTION_DAYS).

Multi-shop preview:

```powershell
node --env-file=.env.multishop.local scripts/cleanup-documents.cjs
```

Multi-shop cleanup uses each shop's retention_days and the same STORAGE_BUCKET / STORAGE_ENDPOINT / credentials as the application. Without a bucket it uses DATA_DIR/storage. After reviewing the preview, stop **all** application instances and print agents, then add `--apply --server-stopped` to the command. Resume services afterward. Arrange regular maintenance runs; this change does not install a scheduler.

Cleanup retains live quotes, active/failed orders awaiting resolution, pending refunds, payment reviews, and paid cancelled orders without a processed refund. Completed/cancelled orders must also be older than the retention period measured from their last update. Metadata is preserved in PostgreSQL and marked deleted only after bytes are removed. Backups and object-store version history require their own retention policy; they are not deleted by this command.

## Request budgets

Each shop is limited to 60 upload requests and 120 checkout requests per minute. PostgreSQL counters apply across server instances. Local mode uses per-process counters. This is an aggregate cost guard, not a substitute for an ingress firewall or per-customer authentication. Upload bodies are bounded while being read (including chunked transfers); checkout JSON is capped at 64 KiB. HTTP 429 responses include Retry-After.

## Other corrections

Multi-shop pickup capacity, preparation time, opening hours, document limits and finishing settings are now mapped into database updates. Rule/settings upserts also persist values on their initial insert. Multi-shop checkout checks blocked phone numbers. The queue now points to the supported Node print agent.

## Verification

Run `npm run test:priority` for retention/body-limit checks, `npm run test:checkout` for PDF/page-selection and order-flow checks, and `npm run test:priority:multishop` for real PostgreSQL regressions. The last command uses an isolated temporary schema and temporary PDFs; it does not modify shop data.
