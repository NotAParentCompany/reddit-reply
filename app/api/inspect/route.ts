import { NextRequest, NextResponse } from 'next/server'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })

    // Fetch Reddit JSON for the thread
    const jsonUrl = url.replace(/\/$/, '') + '.json?limit=20&raw_json=1'
    const res = await fetch(jsonUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    if (!res.ok) throw new Error(`Could not fetch Reddit thread (${res.status})`)

    const data = await res.json()
    const post = data?.[0]?.data?.children?.[0]?.data
    const comments = data?.[1]?.data?.children
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
