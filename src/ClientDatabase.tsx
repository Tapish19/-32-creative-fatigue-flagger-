import { useState, type FormEvent } from 'react';
import { supabase, type ClientDatabaseState } from './lib/supabase';

export default function ClientDatabase({ database }: { database: ClientDatabaseState }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function signIn(event: FormEvent) {
    event.preventDefault(); if (!supabase) return;
    setBusy(true); setError('');
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }
  async function signOut() {
    if (!supabase) return;
    setBusy(true); setError('');
    try { const { error } = await supabase.auth.signOut(); if (error) throw error; }
    catch (error) { setError(error instanceof Error ? error.message : 'Sign-out failed.'); }
    finally { setBusy(false); }
  }
  return <main className="database-page">
    <header><span className="eyebrow">CLIENT DATABASE</span><h1>Your users.<br /><span>Your creative history.</span></h1><p>Sign in to see the users and flagged ads assigned to your client.</p></header>
    {!supabase ? <section className="controls"><h2>Database connection pending</h2><p>The Supabase connection has not been configured for this site yet.</p></section>
      : database.authLoading ? <p role="status">Checking your session…</p>
      : !database.session ? <form className="controls login-form" onSubmit={signIn}>
        <h2>Client sign-in</h2><label>Email<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <button disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form> : <>
        <section className="database-toolbar"><p>{database.session.user.email}{database.client && ` · ${database.client.client_name} (ID ${database.client.client_id})`}</p><button className="secondary" disabled={busy || database.loading} onClick={database.refresh}>Refresh tables</button><button className="secondary" disabled={busy} onClick={signOut}>Sign out</button></section>
        {database.loading && <p role="status">Loading your client data…</p>}
        {database.client && <>
          <section className="summary"><div><strong>{database.users.length}</strong><span>assigned users</span></div><div><strong>{database.flags.length}</strong><span>latest saved flags</span></div></section>
          <h2>Assigned users</h2><div className="table-wrap"><table><thead><tr><th>Client ID</th><th>User ID</th><th>User</th></tr></thead><tbody>{database.users.map(user => <tr key={user.user_id}><td>{database.client!.client_id}</td><td>{user.user_id}</td><td>{user.display_name}</td></tr>)}{database.users.length === 0 && <tr><td colSpan={3}>No users have been assigned to this client.</td></tr>}</tbody></table></div>
          <h2>Flagged ad history</h2><p>Latest 100 records. Observation date comes from the analysis window; recorded time shows when the flag was saved.</p>
          <div className="table-wrap"><table><thead><tr><th>Client ID</th><th>User ID</th><th>Creative / ad</th><th>Metric</th><th>Drop (%)</th><th>Observed on</th><th>Recorded at</th><th>Creative filter</th></tr></thead><tbody>{database.flags.map(flag => <tr key={flag.flag_id}><td>{flag.client_id}</td><td>{flag.user_id}</td><td><b>{flag.creative_name}</b><small>{flag.ad_id}</small></td><td>{flag.metric.toUpperCase()}</td><td>{Number(flag.drop_percent).toFixed(2)}%</td><td>{flag.dropped_on}</td><td>{new Date(flag.flagged_at).toLocaleString()}</td><td><details><summary>View filters</summary><pre>{JSON.stringify(flag.creative_filter, null, 2)}</pre></details></td></tr>)}{database.flags.length === 0 && <tr><td colSpan={8} className="no-results">No flags saved yet. Analyze your CSV, then save flagged ads for an assigned user.</td></tr>}</tbody></table></div>
          <small className="database-note">A negative CPC drop means increased cost: -99% is a 99% CPC increase.</small>
        </>}
      </>}
    {(error || database.error) && <p className="error" role="alert">{error || database.error}</p>}
  </main>;
}
