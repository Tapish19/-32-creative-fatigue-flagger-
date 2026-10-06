// Browser smoke test with mocked Supabase HTTP responses. RLS is tested in SQL.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const users = Array.from({ length: 10 }, (_, index) => ({ user_id: index + 1, display_name: `User ${index + 1}` }));
const flags = [];
const principal = client => ({ id: `00000000-0000-4000-8000-00000000000${client}`, email: `client${client}@example.test`, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-06T00:00:00Z' });
const jwt = client => [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: principal(client).id, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test-signature'].join('.');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.**/*', route => route.abort());
    await page.route('https://demo.supabase.co/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
      if (url.pathname === '/auth/v1/token') {
        const client = request.postDataJSON().email === 'client1@example.test' ? 1 : 2;
        return route.fulfill({ status: 200, headers, body: JSON.stringify({ access_token: jwt(client), refresh_token: `refresh-${client}`, expires_in: 3600, token_type: 'bearer', user: principal(client) }) });
      }
      if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
      const token = request.headers().authorization?.split(' ')[1];
      let client = 0;
      try { client = Number(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub.slice(-1)); } catch {}
      let data = [];
      if (url.pathname === '/rest/v1/clients') data = client ? [{ client_id: client, client_name: `Client ${client}` }] : [];
      else if (url.pathname === '/rest/v1/app_users') data = users.filter(user => client === 1 ? user.user_id <= 5 : client === 2 ? user.user_id >= 6 : false);
      else if (url.pathname === '/rest/v1/creative_flags') {
        if (request.method() === 'POST') {
          const records = request.postDataJSON();
          assert(records.every(record => record.client_id === client));
          flags.push(...records.map((record, index) => ({ ...record, flag_id: `flag-${flags.length + index}`, flagged_at: '2026-10-06T11:00:00Z' })));
          return route.fulfill({ status: 201, headers, body: '[]' });
        }
        data = flags.filter(record => record.client_id === client);
      } else throw new Error(`Unexpected Supabase request: ${url.pathname}`);
      if (request.headers().accept?.includes('vnd.pgrst.object')) data = data[0] || null;
      return route.fulfill({ status: 200, headers, body: JSON.stringify(data) });
    });
    await page.goto(process.env.TEST_APP_URL || 'http://127.0.0.1:4178', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Load official sample', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Showing 10 of 10 creatives' }).waitFor();
    await page.getByRole('link', { name: 'Client database', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill('client1@example.test');
    await page.getByLabel('Password', { exact: true }).fill('mock-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const assigned = page.locator('.database-page .table-wrap').nth(0);
    await assigned.getByText('User 5', { exact: true }).waitFor();
    assert.equal(await assigned.locator('tbody tr').count(), 5);
    assert.equal(await assigned.getByText('User 6', { exact: true }).count(), 0);
    await page.getByRole('link', { name: 'Creative analysis', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Showing 10 of 10 creatives' }).waitFor();
    await page.getByRole('combobox', { name: /Assigned user/ }).selectOption('1:4');
    await page.getByRole('button', { name: 'Save flagged ads', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Saved 4 flag records.' }).waitFor();
    assert.equal(flags.length, 4);
    assert(flags.every(record => record.client_id === 1 && record.user_id === 4 && record.dropped_on === '2026-09-28'));
    await page.getByRole('link', { name: 'Client database', exact: true }).click();
    await page.locator('.database-page .table-wrap').nth(1).getByText('50.71%', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('heading', { name: 'Client sign-in', exact: true }).waitFor();
    await page.getByLabel('Email', { exact: true }).fill('client2@example.test');
    await page.getByLabel('Password', { exact: true }).fill('mock-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await assigned.getByText('User 6', { exact: true }).waitFor();
    assert.equal(await assigned.locator('tbody tr').count(), 5);
    assert.equal(await assigned.getByText('User 1', { exact: true }).count(), 0);
    await page.getByText('No flags saved yet.', { exact: false }).waitFor();
    assert.equal(await page.locator('.database-page').getByText('50.71%', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('Browser smoke passed: navigation, login, assigned users, saving flags, observation dates, logout and client switching.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
