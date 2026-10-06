// Administrative setup. Reads the connection from the environment and never logs it.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const reportOnly = process.argv.includes('--report');
let stage = 'connect';
function report(result) {
  if (reportOnly) fs.writeFileSync(path.join(__dirname, '../public/database-setup-report.json'), JSON.stringify(result));
}

(async () => {
  const connectionString = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) throw new Error('Supply the selected project database connection through the environment.');
  const parsed = new URL(connectionString);
  for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) parsed.searchParams.delete(parameter);
  const database = new Client({
    connectionString: parsed.toString(), connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: true, ca: fs.readFileSync(path.join(__dirname, '../supabase/prod-ca-2021.crt'), 'utf8') },
  });
  await database.connect();
  stage = 'schema';
  try {
    const names = ['clients', 'app_users', 'client_users', 'creative_flags'];
    await database.query('begin');
    try {
      await database.query('select pg_advisory_xact_lock(20261006)');
      const existing = await database.query('select table_name from information_schema.tables where table_schema = $1 and table_name = any($2::text[])', ['public', names]);
      if (existing.rows.length !== 0 && existing.rows.length !== names.length) throw new Error('Partial client schema exists; review before applying the migration.');
      if (!existing.rows.length) await database.query(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261006000100_client_creative_flags.sql'), 'utf8'));
      await database.query(fs.readFileSync(path.join(__dirname, '../supabase/seed.sql'), 'utf8'));
      const policies = await database.query('select tablename, policyname from pg_policies where schemaname = $1 and tablename = any($2::text[])', ['public', names]);
      const rls = await database.query('select relname, relrowsecurity from pg_class join pg_namespace on pg_class.relnamespace = pg_namespace.oid where nspname = $1 and relname = any($2::text[])', ['public', names]);
      if (rls.rows.length !== 4 || rls.rows.some(row => !row.relrowsecurity) || policies.rows.length !== 5) throw new Error('Expected access policies are missing; setup rolled back.');
      // Release foreign-key creation locks on auth.users before calling Auth.
      await database.query("notify pgrst, 'reload schema'");
      await database.query('commit');
      await database.query('begin');
      await database.query('select pg_advisory_xact_lock(20261006)');
      if (process.env.CLIENT_1_EMAIL || process.env.CLIENT_2_EMAIL) {
        stage = 'client-logins';
        for (const id of [1, 2]) {
          const email = process.env[`CLIENT_${id}_EMAIL`];
          if (!email) continue;
          const user = await database.query('select id, raw_user_meta_data from auth.users where lower(email) = lower($1)', [email]);
          let userId = user.rows[0]?.id;
          const password = process.env[`CLIENT_${id}_PASSWORD`];
          if (password) {
            if (userId && user.rows[0].raw_user_meta_data?.creative_fatigue_test_client !== id) throw new Error('An existing account cannot be replaced by test setup.');
            const url = process.env.SUPABASE_URL;
            const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (!url || !key) throw new Error('Auth administration configuration is missing.');
            const response = await fetch(`${url}/auth/v1/admin/users${userId ? '/' + userId : ''}`, {
              method: userId ? 'PUT' : 'POST',
              signal: AbortSignal.timeout(15000),
              headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { creative_fatigue_test_client: id } }),
            });
            const account = await response.json();
            if (!response.ok || !account.id) { const error = new Error('Test login creation failed.'); error.code = 'AUTH_SETUP_' + response.status; throw error; }
            userId = account.id;
          }
          if (!userId) throw new Error(`Client ${id} needs an existing Auth account.`);
          const assignment = await database.query('update public.clients set auth_user_id = $1 where client_id = $2 and (auth_user_id is null or auth_user_id = $1) returning client_id', [userId, id]);
          if (assignment.rowCount !== 1) throw new Error('A client already has a different login assignment.');
        }
      }
      await database.query("notify pgrst, 'reload schema'");
      await database.query('commit');
      console.log('Client tables and seed assignments are ready; row-level security and five access policies verified.');
      const accounts = await database.query('select count(*)::int as total from auth.users');
      const assignments = await database.query('select client_id, auth_user_id is not null as login_assigned from public.clients where client_id in (1, 2) order by client_id');
      console.log('Auth account count:', accounts.rows[0].total);
      console.log('Client login assignments:', JSON.stringify(assignments.rows));
      report({ ready: true, authAccounts: accounts.rows[0].total, assignments: assignments.rows });
    } catch (error) {
      await database.query('rollback');
      throw error;
    }
  } finally { await database.end(); }
})().catch(error => {
  // Connection errors can contain host/user details, so keep this output limited.
  console.error('Setup did not complete.', error.code || 'Review connection and schema before retrying.');
  report({ ready: false, stage, code: error.code || 'SETUP_FAILED' });
  process.exitCode = reportOnly ? 0 : 1;
});
