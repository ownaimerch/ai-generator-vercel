// /api/printify/create.js  (Vercel / Node 18+)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.PRINTIFY_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'PRINTIFY_API_TOKEN missing' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Przyjmujemy trzy aliasy dla adresu obrazka
  const imageUrl = body.imageUrl || body.url || null;
  const contents = body.contents || null; // "data:image/jpeg;base64,...."
  const fileName = body.file_name || body.filename || 'design.jpg';

  if (!imageUrl && !contents) {
    return res.status(400).json({ error: 'Provide either imageUrl/url or contents (base64 data URI)' });
  }

  // Budujemy payload do Printify Uploads
  const uploadsPayload = contents
    ? { file_name: fileName, contents }
    : { file_name: fileName, url: imageUrl };

  // Upload do Printify
  const r = await fetch('https://api.printify.com/v1/uploads/images.json', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(uploadsPayload)
  });

  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

  if (!r.ok) {
    // Przepuść błąd Printify — zobaczymy dokładnie co im nie pasuje
    return res.status(r.status).json({ step: 'upload', status: r.status, data });
  }

  // Zwracamy upload_id – na tym etapie to nam wystarczy
  return res.status(200).json({ ok: true, upload: data });
}
