import { describe, expect, it } from 'vitest';
import { analyze, hasCpcIncreaseAbove, meetsDeliveryFilters, type Row } from '../shared/fatigue';
const rows = (count = 28, id = 'a'): Row[] => Array.from({ length: count }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, ad_id: id, creative_name: id, format: 'video', impressions: 1000, clicks: i < 7 ? 20 : 14, spend_inr: 100 }));
describe('fatigue calculations', () => {
  it('flags exact 30% decline with weighted window CTR', () => {
    const result = analyze(rows()).creatives[0];
    expect(result.baseline_ctr).toBe(0.02); expect(result.current_ctr).toBe(0.014); expect(result.status).toBe('flagged');
  });
  it('uses ratio of totals rather than average daily rates', () => {
    const data = rows(); data[0].impressions = 100; data[0].clicks = 10;
    expect(analyze(data).creatives[0].baseline_ctr).toBeCloseTo(130 / 6100);
  });
  it('skips paused days in the baseline and delivery age', () => {
    const data = rows(); data[0].impressions = 0; data[0].clicks = 0;
    const result = analyze(data).creatives[0];
    expect(result.baseline_ctr).toBeCloseTo(134 / 7000); expect(result.delivery_days).toBe(27); expect(result.daily[0].ctr).toBeNull();
  });
  it('handles new creatives and the 14-day boundary', () => {
    expect(analyze(rows(13)).creatives[0].status).toBe('too new');
    expect(analyze(rows(14)).creatives[0].status).toBe('flagged');
  });
  it('does not flag a recovered creative', () => {
    const data = rows(); data.slice(21).forEach(row => row.clicks = 22);
    const result = analyze(data).creatives[0]; expect(result.status).toBe('ok'); expect(result.drop).toBeCloseTo(-0.1);
  });
  it('enforces volume and accepts exactly 5000 impressions', () => {
    const data = rows(); data.slice(21).forEach(row => { row.impressions = 0; row.clicks = 0; });
    data[27].impressions = 4999; data[27].clicks = 50;
    expect(analyze(data).creatives[0].status).toBe('not enough volume');
    data[27].impressions = 5000; expect(analyze(data).creatives[0].status).toBe('flagged');
  });
  it('uses the file-wide calendar window for late and stopped creatives', () => {
    const data = [...rows(14, 'stopped'), ...rows(28, 'active')];
    const stopped = analyze(data).creatives.find(row => row.ad_id === 'stopped')!;
    expect(stopped.current_impressions).toBe(0); expect(stopped.current_ctr).toBeNull(); expect(stopped.status).toBe('not enough volume');
  });
  it('handles zero baseline and zero current clicks', () => {
    const data = rows(); data.slice(0, 7).forEach(row => row.clicks = 0);
    expect(analyze(data).creatives[0].drop).toBeNull(); expect(analyze(data).flagged_creatives).toHaveLength(0);
    data.slice(0, 7).forEach(row => row.clicks = 20); data.slice(21).forEach(row => row.clicks = 0);
    expect(analyze(data).creatives[0].drop).toBe(1);
  });
  it('supports threshold changes, sorted input, and rejects invalid thresholds', () => {
    expect(analyze(rows(), 0.4).flagged_creatives).toHaveLength(0);
    expect(analyze(rows().reverse())).toEqual(analyze(rows()));
    expect(() => analyze(rows(), NaN)).toThrow(); expect(() => analyze([], 0.3)).toThrow();
  });
});

