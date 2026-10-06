import { useState } from 'react';
import { buildFlagRecords } from '../shared/flag-records';
import type { Analysis, AnalysisOptions } from '../shared/fatigue';
import { supabase, type ClientDatabaseState } from './lib/supabase';

export default function SaveFlags({ analysis, filters, database }: { analysis: Analysis; filters: AnalysisOptions; database: ClientDatabaseState }) {
  const [selection, setSelection] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [saved, setSaved] = useState<{ analysis: Analysis; identity: string; count: number } | null>(null);
  if (!supabase || !database.session || !database.client) return <p className="source"><a href="#database">Sign in on the Client database page</a> to save flagged ads.</p>;
  const clientId = database.client.client_id;
  const userId = Number(selection.split(':')[1]);
  const validSelection = selection.startsWith(`${clientId}:`) && database.users.some(user => user.user_id === userId);
  const records = validSelection ? buildFlagRecords(analysis, clientId, userId, filters) : [];
  const alreadySaved = saved?.analysis === analysis && saved.identity === selection;
  async function save() {
    if (!supabase || !validSelection || !records.length || busy || alreadySaved) return;
    setBusy(true); setError('');
    try {
      const { error } = await supabase.from('creative_flags').insert(records);
      if (error) throw error;
      setSaved({ analysis, identity: selection, count: records.length });
      database.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : String((error as { message?: string }).message ?? 'Could not save flags.')); }
    finally { setBusy(false); }
  }
  return <section className="save-flags controls" aria-label="Save flagged ads">
    <h2>Save flagged ads</h2><p>Choose the assigned user who owns these ads. This saves visible CTR flags and matches for the enabled CPC filter.</p>
    <div className="inline bottom"><label>Assigned user<select value={validSelection ? selection : ''} disabled={busy} onChange={event => { setSelection(event.target.value); setError(''); }}><option value="">Choose a user</option>{database.users.map(user => <option key={user.user_id} value={`${clientId}:${user.user_id}`}>{user.display_name} (ID {user.user_id})</option>)}</select></label><button disabled={busy || !records.length || alreadySaved} onClick={save}>{busy ? 'Saving…' : alreadySaved ? 'Saved' : 'Save flagged ads'}</button><small>{validSelection ? `${records.length} flag records · Client ${clientId}` : 'Select an assigned user to save.'}</small></div>
    {alreadySaved && <p role="status">Saved {saved.count} flag records. <a href="#database">View history</a></p>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
