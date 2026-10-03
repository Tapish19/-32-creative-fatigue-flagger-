import { analyze } from '../shared/fatigue';
import { parseCsv } from '../shared/csv';
export const config = { runtime: 'edge' };
const SAMPLE = 'https://api.monastic.media/functions/v1/careers-mcp/challenge/sample-data.csv';
const MAX_BYTES = 2 * 1024 * 1024;
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405, headers: { Allow: 'POST' } });
  try {
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).length > MAX_BYTES) throw new Error('Request exceeds 2 MB.');
    const body = JSON.parse(bodyText);
    if (typeof body !== 'object' || body === null) throw new Error('Expected a JSON object.');
    if ((typeof body.csv_text === 'string') === (typeof body.csv_url === 'string')) throw new Error('Provide exactly one of csv_text or csv_url.');
    let text: string = body.csv_text;
    if (body.csv_url) {
      // Deliberate allowlist keeps this small endpoint safe from private-network requests.
      if (body.csv_url !== SAMPLE) throw new Error('URL loading supports the official sample only. Upload other CSV files using csv_text.');
      const response = await fetch(SAMPLE, { signal: AbortSignal.timeout(10_000), redirect: 'manual' });
      if (response.status >= 300 && response.status < 400) throw new Error('CSV download redirects are not allowed.');
      if (!response.ok) throw new Error(`CSV download failed (${response.status}).`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Empty download.');
      const decoder = new TextDecoder(); let bytes = 0; text = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('CSV exceeds 2 MB.'); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    }
    if (body.drop_threshold !== undefined && typeof body.drop_threshold !== 'number') throw new Error('drop_threshold must be numeric.');
    return Response.json(analyze(parseCsv(text), body.drop_threshold));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid request.' }, { status: 400 });
  }
}
