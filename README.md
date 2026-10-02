# Booking app (Stretching i gruppe)

Class booking and class passes for a group stretching studio.

**Clients** (web, Norwegian): sign in with their phone number (SMS code), pick a weekly time and tap **Gå fast** to add it to *Min timeplan*. They are then signed up for every class at that time. If they can't come they tap **Jeg kommer ikke** at least 12 hours before, and no class is used. They can make up a class in another group, book a single class, pause for holidays, and buy passes with Vipps or card.

**Owner** (`/admin`, Ukrainian, installable on iPhone): today's classes and who is coming, clients who need a new pass or have one class left, groups and their weekly times, a calendar with attendee lists, cancelling a class or a whole period, client pages (schedule, passes, payments), and passes sold in person.

Stack: Next.js (App Router) + Supabase (Postgres, phone auth, row level security, pg_cron) + Vipps MobilePay ePayment API + Stripe Checkout.

## How it works

- **Groups** have weekly times (e.g. Gruppe 1: Tuesday and Thursday 18:00). Classes are created from them 8 weeks ahead.
- **Min timeplan**: a client can have any number of weekly times, across groups. Each time takes one of the group's spots.
- **Attendance**: every client has a row per class: coming, not coming, needs a new pass, attended, no-show, or cancelled.
- **Cutoff**: 12 hours before each class it is locked and everyone still coming uses one class from their pass. The first class used starts the pass's 30 days.
- **No pass**: a client whose pass is used up or expired keeps their weekly times but is marked "needs a new pass" and doesn't take a spot. Buying a pass signs them back up automatically.
- **Cancelled class**: everyone gets their class back.
- **Payments**: a pass is issued only after Vipps or Stripe confirms the payment (`settlePayment()` re-checks with the provider, then the idempotent `fulfil_payment` database function issues the pass).

All rules live in database functions in `supabase/migrations/0001_init.sql`; `supabase/tests/rules_test.sql` exercises them on a local Postgres.

## Setup

1. **Supabase**: create a project.
   - SQL editor: run `supabase/migrations/0001_init.sql`, then enable the `pg_cron` extension (Database → Extensions) and run `0002_cron.sql`, then `supabase/seed.sql` (the three passes and an example group).
   - Authentication → Sign In / Providers → **Phone**: enable it and connect an SMS provider (e.g. Twilio). This sends the login codes, roughly 0.5–1 kr per SMS.
2. **Env**: copy `.env.example` to `.env.local` and fill it in. Never commit real keys.
3. `npm install && npm run dev`, open http://localhost:3000 and sign in with your phone.
4. Make yourself the owner (SQL editor): `update public.profiles set is_admin = true where phone = '4791234567';`
5. **Vipps**: in portal.vippsmobilepay.com → Utvikler, create test keys (client ID, client secret, subscription key, merchant serial number) and set the `VIPPS_*` vars. Register a webhook for `epayments.payment.authorized.v1`, `.aborted.v1`, `.expired.v1` and `.terminated.v1` pointing at `<site>/api/webhooks/vipps`. Switch `VIPPS_ENV=production` with production keys when going live.
6. **Stripe** (optional, card payments): add a webhook endpoint `<site>/api/webhooks/stripe` with the `checkout.session.*` events listed in `.env.example`.
7. Deploy to Vercel with the same env vars, plus `CRON_SECRET` (any long random string). `vercel.json` runs `/api/cron/daily` every morning: it creates classes ahead and locks due ones as a backup for pg_cron, and the daily request keeps a free Supabase project from pausing (free projects pause after 7 days without activity).

## iPhone

Open the site in Safari, tap Share → Add to Home Screen. It opens straight into the owner dashboard.