describe('delivery filters', () => {
  it('recalculates eligibility and explanations with selected minimums', () => {
    const data = rows(13);
    expect(analyze(data).creatives[0].status).toBe('too new');
    const lowered = analyze(data, 0.2, { minimum_delivery_days: 13, minimum_current_impressions: 7000 });
    expect(lowered.creatives[0].status).toBe('flagged');
    expect(lowered.flagged_creatives).toHaveLength(1);
    const raised = analyze(data, 0.2, { minimum_delivery_days: 13, minimum_current_impressions: 7001 });
    expect(raised.creatives[0].status).toBe('not enough volume');
    expect(raised.creatives[0].explanation).toContain('7,001 are required');
    expect(raised.flagged_creatives).toHaveLength(0);
    const tooNew = analyze(data, 0.2, { minimum_delivery_days: 15, minimum_current_impressions: 7001 });
    expect(tooNew.creatives[0].status).toBe('too new');
    expect(tooNew.creatives[0].explanation).toContain('15 are required');
  });

  it('recalculates and combines filters without shrinking the source windows', () => {
    const data = [...rows(14, 'stopped'), ...rows(28, 'active')];
    const original = analyze(data);
    const result = analyze(data, 0.3, { minimum_delivery_days: 14, minimum_current_impressions: 7000, filter_delivery_days: true, filter_current_impressions: true, cpc_increase_threshold: 0.4 });
    expect(result.filtered_creatives.map(row => row.ad_id)).toEqual(['active']);
    expect(result.current_window).toEqual(original.current_window);
    expect(result.creatives.find(row => row.ad_id === 'active')!.baseline_ctr).toBe(original.creatives.find(row => row.ad_id === 'active')!.baseline_ctr);
    expect(analyze(data, 0.3, { cpc_increase_threshold: 0.8 }).filtered_creatives).toHaveLength(0);
    expect(analyze(data).filtered_creatives).toHaveLength(2);
  });

  it('rejects invalid minimums and CPC thresholds during recalculation', () => {
    expect(() => analyze(rows(), 0.3, { minimum_delivery_days: -1 })).toThrow('whole numbers');
    expect(() => analyze(rows(), 0.3, { minimum_current_impressions: 0.5 })).toThrow('whole numbers');
    expect(() => analyze(rows(), 0.3, { cpc_increase_threshold: NaN })).toThrow('CPC increase threshold');
  });

  it('includes exact minimums and requires both enabled criteria', () => {
    const creative = { delivery_days: 14, current_impressions: 5000 };
    expect(meetsDeliveryFilters(creative, 14, 5000)).toBe(true);
    expect(meetsDeliveryFilters(creative, 15, 5000)).toBe(false);
    expect(meetsDeliveryFilters(creative, 14, 5001)).toBe(false);
    expect(meetsDeliveryFilters(creative, 15, 0)).toBe(false);
    expect(meetsDeliveryFilters(creative, 0, 5001)).toBe(false);
    expect(meetsDeliveryFilters({ delivery_days: 0, current_impressions: 0 })).toBe(true);
  });

  it('uses delivery days excluding pauses and impressions from the global seven-day window', () => {
    const paused = rows(14, 'paused');
    paused[0].impressions = 0; paused[0].clicks = 0;
    const creative = analyze(paused).creatives[0];
    expect(creative.delivery_days).toBe(13);
    expect(meetsDeliveryFilters(creative, 14, 0)).toBe(false);
    expect(meetsDeliveryFilters(creative, 13, 7000)).toBe(true);
    expect(creative.status).toBe('too new');
    const stopped = analyze([...rows(14, 'stopped'), ...rows(28, 'active')]).creatives.find(row => row.ad_id === 'stopped')!;
    expect(meetsDeliveryFilters(stopped, 14, 1)).toBe(false);
    expect(meetsDeliveryFilters(stopped, 14, 0)).toBe(true);
  });

  it('rejects fractional, negative, non-finite and unsafe minimums', () => {
    const creative = { delivery_days: 14, current_impressions: 5000 };
    for (const minimum of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => meetsDeliveryFilters(creative, minimum, 0)).toThrow('whole numbers');
      expect(() => meetsDeliveryFilters(creative, 0, minimum)).toThrow('whole numbers');
    }
  });
});

