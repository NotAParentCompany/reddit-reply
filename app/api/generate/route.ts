import { NextRequest, NextResponse } from 'next/server'

const TONE_INSTRUCTIONS: Record<string, string> = {
  helpful: 'Be genuinely helpful and educational. Share useful, actionable information.',
  casual: 'Be casual, warm, and conversational — like a fellow community member.',
  expert: 'Be authoritative and precise. Demonstrate expertise without being condescending.',
  curious: 'Ask a thoughtful follow-up question that moves the conversation forward.',
  witty: 'Be witty and light-touch, but still add real value.',
}

export async function POST(req: NextRequest) {
  try {
    const { post, tone, productContext, customContext } = await req.json()

    const prompt = buildPrompt(post, tone, productContext, customContext)

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set in .env.local' }, { status: 500 })

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.85 },
        }),
      }
    )
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''

    return NextResponse.json({ reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function buildPrompt(
  post: { title: string; selftext: string; subreddit: string },
  tone: string,
  productContext: string,
  customContext: string
): string {
  const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.helpful

  return `You are a Reddit user replying to this post.

POST TITLE: ${post.title}
POST BODY: ${post.selftext || '[link post / no body text]'}
SUBREDDIT: r/${post.subreddit}

YOUR IDENTITY: ${productContext || 'A founder building software tools for freelancers and small agencies.'}
TONE: ${toneInstruction}
${customContext ? `EXTRA CONTEXT: ${customContext}` : ''}

Write a Reddit reply that:
- Sounds like a real human, not AI or a salesperson
- Adds genuine value — don't be generic
- Is concise (50–150 words ideally)
- Fits Reddit culture: no hype, no corporate speak, no hashtags
- Only mention your product if it's genuinely relevant and feels natural — never forced
- No preamble, no "Great question!", just the reply text

Output the reply text only.`
}
