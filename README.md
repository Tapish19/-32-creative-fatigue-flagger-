# Creative Fatigue Flagger

Small React + TypeScript implementation of the Monastic Media challenge. CSV analysis works without an account. The optional Client database page uses Supabase Auth and PostgreSQL for assigned users and saved creative flag history.

## Run

Install Node.js 20+ and run `npm install`, then `npm run dev`. Run `npm test` and `npm run build` to verify.

Upload a CSV or load an HTTPS CSV URL. Browser URL downloads require the source to permit CORS; uploading a downloaded file works without CORS. "Load official sample" reads the user-provided official CSV bundled at public/sample-data.csv without an external download. It contains 243 rows and 10 creatives. All sample metrics were independently calculated using Python's csv module and compared with the TypeScript implementation. At the default threshold SAMPLE-01, SAMPLE-08, SAMPLE-05 and SAMPLE-04 flag; SAMPLE-07 has insufficient volume and SAMPLE-10 is too new.

## Client database

Open **Client database** from the page navigation to sign in and view your assigned users and saved flags. Client 1 is assigned users 1–5; client 2 is assigned users 4–6. Users 4 and 5 are shared, but each client's flag history stays separate. The SQL migration, seeds, policies, setup instructions and database tests are in [supabase/README.md](supabase/README.md). Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` using `.env.example`. On the analysis page, select an assigned user and choose **Save flagged ads** to record visible flags with their filter snapshot, signed drop percentage and observation date. Recalculation does not save history automatically.

## Calculation decisions

Group by ad_id, sort by date. Baseline uses the first seven distinct positive-impression delivery days. Current uses the last seven calendar days ending on the maximum date in the file. Both CTRs are total clicks / total impressions. Drop is 1 - current / baseline. Fewer than the selected delivery days minimum (default 14) takes precedence over fewer than the selected current impressions minimum (default 5,000). Remaining creatives flag at a relative drop >= the configured threshold (default 0.30).

Zero baseline makes drop undefined and is explained without flagging. Zero current impressions makes current CTR undefined. Paused/missing dates are sparkline gaps. Negative CTR drops represent improvement. Undefined drops sort last. Duplicate creative/date rows are rejected. Displayed values round to two decimals; decisions use full precision. A tiny floating-point tolerance handles exact threshold boundaries. spend_inr does not affect CTR fatigue status.

The results include baseline/current cost per click (CPC) in INR and CPC change. CPC uses total spend_inr / total clicks in the same baseline and current windows, rather than averaging daily CPCs. Edit "Filter at CPC increase (%)" beside the CTR threshold, then enable the CPC increase filter. The default is 80%; every change reruns the full analysis from the loaded CSV, including CTR, CPC, eligibility, explanations and combined filters. Any finite, non-negative percentage is accepted, including values above 100%. Only increases strictly above the selected threshold match; exactly the threshold is excluded. The table displays current / baseline - 1: positive values mean higher costs. The API keeps cpc_drop = 1 - current / baseline, so negative drops below the negative selected threshold match the filter. Zero-click windows have undefined CPC; a zero or undefined baseline CPC makes relative change undefined and is excluded from the filter. CPC selection is independent of CTR fatigue status; the attention count reflects flagged creatives in the visible results. CTR sorting is preserved. At the default 80% threshold, the official sample matches SAMPLE-01 and SAMPLE-07, including SAMPLE-01's 99.03% CPC increase.

The table also supports optional minimum delivery days and minimum impressions (last 7 days) filters. Edit the minimums beside the CPC input (defaults: 14 and 5,000), then enable either filter above the table. Exact minimums are included; only non-negative safe whole numbers are accepted. Days count positive-impression delivery days across the dataset, excluding pauses. Impressions sum the existing global seven-calendar-day current window. Every threshold edit, checkbox toggle and Clear filters action reruns the complete calculation from the loaded CSV. The selected days and impression minimums also determine CTR fatigue eligibility and status explanations, even when their table-filter checkboxes are off. All enabled filters apply together. Clear filters shows all creatives while retaining the selected thresholds. The attention count reflects flagged creatives in the visible results. A Delivery days column shows the age used by the filter. With all three default filters enabled, only SAMPLE-01 matches.

## API

Deploy to Vercel to serve `api/analyze.ts` as an Edge Function alongside the Vite build. `npm run dev` serves the frontend only; it calculates locally with the same shared function.

POST /api/analyze with JSON containing exactly one of `csv_text` or `csv_url`, and optional numeric `drop_threshold` (fraction 0–1). API URL loading is deliberately limited to the official sample URL to avoid private-network fetching; other data can use csv_text. Download limit: 2 MB; timeout: 10 seconds; redirects rejected.

Response: current_window, drop_threshold, minimum_delivery_days, minimum_current_impressions, creatives, flagged_creatives, filtered_creatives. CTRs/drop are fractions or null. Every creative contains identity, format, delivery_days, baseline_ctr, current_ctr, current_impressions, drop, baseline_cpc, current_cpc, cpc_drop, status, explanation and daily points. CPC values are INR per click or null; cpc_drop is a fraction or null. Errors return 400 with an error message; unsupported methods return 405.

## Remaining delivery steps

Deploy, publish a public repo and record a two-minute walkthrough. No application or challenge has been submitted.

## Verification in this environment

TypeScript checking, the production build, and all 37 Vitest tests passed. Coverage includes the official sample, CSV parsing, API responses, weighted CTR/CPC calculations, combined delivery/CPC filters, inclusive delivery minimums, strict CPC increase filter boundaries, pauses, and zero-click windows. Vitest was run outside the restricted sandbox so its test workers could start. Dependencies were installed from a local offline cache; the CSV reader is a small state machine supporting quoted commas, embedded newlines and escaped quotes because the planned parser library was unavailable.

Client access policies and flag membership integrity were also verified against an isolated PostgreSQL 17 database with Supabase Auth role/function stubs. This is local validation; the schema has not yet been applied to a live Supabase project.
