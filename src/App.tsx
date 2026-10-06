import { useState } from 'react';
import { analyze, hasCpcDropOver40Percent, type Analysis } from '../shared/fatigue';
import { parseCsv } from '../shared/csv';
const SAMPLE = 'https://api.monastic.media/functions/v1/careers-mcp/challenge/sample-data.csv';
const fmt = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(2)}%`;
const fmtCpc = (value: number | null) => value === null ? '—' : `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const [result, setResult] = useState<Analysis | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [source, setSource] = useState('');
  const [cpcDropOnly, setCpcDropOnly] = useState(false);
  const visibleCreatives = result ? (cpcDropOnly ? result.creatives.filter(hasCpcDropOver40Percent) : result.creatives) : [];
  function calculate(text: string, label: string) {
    if (!threshold.trim()) throw new Error('Enter a drop threshold.');
    const next = analyze(parseCsv(text), Number(threshold) / 100);
    setCsv(text); setResult(next); setSource(label); setError('');
  }
  async function loadUrl(target = url) {
    setBusy(true); setError(''); setResult(null);
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
        setError(''); setResult(null);
        try { if (file.size > 2 * 1024 * 1024) throw new Error('CSV exceeds 2 MB.'); calculate(await file.text(), file.name); }
        catch (e) { setError(e instanceof Error ? e.message : 'Invalid CSV.'); }
      }} /></label><label>Flag at decline (%)<input className="threshold" type="number" min="0" max="100" step="1" value={threshold} onChange={e => { setThreshold(e.target.value); setResult(null); }} /></label><button className="secondary" disabled={!csv || busy} onClick={() => { try { calculate(csv, source); } catch (e) { setError((e as Error).message); } }}>Recalculate</button></div>
      <small>Minimum 14 delivery days · Minimum 5,000 recent impressions · 2 MB CSV limit</small>
    </section>
    {error && <p className="error" role="alert">{error}</p>}
    {result ? <><section className="summary"><div><strong>{result.creatives.length}</strong><span>creatives analyzed</span></div><div><strong>{result.flagged_creatives.length}</strong><span>need attention</span></div><div><strong>{result.current_window.start} → {result.current_window.end}</strong><span>current seven-day window</span></div></section><p className="source">Source: {source}</p>
      <section className="results-filters" aria-label="Filter results">
        <label className="checkbox-label"><input type="checkbox" checked={cpcDropOnly} onChange={e => setCpcDropOnly(e.target.checked)} />CPC dropped more than 40%</label>
        <small>Compare CPC in the current seven-day window with the first seven delivery days. Windows with no clicks have no CPC.</small>
        <p role="status">Showing {visibleCreatives.length} of {result.creatives.length} creatives</p>
      </section>
      <div className="table-wrap"><table><thead><tr><th>Creative</th><th>Baseline CTR</th><th>Current CTR</th><th>Relative CTR drop</th><th>Baseline CPC</th><th>Current CPC</th><th>Relative CPC drop</th><th>Recent impressions</th><th>Daily CTR</th><th>Status</th></tr></thead><tbody>{visibleCreatives.map(row => <tr key={row.ad_id}><td><b>{row.creative_name}</b><small>{row.ad_id} · {row.format}</small><p>{row.explanation}</p></td><td>{fmt(row.baseline_ctr)}</td><td>{fmt(row.current_ctr)}</td><td>{fmt(row.drop)}</td><td>{fmtCpc(row.baseline_cpc)}</td><td>{fmtCpc(row.current_cpc)}</td><td>{fmt(row.cpc_drop)}</td><td>{row.current_impressions.toLocaleString('en-IN')}</td><td><Sparkline points={row.daily} /></td><td><span className={`badge ${row.status.replaceAll(' ', '-')}`}>{row.status}</span></td></tr>)}{visibleCreatives.length === 0 && <tr><td colSpan={10} className="no-results">No creatives have a CPC drop greater than 40%. Clear the filter to see all creatives.</td></tr>}</tbody></table></div></> : <section className="empty"><h2>Start with your creative data</h2><p>Load the official sample or upload your CSV. Results appear here, sorted by relative CTR decline.</p><code>date, ad_id, creative_name, format, impressions, clicks, spend_inr</code></section>}
    <footer>CTR uses total clicks ÷ total impressions. CPC uses total spend ÷ total clicks. Paused days are excluded from baseline and delivery age.</footer>
  </main>;
}
