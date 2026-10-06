import csv from '../public/sample-data.csv?raw';
import expectedText from './sample-expected.json?raw';
import { expect, it } from 'vitest';
import { parseCsv } from '../shared/csv';
import { analyze, hasCpcIncreaseAbove, meetsDeliveryFilters } from '../shared/fatigue';
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
  expect(result.creatives.filter(row => hasCpcIncreaseAbove(row)).map(row => row.ad_id).sort()).toEqual(['SAMPLE-01', 'SAMPLE-07']);
  expect(result.creatives.filter(row => hasCpcIncreaseAbove(row, 0.4)).map(row => row.ad_id).sort()).toEqual(['SAMPLE-01', 'SAMPLE-05', 'SAMPLE-07', 'SAMPLE-08']);
  expect(result.creatives.filter(row => hasCpcIncreaseAbove(row, 1))).toHaveLength(0);
  const creative = result.creatives.find(row => row.ad_id === 'SAMPLE-01')!;
  expect(creative.baseline_cpc).toBeCloseTo(7.7261, 4);
  expect(creative.current_cpc).toBeCloseTo(15.3776, 4);
  expect(creative.cpc_drop).toBeCloseTo(-0.9903, 4);
});

it('combines delivery and recent impression filters with the CPC filter', () => {
  const result = analyze(parseCsv(csv));
  const deliveryFiltered = result.creatives.filter(row => meetsDeliveryFilters(row, 14, 5000));
  expect(deliveryFiltered).toHaveLength(8);
  expect(deliveryFiltered.map(row => row.ad_id)).not.toContain('SAMPLE-07');
  expect(deliveryFiltered.map(row => row.ad_id)).not.toContain('SAMPLE-10');
  expect(deliveryFiltered.filter(row => hasCpcIncreaseAbove(row)).map(row => row.ad_id)).toEqual(['SAMPLE-01']);
  expect(result.creatives.filter(row => meetsDeliveryFilters(row, 0, 0))).toHaveLength(10);
});
