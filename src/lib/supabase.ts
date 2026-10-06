import { createClient, type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;

export interface ClientRecord { client_id: number; client_name: string }
export interface UserRecord { user_id: number; display_name: string }
export interface FlagRecord {
  flag_id: string; client_id: number; user_id: number; ad_id: string;
  creative_name: string; creative_filter: Record<string, unknown>; metric: 'ctr' | 'cpc';
  drop_percent: number; dropped_on: string; flagged_at: string;
  current_window_start: string; current_window_end: string;
}

export function useClientDatabase() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ identity: string | null; loading: boolean; error: string; client: ClientRecord | null; users: UserRecord[]; flags: FlagRecord[] }>({ identity: null, loading: false, error: '', client: null, users: [], flags: [] });
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) { setSession(next); setAuthLoading(false); }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(data.session); setAuthLoading(false);
      if (error) setState(previous => ({ ...previous, error: error.message }));
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const identity = session?.user.id ?? null;
  useEffect(() => {
    if (!supabase || !identity) return;
    const database = supabase;
    let active = true;
    setState({ identity, loading: true, error: '', client: null, users: [], flags: [] });
    async function load() {
      try {
        const clientResult = await database.from('clients').select('client_id,client_name').maybeSingle();
        if (clientResult.error) throw clientResult.error;
        if (!clientResult.data) throw new Error('This login has not been assigned to a client.');
        const client = clientResult.data as ClientRecord;
        const [usersResult, flagsResult] = await Promise.all([
          database.from('app_users').select('user_id,display_name').order('user_id'),
          database.from('creative_flags').select('*').eq('client_id', client.client_id).order('flagged_at', { ascending: false }).limit(100),
        ]);
        if (usersResult.error) throw usersResult.error;
        if (flagsResult.error) throw flagsResult.error;
        if (active) setState({ identity, loading: false, error: '', client, users: usersResult.data as UserRecord[], flags: flagsResult.data as FlagRecord[] });
      } catch (error) {
        if (active) setState({ identity, loading: false, error: error instanceof Error ? error.message : String((error as { message?: string }).message ?? 'Could not load client data.'), client: null, users: [], flags: [] });
      }
    }
    void load();
    return () => { active = false; };
  }, [identity, revision]);

  const current = identity && state.identity === identity ? state : { client: null, users: [], flags: [], error: '', loading: Boolean(identity) };
  return { session, authLoading, ...current, refresh: () => setRevision(value => value + 1) };
}
export type ClientDatabaseState = ReturnType<typeof useClientDatabase>;
