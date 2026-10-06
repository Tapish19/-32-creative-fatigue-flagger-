import { useMemo, useState } from 'react';
import { analyze, type Analysis } from '../shared/fatigue';
import { parseCsv } from '../shared/csv';
const SAMPLE = 'https://api.monastic.media/functions/v1/careers-mcp/challenge/sample-data.csv';
const fmt = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(2)}%`;
const fmtCpc = (value: number | null) => value === null ? '—' : `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCpcChange = (drop: number | null) => drop === null ? '—' : `${drop < 0 ? '+' : ''}${fmt(drop === 0 ? 0 : -drop)}`;
const wholeNumber = (value: string) => value.trim() && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : NaN;
function MinimumFilterInput({ label, value, onChange, errorId }: { label: string; value: string; onChange: (value: string) => void; errorId: string }) {
  const valid = Number.isFinite(wholeNumber(value));
  return <label>{label}<input className="threshold" type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" value={value} onChange={e => onChange(e.target.value)} aria-invalid={!valid} aria-describedby={!valid ? errorId : undefined} />{!valid && <small id={errorId} role="alert">Enter a whole number of 0 or greater.</small>}</label>;
}
function Sparkline({ points }: { points: Analysis['creatives'][number]['daily'] }) {
  const max = Math.max(...points.map(point => point.ctr ?? 0), 0.001);
  let path = '', pen = false;
  points.forEach((point, index) => {
    if (point.ctr === null) { pen = false; return; }
    const x = 4 + index / Math.max(points.length - 1, 1) * 132, y = 36 - point.ctr / max * 30;
    path += `${pen ? 'L' : 'M'}${x},${y} `; pen = true;
  });
  return <svg viewBox="0 0 140 42" width="140" height="42" role="img" aria-label="Daily CTR trend; gaps indicate missing or paused delivery"><path d={path} fill="none" stroke="currentColor" strokeWidth="2" /><title>{points.map(p => `${p.date}: ${fmt(p.ctr)}`).join('\n')}</title></svg>;
}
export default function App() {
  const [csv, setCsv] = useState(''), [url, setUrl] = useState(SAMPLE), [threshold, setThreshold] = useState('30');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [source, setSource] = useState('');
  const [recalculation, setRecalculation] = useState(0);
  const [cpcIncreaseOnly, setCpcIncreaseOnly] = useState(false);
  const [cpcThreshold, setCpcThreshold] = useState('80');
  const [minimumDays, setMinimumDays] = useState('14'), [minimumImpressions, setMinimumImpressions] = useState('5000');
  const [daysOnly, setDaysOnly] = useState(false), [impressionsOnly, setImpressionsOnly] = useState(false);
  const minimumDaysValue = wholeNumber(minimumDays), minimumImpressionsValue = wholeNumber(minimumImpressions);
  const cpcThresholdValue = cpcThreshold.trim() ? Number(cpcThreshold) / 100 : NaN;
  const cpcThresholdValid = Number.isFinite(cpcThresholdValue) && cpcThresholdValue >= 0;
  const calculation = useMemo(() => {
    if (!csv) return { result: null, error: '' };
    try {
      if (!threshold.trim()) throw new Error('Enter a drop threshold.');
      if (!cpcThresholdValid) throw new Error('Enter a valid CPC increase threshold.');
      const result = analyze(parseCsv(csv), Number(threshold) / 100, {
        minimum_delivery_days: minimumDaysValue,
        minimum_current_impressions: minimumImpressionsValue,
        cpc_increase_threshold: cpcIncreaseOnly ? cpcThresholdValue : undefined,
        filter_delivery_days: daysOnly,
        filter_current_impressions: impressionsOnly,
      });
      return { result, error: '' };
    } catch (error) { return { result: null, error: error instanceof Error ? error.message : 'Invalid analysis settings.' }; }
  }, [csv, threshold, cpcThresholdValue, cpcThresholdValid, minimumDaysValue, minimumImpressionsValue, cpcIncreaseOnly, daysOnly, impressionsOnly, recalculation]);
  const result = calculation.result;
  const visibleCreatives = result?.filtered_creatives ?? [];
  const visibleFlaggedCount = visibleCreatives.filter(row => row.status === 'flagged').length;
  function calculate(text: string, label: string) {
    parseCsv(text);
    setCsv(text); setSource(label); setError(''); setRecalculation(value => value + 1);
  }
  async function loadUrl(target = url) {
    setBusy(true); setError(''); setCsv('');
    try {
      const parsed = new URL(target, window.location.href); if (parsed.protocol !== 'https:' && parsed.origin !== window.location.origin) throw new Error('Use an HTTPS URL.');
      const response = await fetch(parsed.href, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      const text = await response.text();
      if (new Blob([text]).size > 2 * 1024 * 1024) throw new Error('CSV exceeds 2 MB.');
      calculate(text, target === '/sample-data.csv' ? 'Official Monastic Media sample (bundled CSV)' : target);
    } catch (e) { setError(`${e instanceof Error ? e.message : 'Download failed.'} If the server blocks browser downloads, download the CSV and upload it below.`); }
    finally { setBusy(false); }
  }
  return <main>
    <header><span className="eyebrow">CREATIVE PERFORMANCE</span><h1>Catch fatigue.<br /><span>Keep your ads fresh.</span></h1><p>Compare each creative with its own first seven delivery days.</p></header>
    <section className="controls" aria-label="Load and analyze CSV">
      <label>CSV URL<div className="inline"><input type="url" value={url} onChange={e => setUrl(e.target.value)} /><button onClick={() => loadUrl()} disabled={busy}>{busy ? 'Loading…' : 'Load CSV'}</button></div></label>
      <button className="secondary" style={{ marginTop: 16 }} onClick={() => loadUrl('/sample-data.csv')} disabled={busy}>Load official sample</button>
      <div className="inline bottom"><label className="upload">Or upload a CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        setError(''); setCsv('');
        try { if (file.size > 2 * 1024 * 1024) throw new Error('CSV exceeds 2 MB.'); calculate(await file.text(), file.name); }
        catch (e) { setError(e instanceof Error ? e.message : 'Invalid CSV.'); }
      }} /></label><label>Flag at decline (%)<input className="threshold" type="number" min="0" max="100" step="1" value={threshold} onChange={e => setThreshold(e.target.value)} /></label><label>Filter at CPC increase (%)<input className="threshold" type="number" min="0" step="1" value={cpcThreshold} aria-invalid={!cpcThresholdValid} aria-describedby={!cpcThresholdValid ? "cpc-threshold-error" : undefined} onChange={e => setCpcThreshold(e.target.value)} />{!cpcThresholdValid && <small id="cpc-threshold-error" role="alert">Enter a CPC increase percentage of 0 or greater.</small>}</label><MinimumFilterInput label="Minimum delivery days" value={minimumDays} onChange={setMinimumDays} errorId="minimum-days-error" /><MinimumFilterInput label="Min. impressions (last 7 days)" value={minimumImpressions} onChange={setMinimumImpressions} errorId="minimum-impressions-error" /><button className="secondary" disabled={!csv || busy} onClick={() => { setError(''); setRecalculation(value => value + 1); }}>Recalculate</button></div>
      <small>Minimum 14 delivery days · Minimum 5,000 recent impressions · 2 MB CSV limit</small>
    </section>
    {(error || calculation.error) && <p className="error" role="alert">{error || calculation.error}</p>}
    {result ? <><section className="summary"><div><strong>{result.creatives.length}</strong><span>creatives analyzed</span></div><div><strong>{visibleFlaggedCount}</strong><span>visible creatives need attention</span></div><div><strong>{result.current_window.start} → {result.current_window.end}</strong><span>current seven-day window</span></div></section><p className="source">Source: {source}</p>
      <section className="results-filters" aria-label="Filter results">
        <label className="checkbox-label"><input type="checkbox" checked={cpcIncreaseOnly} onChange={e => setCpcIncreaseOnly(e.target.checked)} />{cpcThresholdValid ? `CPC increased more than ${Number(cpcThreshold)}%` : 'Filter by CPC increase'}</label>
        <label className="checkbox-label"><input type="checkbox" checked={daysOnly} onChange={e => setDaysOnly(e.target.checked)} />{Number.isFinite(minimumDaysValue) ? `At least ${minimumDaysValue} delivery days` : 'Filter by delivery days'}</label>
        <label className="checkbox-label"><input type="checkbox" checked={impressionsOnly} onChange={e => setImpressionsOnly(e.target.checked)} />{Number.isFinite(minimumImpressionsValue) ? `At least ${minimumImpressionsValue.toLocaleString('en-IN')} impressions (last 7 days)` : 'Filter by impressions (last 7 days)'}</label>
        <small>Every filter change recalculates all metrics and statuses from the loaded CSV. All enabled filters apply together. Delivery days exclude pauses. Impressions use the current seven-day window shown above. CPC compares this window with the first seven delivery days; positive changes mean higher costs. Windows with no clicks have no CPC.</small>
        {(cpcIncreaseOnly || daysOnly || impressionsOnly) && <button className="secondary" onClick={() => { setCpcIncreaseOnly(false); setDaysOnly(false); setImpressionsOnly(false); }}>Clear filters</button>}
        <p role="status">Showing {visibleCreatives.length} of {result.creatives.length} creatives</p>
      </section>
      <div className="table-wrap"><table><thead><tr><th>Creative</th><th>Delivery days</th><th>Baseline CTR</th><th>Current CTR</th><th>Relative CTR drop</th><th>Baseline CPC</th><th>Current CPC</th><th>CPC change</th><th>Impressions (last 7 days)</th><th>Daily CTR</th><th>Status</th></tr></thead><tbody>{visibleCreatives.map(row => <tr key={row.ad_id}><td><b>{row.creative_name}</b><small>{row.ad_id} · {row.format}</small><p>{row.explanation}</p></td><td>{row.delivery_days}</td><td>{fmt(row.baseline_ctr)}</td><td>{fmt(row.current_ctr)}</td><td>{fmt(row.drop)}</td><td>{fmtCpc(row.baseline_cpc)}</td><td>{fmtCpc(row.current_cpc)}</td><td>{fmtCpcChange(row.cpc_drop)}</td><td>{row.current_impressions.toLocaleString('en-IN')}</td><td><Sparkline points={row.daily} /></td><td><span className={`badge ${row.status.replaceAll(' ', '-')}`}>{row.status}</span></td></tr>)}{visibleCreatives.length === 0 && <tr><td colSpan={11} className="no-results">No creatives match the selected filters. Adjust the minimums or clear filters to see all creatives.</td></tr>}</tbody></table></div></> : <section className="empty"><h2>Start with your creative data</h2><p>Load the official sample or upload your CSV. Results appear here, sorted by relative CTR decline.</p><code>date, ad_id, creative_name, format, impressions, clicks, spend_inr</code></section>}
    <footer>CTR uses total clicks ÷ total impressions. CPC uses total spend ÷ total clicks. Paused days are excluded from baseline and delivery age.</footer>
  </main>;
}
