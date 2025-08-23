import type { VercelRequest, VercelResponse } from 'vercel';
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, host: req.headers.host, time: new Date().toISOString() });
}
