import csv from '../public/sample-data.csv?raw';
import expectedText from './sample-expected.json?raw';
import { expect, it } from 'vitest';
import { parseCsv } from '../shared/csv';
import { analyze, hasCpcIncreaseOver80Percent } from '../shared/fatigue';
it('matches independently calculated official sample metrics', () => {
  const rows = parseCsv(csv);
  const expected = JSON.parse(expectedText);
  const result = analyze(rows);
  expect(rows).toHaveLength(243);
  expect(result.current_window).toEqual({ start: '2026-09-22', end: '2026-09-28' });
  expect(result.flagged_creatives.map(row => row.ad_id)).toEqual(['SAMPLE-01', 'SAMPLE-08', 'SAMPLE-05', 'SAMPLE-04']);
  for (const reference of expected) {
    const actual = result.creatives.find(row => row.ad_id === reference.ad_id)!;
    expect(actual.status).toBe(reference.status);
    expect(actual.delivery_days).toBe(reference.delivery_days);
    expect(actual.current_impressions).toBe(reference.current_impressions);
    for (const key of ['baseline_ctr', 'current_ctr', 'drop'] as const) expect(actual[key]).toBeCloseTo(reference[key], 12);
  }
});

it('includes the sample creative with a 99% CPC increase in the cost filter', () => {
  const result = analyze(parseCsv(csv));
  expect(result.creatives.filter(hasCpcIncreaseOver80Percent).map(row => row.ad_id).sort()).toEqual(['SAMPLE-01', 'SAMPLE-07']);
  const creative = result.creatives.find(row => row.ad_id === 'SAMPLE-01')!;
  expect(creative.baseline_cpc).toBeCloseTo(7.7261, 4);
  expect(creative.current_cpc).toBeCloseTo(15.3776, 4);
  expect(creative.cpc_drop).toBeCloseTo(-0.9903, 4);
});
