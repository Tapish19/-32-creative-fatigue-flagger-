import csv from '../public/sample-data.csv?raw';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../shared/csv';
import { analyze } from '../shared/fatigue';
import { buildFlagRecords } from '../shared/flag-records';

describe('saved flag history', () => {
  it('stores flagged ads, percent units, observed dates and client/user identity', () => {
    const result = analyze(parseCsv(csv));
    const records = buildFlagRecords(result, 1, 4, {});
    expect(records).toHaveLength(4);
    expect(records.map(row => row.ad_id)).toEqual(result.flagged_creatives.map(row => row.ad_id));
    expect(records[0]).toMatchObject({ client_id: 1, user_id: 4, metric: 'ctr', dropped_on: '2026-09-28', current_window_start: '2026-09-22', current_window_end: '2026-09-28' });
    expect(records[0].drop_percent).toBeCloseTo(50.70604212717797);
    expect(records[0].creative_filter).toMatchObject({ drop_threshold: 0.3, minimum_delivery_days: 14, minimum_current_impressions: 5000, cpc_increase_threshold: null });
  });

  it('saves both metric flags with negative CPC drops, only for visible creatives', () => {
    const filters = { cpc_increase_threshold: 0.8, filter_delivery_days: true, filter_current_impressions: true };
    const result = analyze(parseCsv(csv), 0.3, filters);
    const records = buildFlagRecords(result, 2, 7, filters);
    expect(records).toHaveLength(2);
    expect(records.map(row => row.metric)).toEqual(['ctr', 'cpc']);
    expect(records.every(row => row.ad_id === 'SAMPLE-01' && row.client_id === 2 && row.user_id === 7)).toBe(true);
    expect(records[1].drop_percent).toBeCloseTo(-99.03, 2);
    expect(records[1].creative_filter).toMatchObject({ cpc_increase_threshold: 0.8, filter_delivery_days: true, filter_current_impressions: true, selected_ad_ids: ['SAMPLE-01'] });
  });

  it('does not create records for an empty result or invalid identities', () => {
    const result = analyze(parseCsv(csv), 1, { cpc_increase_threshold: 1 });
    expect(buildFlagRecords(result, 1, 1, { cpc_increase_threshold: 1 })).toEqual([]);
    expect(() => buildFlagRecords(result, 0, 1, {})).toThrow('assigned user');
    expect(() => buildFlagRecords(result, 1, NaN, {})).toThrow('assigned user');
  });
});
