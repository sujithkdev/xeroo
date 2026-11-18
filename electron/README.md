# Xeroo Desk

The connected desktop application starts at `electron/cloud-main.cjs`.
Run `npm run electron:dev` to open it, and `npm run electron:build` to generate Setup and Portable executables in `dist-electron/`.
The connected edition uses the hosted website; it does not start a local Next.js server.
Connection handling lives in `connection.cjs` and `connect-preload.cjs`; printing uses the root `print-agent.js`, `agent/`, and `SumatraPDF.exe`.

The optional offline counter edition starts at `counter-main.cjs`. Build it with `npm run counter:build`; output goes to `dist-counter/`.

Retired Java and tray-only Electron implementations were moved to `backups/cleanup-2026-11-18/`. Current pilot installers remain in `dist-electron/`. Shop data, temporary hosting, owner/admin features, and environment configuration were preserved.
