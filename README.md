# Creative Fatigue Flagger

Small React + TypeScript implementation of the Monastic Media challenge. No database or account required.

## Run

Install Node.js 20+ and run `npm install`, then `npm run dev`. Run `npm test` and `npm run build` to verify.

Upload a CSV or load an HTTPS CSV URL. Browser URL downloads require the source to permit CORS; uploading a downloaded file works without CORS. "Load official sample" reads the user-provided official CSV bundled at public/sample-data.csv without an external download. It contains 243 rows and 10 creatives. All sample metrics were independently calculated using Python's csv module and compared with the TypeScript implementation. At the default threshold SAMPLE-01, SAMPLE-08, SAMPLE-05 and SAMPLE-04 flag; SAMPLE-07 has insufficient volume and SAMPLE-10 is too new.

## Calculation decisions

Group by ad_id, sort by date. Baseline uses the first seven distinct positive-impression delivery days. Current uses the last seven calendar days ending on the maximum date in the file. Both CTRs are total clicks / total impressions. Drop is 1 - current / baseline. Fewer than 14 delivery days takes precedence over fewer than 5,000 current impressions. Remaining creatives flag at a relative drop >= the configured threshold (default 0.30).

Zero baseline makes drop undefined and is explained without flagging. Zero current impressions makes current CTR undefined. Paused/missing dates are sparkline gaps. Negative drops represent improvement. Undefined drops sort last. Duplicate creative/date rows are rejected. Displayed values round to two decimals; decisions use full precision. A tiny floating-point tolerance handles exact threshold boundaries. spend_inr is validated but does not affect fatigue.

## API

Deploy to Vercel to serve `api/analyze.ts` as an Edge Function alongside the Vite build. `npm run dev` serves the frontend only; it calculates locally with the same shared function.

POST /api/analyze with JSON containing exactly one of `csv_text` or `csv_url`, and optional numeric `drop_threshold` (fraction 0–1). API URL loading is deliberately limited to the official sample URL to avoid private-network fetching; other data can use csv_text. Download limit: 2 MB; timeout: 10 seconds; redirects rejected.

Response: current_window, drop_threshold, creatives, flagged_creatives. CTRs/drop are fractions or null. Every creative contains identity, format, delivery_days, baseline_ctr, current_ctr, current_impressions, drop, status, explanation and daily points. Errors return 400 with an error message; unsupported methods return 405.

## Remaining delivery steps

Deploy, publish a public repo and record a two-minute walkthrough. No application or challenge has been submitted.

## Verification in this environment

TypeScript checking and the production build passed. Nine direct calculation smoke assertions passed. The Vitest suite is present but could not run: Vite's Windows path helper hits a sandbox `spawn EPERM` error before tests execute. Run `npm test` in a normal local terminal to verify the complete suite. Dependencies were installed from a local offline cache; the CSV reader is a small state machine supporting quoted commas, embedded newlines and escaped quotes because the planned parser library was unavailable.
