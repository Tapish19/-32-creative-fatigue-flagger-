import { afterEach, expect, it, vi } from 'vitest';
import handler from '../api/analyze';
const csv = 'date,ad_id,creative_name,format,impressions,clicks,spend_inr\n2026-09-01,a,Ad,video,1000,20,10';
const request = (body: unknown) => new Request('https://example.test/api/analyze', { method: 'POST', body: JSON.stringify(body) });
const sampleUrl = 'https://api.monastic.media/functions/v1/careers-mcp/challenge/sample-data.csv';
afterEach(() => vi.unstubAllGlobals());
it('loads the sample with an Edge-compatible redirect mode', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(csv));
  vi.stubGlobal('fetch', fetchMock);
  const response = await handler(request({ csv_url: sampleUrl }));
  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledWith(sampleUrl, expect.objectContaining({ redirect: 'manual' }));
  expect((await response.json()).creatives[0].ad_id).toBe('a');
});
it('rejects redirects without fetching their destination', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } }));
  vi.stubGlobal('fetch', fetchMock);
  const response = await handler(request({ csv_url: sampleUrl }));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toBe('CSV download redirects are not allowed.');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('analyzes uploaded CSV with CPC metrics', async () => {
  const response = await handler(request({ csv_text: csv }));
  expect(response.status).toBe(200);
  expect((await response.json()).creatives[0]).toMatchObject({ status: 'too new', baseline_cpc: 0.5, current_cpc: 0.5, cpc_drop: 0 });
});
it('rejects invalid input and non-allowlisted URLs', async () => {
  for (const body of [{}, { csv_text: csv, csv_url: 'https://example.com' }, { csv_url: 'https://127.0.0.1' }, { csv_text: csv, drop_threshold: '30' }]) expect((await handler(request(body))).status).toBe(400);
});
it('rejects other HTTP methods', async () => expect((await handler(new Request('https://example.test'))).status).toBe(405));

it('recalculates uploaded CSV with configurable eligibility and filters', async () => {
  const response = await handler(request({ csv_text: csv, drop_threshold: 0, minimum_delivery_days: 1, minimum_current_impressions: 1000, filter_delivery_days: true, filter_current_impressions: true }));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.creatives[0].status).toBe('flagged');
  expect(result.flagged_creatives).toHaveLength(1);
  expect(result.filtered_creatives).toHaveLength(1);
  const filtered = await handler(request({ csv_text: csv, cpc_increase_threshold: 0.8 }));
  expect((await filtered.json()).filtered_creatives).toHaveLength(0);
});

it('rejects invalid recalculation settings', async () => {
  for (const settings of [{ minimum_delivery_days: -1 }, { minimum_current_impressions: 0.5 }, { minimum_delivery_days: '14' }, { minimum_current_impressions: null }, { cpc_increase_threshold: -0.1 }, { filter_delivery_days: 'true' }]) {
    expect((await handler(request({ csv_text: csv, ...settings }))).status).toBe(400);
  }
});
