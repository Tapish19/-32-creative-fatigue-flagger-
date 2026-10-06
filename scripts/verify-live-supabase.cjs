const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const bundles = [];
    page.on('response', response => {
      if (/\/assets\/.*\.js/.test(response.url())) bundles.push(response.text());
    });
    await page.goto('https://32-creative-fatigue-flagger.vercel.app', { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Client database', exact: true }).click();
    await page.getByRole('heading', { name: 'Client sign-in', exact: true }).waitFor();
    assert.equal(await page.getByText('Database connection pending', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('Live browser: client sign-in displayed; no pending connection or JavaScript errors.');
    const source = (await Promise.all(bundles)).join('\n');
    const url = source.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
    const key = source.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
    assert(url && key, 'Browser-safe Supabase configuration is present in deployed assets.');
    const headers = { apikey: key };
    const auth = await page.request.get(`${url}/auth/v1/settings`, { headers });
    console.log('Live Supabase Auth status:', auth.status());
    assert.equal(auth.status(), 200);
    for (const table of ['clients', 'app_users', 'client_users', 'creative_flags']) {
      const response = await page.request.get(`${url}/rest/v1/${table}?select=*&limit=0`, { headers });
      const result = await response.json();
      console.log('Table check:', table, 'status:', response.status(), 'code:', result.code || 'OK');
      assert.notEqual(result.code, 'PGRST205', `${table} is missing from the live database`);
    }
    if (fs.existsSync('.vercel/client-test-logins.json')) {
      const logins = JSON.parse(fs.readFileSync('.vercel/client-test-logins.json', 'utf8'));
      for (const login of logins) {
        await page.getByLabel('Email', { exact: true }).fill(login.email);
        await page.getByLabel('Password', { exact: true }).fill(login.password);
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        const assigned = page.locator('.database-page .table-wrap').nth(0);
        await assigned.getByText(login.client_id === 1 ? 'User 1' : 'User 6', { exact: true }).waitFor();
        assert.equal(await assigned.locator('tbody tr').count(), 5);
        assert.equal(await assigned.getByText(login.client_id === 1 ? 'User 6' : 'User 1', { exact: true }).count(), 0);
        const session = await page.evaluate(() => {
          const name = Object.keys(localStorage).find(name => /^sb-.*-auth-token$/.test(name));
          return name ? JSON.parse(localStorage.getItem(name)).access_token : null;
        });
        assert(session);
        const crossClient = await page.request.get(`${url}/rest/v1/creative_flags?select=flag_id&client_id=eq.${login.client_id === 1 ? 2 : 1}`, { headers: { apikey: key, Authorization: `Bearer ${session}` } });
        assert.equal(crossClient.status(), 200);
        assert.deepEqual(await crossClient.json(), []);
        await page.getByRole('link', { name: 'Creative analysis', exact: true }).click();
        await page.getByRole('button', { name: 'Load official sample', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'Showing 10 of 10 creatives' }).waitFor();
        await page.getByRole('combobox', { name: /Assigned user/ }).selectOption(`${login.client_id}:${login.client_id === 1 ? 4 : 6}`);
        await page.getByRole('button', { name: 'Save flagged ads', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'Saved 4 flag records.' }).waitFor();
        await page.getByRole('link', { name: 'Client database', exact: true }).click();
        await page.locator('.database-page .table-wrap').nth(1).getByText('50.71%', { exact: true }).first().waitFor();
        console.log(`Client ${login.client_id}: real sign-in, assigned users, cross-client isolation and saving sample flags passed.`);
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await page.getByRole('heading', { name: 'Client sign-in', exact: true }).waitFor();
      }
      assert.deepEqual(errors, []);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
