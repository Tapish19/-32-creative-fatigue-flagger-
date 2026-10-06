export interface Row {
  date: string; ad_id: string; creative_name: string; format: string;
  impressions: number; clicks: number; spend_inr: number;
}
export type Status = 'flagged' | 'ok' | 'too new' | 'not enough volume';
const DAY = 86_400_000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const sum = (rows: Row[], key: 'clicks' | 'impressions' | 'spend_inr') => rows.reduce((n, row) => n + row[key], 0);
const ctr = (rows: Row[]) => sum(rows, 'impressions') ? sum(rows, 'clicks') / sum(rows, 'impressions') : null;
const cpc = (rows: Row[]) => sum(rows, 'clicks') ? sum(rows, 'spend_inr') / sum(rows, 'clicks') : null;
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

export function hasCpcIncreaseAbove(creative: { cpc_drop: number | null }, threshold = 0.8) {
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('CPC increase threshold must be a finite, non-negative number.');
  // Exclude the exact boundary despite floating-point rounding.
  return creative.cpc_drop !== null && -creative.cpc_drop - threshold > Number.EPSILON * Math.max(1, threshold);
}

export function analyze(rows: Row[], threshold = 0.3) {
  if (!rows.length) throw new Error('CSV contains no data rows.');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Threshold must be between 0 and 1.');
  const dates = rows.map(row => row.date).sort();
  const end = dates[dates.length - 1];
  const start = iso(Date.parse(end) - 6 * DAY);
  const first = Date.parse(dates[0]);
  const groups = new Map<string, Row[]>();
  for (const row of rows) groups.set(row.ad_id, [...(groups.get(row.ad_id) ?? []), row]);
  const creatives = [...groups.entries()].map(([ad_id, unsorted]) => {
    const sorted = [...unsorted].sort((a, b) => a.date.localeCompare(b.date));
    const active = sorted.filter(row => row.impressions > 0);
    const current = sorted.filter(row => row.date >= start && row.date <= end);
    const baseline = active.slice(0, 7);
    const baseline_ctr = ctr(baseline);
    const current_ctr = ctr(current);
    const drop = baseline_ctr !== null && baseline_ctr > 0 && current_ctr !== null ? 1 - current_ctr / baseline_ctr : null;
    const baseline_cpc = cpc(baseline);
    const current_cpc = cpc(current);
    const cpc_drop = baseline_cpc !== null && baseline_cpc > 0 && current_cpc !== null ? 1 - current_cpc / baseline_cpc : null;
    const current_impressions = sum(current, 'impressions');
    let status: Status = 'ok';
    let explanation = 'Current CTR is within the selected threshold.';
    if (active.length < 14) { status = 'too new'; explanation = `Only ${active.length} delivery days; at least 14 are required.`; }
    else if (current_impressions < 5000) { status = 'not enough volume'; explanation = `Only ${current_impressions.toLocaleString('en-IN')} impressions in the last seven days; at least 5,000 are required.`; }
    else if (drop === null) explanation = 'No positive baseline CTR; relative decline cannot be calculated.';
    // Tiny tolerance prevents an exact boundary being missed by floating-point arithmetic.
    else if (drop + Number.EPSILON >= threshold) {
      status = 'flagged';
      explanation = `CTR fell ${percent(drop)}, from ${percent(baseline_ctr!)} to ${percent(current_ctr!)}, with ${current_impressions.toLocaleString('en-IN')} impressions in the last seven days.`;
    }
    const byDate = new Map(sorted.map(row => [row.date, row]));
    const daily = [];
    for (let time = first; time <= Date.parse(end); time += DAY) {
      const date = iso(time), row = byDate.get(date);
      daily.push({ date, ctr: row && row.impressions > 0 ? row.clicks / row.impressions : null });
    }
    const latest = sorted[sorted.length - 1];
    return { ad_id, creative_name: latest.creative_name, format: latest.format, delivery_days: active.length, baseline_ctr, current_ctr, drop, baseline_cpc, current_cpc, cpc_drop, current_impressions, status, explanation, daily };
  }).sort((a, b) => (b.drop ?? -Infinity) - (a.drop ?? -Infinity) || a.ad_id.localeCompare(b.ad_id));
  return { current_window: { start, end }, drop_threshold: threshold, creatives, flagged_creatives: creatives.filter(row => row.status === 'flagged') };
}
export type Analysis = ReturnType<typeof analyze>;
