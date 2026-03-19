import { NextRequest, NextResponse } from 'next/server'

const UA = 'web:reddit-reply-tool:v1.0 (by /u/dight_pro)'

// ── Reddit OAuth token cache ──
let cachedToken: { token: string; expiresAt: number } | null = null

async function getRedditToken(): Promise<string | null> {
  // Return cached token if still valid (with 60s buffer)
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
        'User-Agent': UA,
      },
      body: 'grant_type=client_credentials',
    })

    if (!res.ok) {
      console.error('Reddit OAuth failed:', res.status, await res.text())
      return null
    }

    const data = await res.json()
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    }
    return cachedToken.token
  } catch (err) {
    console.error('Reddit OAuth error:', err)
    return null
  }
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

    // Try OAuth first, fall back to public API
    const token = await getRedditToken()
    const useOAuth = !!token

    for (const sub of subs) {
      const searchParams = new URLSearchParams({
        q: query,
        sort: sort || 'new',
        limit: String(limit || 25),
        restrict_sr: sub !== 'all' ? '1' : '0',
        t: 'week',
        raw_json: '1',
        type: 'link',
      })

      const url = useOAuth
        ? `https://oauth.reddit.com/r/${sub}/search?${searchParams}`
        : `https://www.reddit.com/r/${sub}/search.json?${searchParams}`

      try {
        const headers: Record<string, string> = {
          'User-Agent': UA,
          'Accept': 'application/json',
        }
        if (useOAuth) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const res = await fetch(url, { headers })

        if (res.status === 429) {
          console.warn(`Reddit rate-limited on r/${sub}, waiting 2s...`)
          await new Promise(r => setTimeout(r, 2000))
          continue
        }

        if (res.status === 401 && useOAuth) {
          // Token expired mid-request, clear cache
          cachedToken = null
          console.warn('Reddit OAuth token expired, skipping')
          continue
        }

        if (!res.ok) {
          console.error(`Reddit API error for r/${sub}:`, res.status, res.statusText)
          continue
        }

        const text = await res.text()
        let data
        try { data = JSON.parse(text) } catch {
          console.error(`Reddit returned non-JSON for r/${sub}:`, text.slice(0, 200))
          continue
        }

        const items = data?.data?.children || []
        for (const item of items) {
          const d = item.data
          if (!seen.has(d.id)) {
            seen.add(d.id)
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
      } catch (fetchErr) {
        console.error(`Fetch failed for r/${sub}:`, fetchErr)
        continue
      }

      // Small delay between subreddit requests to avoid rate limiting
      if (subs.length > 1) await new Promise(r => setTimeout(r, 500))
    }

    return NextResponse.json({ posts })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
