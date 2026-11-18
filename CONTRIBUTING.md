# Contributing

Read [the project map](docs/STRUCTURE.md) before changing paths. Use the Node version in CI (currently 24) and install with `npm ci` from the repository root.

Keep changes focused and preserve existing shop data. Never commit environment files, customer uploads, local databases, backup archives, or generated installers. New database changes belong in a new numbered migration; do not rewrite applied migrations.

Run the checks appropriate to the change. Changes to test locations must update package scripts and CI together. Changes to desktop paths must update both packaging editions. Record deployment behavior in `docs/operations/`; keep historical notes in `docs/history/`.
