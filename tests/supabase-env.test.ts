import { describe, expect, it } from 'vitest';
import { publicSupabaseEnv } from '../vite.config';

describe('Supabase build configuration', () => {
  it('uses the Vercel integration public variables when Vite variables are absent', () => {
    expect(publicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' })).toEqual({
      'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"',
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"sb_publishable_example"',
    });
  });
  it('keeps explicit Vite settings ahead of integration defaults', () => {
    expect(publicSupabaseEnv({ VITE_SUPABASE_URL: 'https://local.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'local-key', NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co', SUPABASE_ANON_KEY: 'other-key' })).toEqual({
      'import.meta.env.VITE_SUPABASE_URL': '"https://local.supabase.co"',
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"local-key"',
    });
  });
  it('never falls back to secret or service role keys', () => {
    expect(publicSupabaseEnv({ SUPABASE_SECRET_KEY: 'private-secret', SUPABASE_SERVICE_ROLE_KEY: 'private-role', POSTGRES_PASSWORD: 'private-password' })).toEqual({
      'import.meta.env.VITE_SUPABASE_URL': '""',
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '""',
    });
  });
});
