import { NextRequest, NextResponse } from 'next/server'

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const BOT_UA = 'web:reddit-reply-tool:v1.0 (by /u/dight_pro)'

// ── Reddit OAuth token cache ──
let cachedToken: { token: string; expiresAt: number } | null = null

async function getRedditToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  try {
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': BOT_UA,
      },
      body: 'grant_type=client_credentials',
    })
    if (!res.ok) return null
    const data = await res.json()
    cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in * 1000) }
    return cachedToken.token
  } catch { return null }
}

// Fetch thread JSON with multiple fallback strategies
async function fetchThreadJSON(url: string, path: string | null): Promise<unknown[] | null> {
  // Strategy 1: OAuth
  const token = await getRedditToken()
  if (token && path) {
    try {
      const res = await fetch(`https://oauth.reddit.com${path}.json?limit=20&raw_json=1`, {
        headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': BOT_UA },
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length >= 2) return data
      }
    } catch { /* fall through */ }
  }

  // Strategy 2: old.reddit.com with browser UA
  for (const domain of ['old.reddit.com', 'www.reddit.com']) {
    try {
      const cleanUrl = path
        ? `https://${domain}${path}.json?limit=20&raw_json=1`
        : url.replace(/\/$/, '').replace(/www\.reddit\.com|reddit\.com/, domain) + '.json?limit=20&raw_json=1'

      const res = await fetch(cleanUrl, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      if (!res.ok) continue
      const text = await res.text()
      if (text.startsWith('[') || text.startsWith('{')) {
        const data = JSON.parse(text)
        if (Array.isArray(data) && data.length >= 2) return data
      }
    } catch { continue }
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })

    // Extract the path from the Reddit URL
    const match = url.match(/reddit\.com(\/r\/[^?#]+)/)
    const path = match ? match[1].replace(/\/$/, '') : null

    const data = await fetchThreadJSON(url, path)
    if (!data) throw new Error('Could not fetch Reddit thread — all strategies failed')

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const post = (data as any)?.[0]?.data?.children?.[0]?.data
    const comments = (data as any)?.[1]?.data?.children
      ?.filter((c: { kind: string }) => c.kind === 't1')
      ?.slice(0, 8)
      ?.map((c: { data: { author: string; body: string; score: number } }) => ({
        author: c.data.author,
        body: c.data.body,
        score: c.data.score,
      })) || []

    if (!post) throw new Error('Could not parse Reddit thread')

    const threadSummary = `
TITLE: ${post.title}
SUBREDDIT: r/${post.subreddit}
BODY: ${post.selftext || '[link post]'}

TOP COMMENTS:
${comments.map((c: { author: string; body: string; score: number }, i: number) => `${i + 1}. u/${c.author} (${c.score} pts): ${c.body.slice(0, 300)}`).join('\n\n')}
    `.trim()

    const prompt = `Analyze this Reddit thread and give me:
1. TOPIC: What the post is actually about (1 sentence)
2. SENTIMENT: Overall mood of the thread (positive/negative/mixed/neutral)
3. PAIN POINTS: Key problems or frustrations mentioned (bullet list, max 4)
4. OPPORTUNITY: Best angle to reply that would add value (1-2 sentences)
5. KEYWORDS: 5 relevant keywords from this thread

Thread:
${threadSummary}

Respond in this exact format with these 5 labeled sections.`

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY not set')
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 600 } }),
      }
    )
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    const analysis = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''

    return NextResponse.json({
      post: {
        id: post.id,
        title: post.title,
        selftext: post.selftext || '',
        subreddit: post.subreddit,
        author: post.author,
        score: post.score,
        num_comments: post.num_comments,
        permalink: post.permalink,
        created_utc: post.created_utc,
      },
      comments,
      analysis,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Inspection failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
