import { NextRequest, NextResponse } from 'next/server'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

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

    for (const sub of subs) {
      const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&sort=${sort || 'new'}&limit=${limit || 25}&restrict_sr=${sub !== 'all' ? '1' : '0'}&t=week&raw_json=1`
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': UA,
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        })

        if (res.status === 429) {
          console.warn(`Reddit rate-limited on r/${sub}, waiting 2s...`)
          await new Promise(r => setTimeout(r, 2000))
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
