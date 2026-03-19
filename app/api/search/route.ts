import { NextRequest, NextResponse } from 'next/server'

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
      const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&sort=${sort || 'new'}&limit=${limit || 25}&restrict_sr=${sub !== 'all' ? '1' : '0'}&t=week`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'reddit-reply-tool/1.0' },
        next: { revalidate: 60 },
      })

      if (!res.ok) {
        console.error(`Reddit API error for r/${sub}:`, res.status)
        continue
      }

      const data = await res.json()
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
    }

    return NextResponse.json({ posts })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
