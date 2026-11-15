# Xeroo pilot deployment — techpickhub.shop

## Before deployment

The domain is registered at Hostinger. Hosting has not been purchased or connected.
Use a Linux VPS capable of Docker Compose. A starting capacity estimate for a
small pilot is 2 CPU cores and 4 GB RAM; measure PDF workloads before expanding.
Keep SSH restricted to trusted administrators. Expose only SSH, HTTP and HTTPS;
PostgreSQL and the application port are internal to Docker.

In Hostinger's DNS editor, point these A records to the VPS IPv4 address:

| Name | Value |
| --- | --- |
| @ | VPS IPv4 |
| admin | VPS IPv4 |
| * | VPS IPv4 |

Preserve existing email MX/TXT records. Remove only conflicting website records.
Caddy obtains individual HTTPS certificates only for the admin/root domain and
registered, enabled shop subdomains. No wildcard certificate or DNS API key is needed.

## Install

Clone the private repository using an authorized SSH/deploy key. From its root:

```sh
cp deploy/.env.example deploy/.env
# Set POSTGRES_PASSWORD to a newly generated 64-character hex value.
# Set PAYMENTS_ENCRYPTION_KEY to a different 64-character hex value.
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
```

Generate values with `openssl rand -hex 32`; save the configuration securely.
Do not publish it in chat or Git. The server uses a persistent private document
volume for the first pilot; S3-compatible storage is optional.

Create the first administrator through a shell on the server. Export
BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD securely (avoid command history), then:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yml exec \
  -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD app npm run admin:bootstrap
unset BOOTSTRAP_ADMIN_PASSWORD
```

The script refuses to replace an existing administrator. Open
https://admin.techpickhub.shop/admin/login, create a shop, and privately share its
48-hour activation link. Invitation delivery is manual; no email is sent.

## Desktop and first order

1. Install XerooDesk-Setup on the shop PC; Windows printer drivers are still required.
2. Enter `shop-slug.techpickhub.shop`, sign in as owner, choose Shop → Register this computer.
3. Open Computer & printer setup, refresh discovered printers, save real capabilities
   and default B&W/colour printers. The agent must be online.
4. Enable the queue, queue one test page, inspect the paper and confirm output in
   Needs attention. No software check proves physical print success.
5. Review prices and shop details, enable customer orders, scan the customer QR code.
6. Place a cash order on a phone; staff confirms cash receipt, output and collection.
7. Test disconnection and restart without reprinting uncertain jobs. Keep the agent journal.

The desktop app requires internet and stops its agent when closed. It does not
offer offline ordering. One active printing computer per shop is enforced.

## Backup and recovery gate

Run `sh deploy/backup.sh` on the VPS to stop the app, save a coordinated database/document backup and restart it. The script uses the private volume; S3 needs a separate object backup.

Before live use, stop the app for a consistent coordinated database/document backup.
Use `pg_dump -U xeroo -d xeroo` in the db container and archive `/app/data` from the
documents volume, then restart app. Keep encrypted copies off the VPS. Save the
deployment secrets separately. For S3 use the matching object backup/versioning.
Restore into a separate test deployment and verify order counts, PDFs and access
before relying on the backup. Do not roll back the database independently of the
documents or desktop recovery journal. Uncertain print jobs require staff review.

## Release boundaries

This release targets cash-based pilot ordering. Subscription billing, online
refund workflows, WhatsApp and unattended notification delivery are not enabled.
Hardware output, fresh-Windows installation, live HTTPS and restore drills must
be signed off separately. No DNS changes or public deployment occur merely by
building this repository.
