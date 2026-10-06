import { defineConfig, loadEnv } from 'vite';

// Map only browser-safe credentials; never expose the integration's private keys.
export function publicSupabaseEnv(env: Record<string, string>) {
  const first = (...names: string[]) => names.map(name => env[name]?.trim()).find(Boolean) ?? '';
  return {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(first('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL')),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(first('VITE_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')),
  };
}

export default defineConfig(({ mode }) => ({
  define: publicSupabaseEnv(loadEnv(mode, '.', '')),
}));
