# Verification and remaining external checks

Validated on 19 October 2026 with Node 24 and Next.js 16.4.2.

- Production compilation and TypeScript checks passed.
- Integration suite: 52 passing checks, including real HTTP routes, PDF validation, signed payment amount/replay checks, concurrent SQLite writes, atomic agent claims, refunds, private downloads and restart persistence.
- Production dependency audit: zero reported vulnerabilities after compatible updates.
- ESLint: no errors; remaining warnings concern existing React effect dependencies and an image optimization suggestion.
- Browser: homepage, PDF selection/page count/pricing, direct login-free console, imported orders and paused queue inspected. Browser console showed no errors on the inspected pages.
- Included SumatraPDF executable: Windows Authenticode signature valid. The executable was not used to print during testing.
- Existing five legacy orders imported without overwriting db.json. Historical in-flight orders require review. A backup was created under backups/.

Not validated: physical printing, installed printer capabilities, live Razorpay settlements/refunds, Meta webhook delivery, recovery from real hardware power loss, or public deployment. These require the relevant hardware/accounts and deployment environment.

Development dependency audit still reports transitive advisories in the older Tailwind/Next ESLint glob/parser toolchain. The remaining braces advisory has no patched version in that dependency line. Build only trusted source; production dependency audit is separately clean. Do not run a forced downgrade of Next.js ESLint or an untested Tailwind major migration to conceal these warnings.

Login has been deliberately paused only for local use. This does not provide public authentication. See README.md for deployment gates, backup/restore, migration, retention and printer recovery procedures.
