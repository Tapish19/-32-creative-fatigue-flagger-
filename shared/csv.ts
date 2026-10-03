import type { Row } from './fatigue';
const columns = ['date', 'ad_id', 'creative_name', 'format', 'impressions', 'clicks', 'spend_inr'];
// CSV state machine: quoted commas/newlines and escaped quotes are supported.
function records(text: string): string[][] {
  const result: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false;
  const finishField = () => { row.push(field); field = ''; closed = false; };
  const finishRow = () => { finishField(); if (row.some(value => value.trim())) result.push(row); row = []; };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += char;
    } else if (char === ',') finishField();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; finishRow(); }
    else if (char === '"') { if (field || closed) throw new Error('Unexpected quote in CSV.'); quoted = true; }
    else { if (closed) throw new Error('Unexpected character after closing quote.'); field += char; }
  }
  if (quoted) throw new Error('Unclosed quote in CSV.');
  finishRow(); return result;
}
export function parseCsv(text: string): Row[] {
  const [header, ...data] = records(text);
  const fields = header?.map(value => value.trim()) ?? [];
  if (new Set(fields).size !== fields.length) throw new Error('Duplicate CSV columns.');
  for (const key of columns) if (!fields.includes(key)) throw new Error(`Missing column: ${key}`);
  const seen = new Set<string>();
  if (!data.length) throw new Error('CSV contains no data rows.');
  return data.map((values, index) => {
    if (values.length !== fields.length) throw new Error(`Row ${index + 2}: incorrect column count.`);
    const raw = Object.fromEntries(fields.map((key, i) => [key, values[i]]));
    const fail = (message: string): never => { throw new Error(`Row ${index + 2}: ${message}`); };
    for (const key of columns) if (!raw[key]?.trim()) fail(`Missing ${key}.`);
    const date = raw.date.trim();
    const time = Date.parse(date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) fail('Invalid date.');
    const numbers = Object.fromEntries(['impressions', 'clicks', 'spend_inr'].map(key => {
      const value = Number(raw[key]);
      if (!Number.isFinite(value) || value < 0 || (key !== 'spend_inr' && !Number.isSafeInteger(value))) fail(`Invalid ${key}.`);
      return [key, value];
    }));
    if (numbers.impressions === 0 && numbers.clicks > 0) fail('Clicks require impressions.');
    const ad_id = raw.ad_id.trim(), key = `${ad_id}:${date}`;
    if (seen.has(key)) fail('Duplicate creative/date.');
    seen.add(key);
    return { date, ad_id, creative_name: raw.creative_name.trim(), format: raw.format.trim(), impressions: numbers.impressions, clicks: numbers.clicks, spend_inr: numbers.spend_inr };
  });
}
