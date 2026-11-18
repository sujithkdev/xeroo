# Shop onboarding and screen cleanup

## Create another shop

1. Start PostgreSQL and run `npm run start:multishop` after a production build.
2. Open `http://admin.print.localhost:3001` and sign in with an authorized platform administrator account.
3. In Shops, choose Add shop. Enter its name, unique subdomain, owner email, contact details, tagline and initial A4 black-and-white price.
4. Creation saves the shop, settings, service price and owner invitation in one transaction. Shops begin in testing with orders and automatic printing paused.
5. Copy the private invitation link and share it with the intended owner. No email is sent. Links expire in 48 hours and can be accepted once, only on the intended shop host.
6. The owner accepts with a new password, or their existing account password if they already have an account, then signs in at their shop address.
7. Configure services, operating hours, pickup capacity, payment and printer setup before enabling orders through the shop launch controls.

Name and tagline provide the initial branding. Logo uploading and automatic invitation email delivery are not part of this flow. External wildcard DNS and HTTPS must be configured separately for a real base domain. This change does not provision a permanent administrator or shop-owner account. The login-free SQLite workspace cannot onboard additional shops.

## Honest availability states

The invitation page uses real server records. Password recovery, platform user management, support tickets, consolidated audit browsing and global configuration explicitly state their current limitations. Contact does not claim to send enquiries. Pricing/rules display load errors and do not claim a failed save succeeded locally. Multi-shop printer editing is marked unavailable until its API is connected.

## Validation

The PostgreSQL integration suite creates disposable accounts and a disposable schema, exercises authorization, subdomain collisions, atomic creation, prices, invitation expiry, reuse, concurrent acceptance and shop isolation, then cleans up. No persistent demo accounts are required.
