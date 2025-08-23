export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    host: req.headers.host,
    time: new Date().toISOString(),
    pid: typeof process !== 'undefined' ? process.pid : null
  });
}
