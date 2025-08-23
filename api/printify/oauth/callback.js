async function exchangeCode(appId, code) {
  const resp = await fetch('https://api.printify.com/v1/app/oauth/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'OwnAiMerch' },
    body: JSON.stringify({ app_id: appId, code })
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(json));
  return json; // { access_token, refresh_token, expire_at }
}

export default async function handler(req, res) {
  try {
    const appId = process.env.PRINTIFY_APP_ID;
    const url   = new URL(req.url, `https://${req.headers.host}`);
    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code) return res.status(400).send('Missing code');

    const cookieState = (req.headers.cookie || '')
      .split('; ').find(c => c.startsWith('pfy_state='))?.split('=')[1];
    if (!state || state !== cookieState) return res.status(400).send('Bad state');

    const tokens = await exchangeCode(appId, code);

    res.setHeader('Set-Cookie', [
      `pfy_access=${encodeURIComponent(tokens.access_token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=21600`,
      `pfy_refresh=${encodeURIComponent(tokens.refresh_token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
    ]);

    res.writeHead(302, { Location: '/printify/connected' });
    res.end();
  } catch (e) {
    console.error('OAuth callback error:', e);
    res.status(500).send('OAuth callback error');
  }
}