describe('cost per click filter', () => {
  it('applies editable thresholds without changing calculated metrics', () => {
    const creative = { cpc_drop: -0.99 };
    expect(hasCpcIncreaseAbove(creative, 0.4)).toBe(true);
    expect(hasCpcIncreaseAbove(creative, 0.8)).toBe(true);
    expect(hasCpcIncreaseAbove(creative, 0.99)).toBe(false);
    expect(hasCpcIncreaseAbove(creative, 1)).toBe(false);
    expect(hasCpcIncreaseAbove({ cpc_drop: -1.5 }, 1.2)).toBe(true);
    expect(hasCpcIncreaseAbove({ cpc_drop: -1.2 }, 1.2)).toBe(false);
    expect(hasCpcIncreaseAbove({ cpc_drop: 0 }, 0)).toBe(false);
    expect(hasCpcIncreaseAbove({ cpc_drop: -0.01 }, 0)).toBe(true);
    expect(hasCpcIncreaseAbove({ cpc_drop: null }, 0.4)).toBe(false);
  });

  it('rejects invalid CPC thresholds', () => {
    for (const threshold of [-0.01, NaN, Infinity]) {
      expect(() => hasCpcIncreaseAbove({ cpc_drop: -0.99 }, threshold)).toThrow('CPC increase threshold');
    }
  });

  it('uses total spend divided by total clicks in the same baseline and current windows', () => {
    const data = rows();
    data[0].clicks = 10; data[0].spend_inr = 200;
    data[21].clicks = 7; data[21].spend_inr = 50;
    const result = analyze(data).creatives[0];
    expect(result.baseline_cpc).toBeCloseTo(800 / 130);
    expect(result.current_cpc).toBeCloseTo(650 / 91);
    expect(result.cpc_drop).toBeCloseTo(1 - (650 / 91) / (800 / 130));
  });

  it('shows only CPC increases strictly greater than 80%, including increases above 100%', () => {
    const data = [180, 180.001, 179.999, 140, 100, 60, 0, 199, 250].flatMap(spend => {
      const creativeRows = rows(28, `spend-${spend}`);
      creativeRows.forEach(row => row.clicks = 20);
      creativeRows.slice(21).forEach(row => row.spend_inr = spend);
      return creativeRows;
    });
    const result = analyze(data);
    expect(result.creatives.filter(row => hasCpcIncreaseAbove(row)).map(row => row.ad_id).sort()).toEqual(['spend-180.001', 'spend-199', 'spend-250']);
    expect(result.creatives.find(row => row.ad_id === 'spend-180')!.cpc_drop).toBeCloseTo(-0.8);
    expect(result.creatives.find(row => row.ad_id === 'spend-199')!.cpc_drop).toBeCloseTo(-0.99);
    expect(result.flagged_creatives).toHaveLength(0);
  });

  it('does not calculate a relative drop from zero baseline CPC or no clicks', () => {
    const data = rows();
    data.slice(0, 7).forEach(row => row.spend_inr = 0);
    let result = analyze(data).creatives[0];
    expect(result.baseline_cpc).toBe(0); expect(result.cpc_drop).toBeNull();
    expect(hasCpcIncreaseAbove(result)).toBe(false);
    data.slice(0, 7).forEach(row => { row.spend_inr = 100; row.clicks = 0; });
    result = analyze(data).creatives[0];
    expect(result.baseline_cpc).toBeNull(); expect(result.cpc_drop).toBeNull();
    expect(hasCpcIncreaseAbove(result)).toBe(false);
    data.slice(0, 7).forEach(row => row.clicks = 20);
    data.slice(21).forEach(row => row.clicks = 0);
    result = analyze(data).creatives[0];
    expect(result.current_cpc).toBeNull(); expect(result.cpc_drop).toBeNull();
    expect(hasCpcIncreaseAbove(result)).toBe(false);
  });

  it('preserves pauses and the file-wide current window for CPC', () => {
    const data = rows();
    data[0].impressions = 0; data[0].clicks = 0; data[0].spend_inr = 0;
    expect(analyze(data).creatives[0].baseline_cpc).toBeCloseTo(700 / 134);
    const stopped = analyze([...rows(14, 'stopped'), ...rows(28, 'active')]).creatives.find(row => row.ad_id === 'stopped')!;
    expect(stopped.current_cpc).toBeNull(); expect(stopped.cpc_drop).toBeNull();
    expect(hasCpcIncreaseAbove(stopped)).toBe(false);
  });
});
