// Vercel Serverless Function — handles image/PDF analysis via Claude API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  try {
    const { base64, mimeType, system, prompt } = req.body

    if (!base64) return res.status(400).json({ error: 'base64 data required' })

    // Build content with image/document
    const contentParts = []
    
    if (mimeType === 'application/pdf') {
      contentParts.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      })
    } else {
      contentParts.push({
        type: 'image',
        source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: base64 },
      })
    }
    
    contentParts.push({ type: 'text', text: prompt || 'استخرج المهام من هذا المحتوى' })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: system || '',
        messages: [{ role: 'user', content: contentParts }],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Anthropic Vision error:', response.status, errBody)
      let detail = ''
      try { detail = JSON.parse(errBody)?.error?.message || '' } catch { detail = errBody.slice(0, 200) }
      return res.status(response.status).json({ error: `API ${response.status}: ${detail}` })
    }

    const data = await response.json()
    const text = data.content
      ?.filter(block => block.type === 'text')
      ?.map(block => block.text)
      ?.join('\n') || ''

    return res.status(200).json({ text })

  } catch (error) {
    console.error('Vision proxy error:', error)
    return res.status(500).json({ error: error.message })
  }
}
