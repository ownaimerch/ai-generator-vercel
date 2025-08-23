export default function handler(req, res) {
  res.status(200).json({
    hasAppId: Boolean(process.env.PRINTIFY_APP_ID),
    presentKeys: Object.keys(process.env).filter(k => k.startsWith('PRINTIFY'))
  });
}
