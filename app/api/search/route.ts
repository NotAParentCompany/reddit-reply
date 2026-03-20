import { NextRequest, NextResponse } from 'next/server'

// ── Multiple strategies to fetch Reddit data from server IPs ──

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const BOT_UA = 'web:reddit-reply-tool:v1.0 (by /u/dight_pro)'

// Strategy 1: Reddit OAuth (if credentials available)
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

async function searchWithOAuth(query: string, sub: string, sort: string, limit: number): Promise<unknown[] | null> {
  const token = await getRedditToken()
  if (!token) return null
  const params = new URLSearchParams({
    q: query, sort, limit: String(limit),
    restrict_sr: sub !== 'all' ? '1' : '0',
    t: 'week', raw_json: '1', type: 'link',
  })
  try {
    const res = await fetch(`https://oauth.reddit.com/r/${sub}/search?${params}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': BOT_UA },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.data?.children || null
  } catch { return null }
}

// Strategy 2: PullPush.io (free Reddit search archive API)
async function searchWithPullPush(query: string, sub: string, sort: string, limit: number): Promise<unknown[] | null> {
  try {
    const params = new URLSearchParams({
      q: query,
      size: String(Math.min(limit, 100)),
      sort: 'desc',
      sort_type: sort === 'top' ? 'score' : 'created_utc',
      ...(sub !== 'all' ? { subreddit: sub } : {}),
    })
    const res = await fetch(`https://api.pullpush.io/reddit/search/submission/?${params}`, {
      headers: { 'User-Agent': BROWSER_UA },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.data?.length) return null
    return data.data.map((d: Record<string, unknown>) => ({
      kind: 't3',
      data: {
        id: d.id,
        title: d.title,
        selftext: d.selftext || '',
        subreddit: d.subreddit,
        author: d.author,
        score: d.score || 0,
        num_comments: d.num_comments || 0,
        permalink: d.permalink,
        url: d.url,
        is_self: d.is_self ?? true,
        created_utc: d.created_utc,
        link_flair_text: d.link_flair_text || null,
      },
    }))
  } catch { return null }
}

// Strategy 3: Public Reddit JSON with browser-like headers
async function searchWithPublicAPI(query: string, sub: string, sort: string, limit: number): Promise<unknown[] | null> {
  const params = new URLSearchParams({
    q: query, sort, limit: String(limit),
    restrict_sr: sub !== 'all' ? '1' : '0',
    t: 'week', raw_json: '1', type: 'link',
  })
  for (const domain of ['old.reddit.com', 'www.reddit.com']) {
    try {
      const res = await fetch(`https://${domain}/r/${sub}/search.json?${params}`, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      if (!res.ok) continue
      const text = await res.text()
      if (text.startsWith('{') || text.startsWith('[')) {
        const data = JSON.parse(text)
        const items = data?.data?.children
        if (items?.length) return items
      }
    } catch { continue }
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const { keywords, subreddits, sort, limit } = await req.json()

    if (!keywords?.length) {
      return NextResponse.json({ error: 'No keywords provided' }, { status: 400 })
    }

    const query = keywords.join(' OR ')
    const subs: string[] = subreddits?.length ? subreddits : ['all']
    const posts: Record<string, unknown>[] = []
    const seen = new Set<string>()
    const debugInfo: string[] = []

    for (const sub of subs) {
      let items: unknown[] | null = null

      // Try each strategy in order
      items = await searchWithOAuth(query, sub, sort || 'new', limit || 25)
      if (items?.length) {
        debugInfo.push(`r/${sub}: OAuth ✓ (${items.length})`)
      }

      if (!items?.length) {
        items = await searchWithPullPush(query, sub, sort || 'new', limit || 25)
        if (items?.length) {
          debugInfo.push(`r/${sub}: PullPush ✓ (${items.length})`)
        }
      }

      if (!items?.length) {
        items = await searchWithPublicAPI(query, sub, sort || 'new', limit || 25)
        if (items?.length) {
          debugInfo.push(`r/${sub}: PublicAPI ✓ (${items.length})`)
        }
      }

      if (!items?.length) {
        debugInfo.push(`r/${sub}: All strategies failed`)
        continue
      }

      for (const item of items) {
        const d = (item as { data: Record<string, unknown> }).data
        const id = d.id as string
        if (!seen.has(id)) {
          seen.add(id)
          posts.push({
            id: d.id,
            title: d.title,
            selftext: d.selftext || '',
            subreddit: d.subreddit,
            author: d.author,
            score: d.score,
            num_comments: d.num_comments,
            permalink: d.permalink,
            url: d.url,
            is_self: d.is_self,
            created_utc: d.created_utc,
            link_flair_text: d.link_flair_text || null,
          })
        }
      }

      if (subs.length > 1) await new Promise(r => setTimeout(r, 300))
    }

    console.log('Search debug:', debugInfo.join(' | '))
    return NextResponse.json({ posts, _debug: debugInfo })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
