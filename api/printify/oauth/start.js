export default function handler(req, res) {
  const appId = process.env.PRINTIFY_APP_ID;
  if (!appId) return res.status(500).send('PRINTIFY_APP_ID is missing');

  const accept  = encodeURIComponent('https://app.ownaimerch.com/api/printify/oauth/callback');
  const decline = encodeURIComponent('https://app.ownaimerch.com/printify/declined');
  const state   = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));

  // zapisz state w ciasteczku (prosty CSRF)
  res.setHeader('Set-Cookie', `pfy_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);

  // UWAGA: backticky i poprawna domena printify.com
  const url = `https://printify.com/app/authorize?app_id=${appId}&accept_url=${accept}&decline_url=${decline}&state=${state}`;
  res.writeHead(302, { Location: url });
  res.end();
}
