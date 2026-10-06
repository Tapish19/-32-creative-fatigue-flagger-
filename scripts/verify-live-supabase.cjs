const assert = require('node:assert/strict');
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
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
