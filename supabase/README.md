# Supabase client access and creative flag history

The migration creates four tables. `clients` holds client IDs and their Supabase
Auth login UUIDs. `app_users` holds numeric user IDs. `client_users` defines the
overlapping assignments. `creative_flags` stores one observed flag per row,
including client/user IDs, ad ID, creative name, filter snapshot, metric, signed
drop percentage, observation date, seven-day window and recording timestamp.

The seed creates exactly these assignments:

| Client | Assigned users |
| --- | --- |
| 1 | 1, 2, 3, 4, 5 |
| 2 | 4, 5, 6 |

Both clients can see profiles 4 and 5. Each client can only see flag records with
its own client ID, even for these shared users. A composite foreign key prevents
storing a client 1 flag against user 6, or a client 2 flag against users 1–3.

## Apply to the selected Supabase project

Apply `migrations/20261006000100_client_creative_flags.sql` as a migration, then
execute `seed.sql`. Alternatively, run them in that order in the Supabase SQL
Editor. Seed inserts preserve existing rows and do not change login assignments.
The migration deliberately fails if those table names already exist; inspect
existing tables before applying it to an established project.

Create two real accounts using Supabase Auth, then assign their actual UUIDs in
the SQL Editor or trusted backend:

```sql
-- Replace the UUIDs with existing auth.users IDs; these are placeholders.
update public.clients set auth_user_id = '<client-1-auth-uuid>'::uuid where client_id = 1;
update public.clients set auth_user_id = '<client-2-auth-uuid>'::uuid where client_id = 2;
```

Numbered users 1–6 are client data, not automatically created login accounts.
Unassigned client logins cannot see data. Anonymous access is denied. Client
logins can read their assigned data and append their own flag records. Memberships,
login assignments and edits/deletions of flag history remain administration-only.
Keep a service-role key on the server.

## Connect the app

Copy `.env.example` from the project root to `.env.local`, then fill in your
Supabase project URL and browser-safe publishable key. Restart the Vite dev
server. For Vercel, add the same two environment variables and rebuild/deploy.
Never use a Supabase secret/service-role key in a `VITE_` variable.

Vercel's Supabase integration is also supported directly: the build maps its
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or public
anon key) to the two Vite variables. Explicit `VITE_` settings take precedence.
Only the public URL and browser-safe key are included in the frontend bundle.
Redeploy after connecting the integration or changing its environment variables.

Open **Client database**, sign in as one of the two provisioned client accounts,
and view the assigned users and latest 100 saved flags. The browser queries the
real tables; row-level security enforces the client scope. No demo rows are shown
when the connection is missing.

The **Creative analysis** page keeps its loaded CSV when you switch pages. Choose
an assigned user in **Save flagged ads** to append the currently visible CTR flags
and enabled CPC filter matches. Nothing is saved automatically on recalculation.
The button prevents repeated saves of the same calculation/user within the page
session; a later recalculation can create another historical observation.

## Query the assigned users

```sql
select cu.client_id, u.user_id, u.display_name
from public.client_users cu
join public.app_users u using (user_id)
order by cu.client_id, u.user_id;
```

Authenticated requests are automatically restricted by row-level security.
Changing a client ID in a browser query does not grant access to the other client.

## Record an observed flag

Use the shared calculation output. `drop_percent` is `drop * 100` for CTR, or
`cpc_drop * 100` for CPC, not the UI's signed CPC change. A CPC increase of 99.03%
is recorded as a drop of -99.03 with metric `cpc`. `creative_filter` records the
settings used for that calculation, including any selected creative/ad IDs.

Example insert shape (illustrative, not seeded history):

```json
{
  "client_id": 1,
  "user_id": 1,
  "ad_id": "SAMPLE-01",
  "creative_name": "Use the creative name from the calculation",
  "creative_filter": {
    "drop_threshold": 0.3,
    "minimum_delivery_days": 14,
    "minimum_current_impressions": 5000,
    "cpc_increase_threshold": 0.8,
    "filter_delivery_days": true,
    "filter_current_impressions": true,
    "selected_ad_ids": ["SAMPLE-01"]
  },
  "metric": "cpc",
  "drop_percent": -99.03,
  "dropped_on": "2026-09-28",
  "current_window_start": "2026-09-22",
  "current_window_end": "2026-09-28"
}
```

The current app calculates a single trailing window. Its observation date is the
window end; it cannot establish the first day a creative crossed a threshold.
`flagged_at` records when the result was saved. No historical flags are fabricated
by the seed. CSV analysis remains available without signing in; authenticated
persistence requires actual login accounts and an assigned user selected for the
ads being saved. If a CSV mixes owners, save each owner's ads separately.

## Verify access policies

`tests/access-control.sql` runs transactional PostgreSQL checks for both clients,
shared users, denied cross-client access/writes, anonymous access and membership
integrity. It requires the migration and seed and rolls back its test fixtures.

Local PostgreSQL 17 validation passed using isolated `auth.users`, `auth.uid()`
and API-role stubs. This verifies SQL execution, membership constraints and policy
behavior, not a connection to a live Supabase project. A Chrome browser smoke test
also passed with mocked Supabase responses for sign-in, assigned users, saving,
logout and switching clients. The browser smoke script is
`scripts/smoke-client-database.cjs`; run it against Vite configured with
`https://demo.supabase.co` and a test publishable key. Supply `PLAYWRIGHT_PATH`
when Playwright is installed outside this project. No real Supabase credentials
or passwords are used by that test.

The access model follows [Supabase row-level security guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
Authentication uses the [official Supabase JavaScript client](https://supabase.com/docs/guides/auth/quickstarts/react).
