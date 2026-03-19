import { NextRequest, NextResponse } from 'next/server'

const TONE_INSTRUCTIONS: Record<string, string> = {
  helpful: 'Be genuinely helpful and educational. Share useful, actionable information.',
  casual: 'Be casual, warm, and conversational — like a fellow community member.',
  expert: 'Be authoritative and precise. Demonstrate expertise without being condescending.',
  curious: 'Ask a thoughtful follow-up question that moves the conversation forward.',
  witty: 'Be witty and light-touch, but still add real value.',
}

const LENGTH_INSTRUCTIONS: Record<string, string> = {
  'very-very-short': 'Keep it extremely brief — 1–2 sentences max, under 30 words.',
  'very-short': 'Keep it very short — 2–3 sentences, around 30–50 words.',
  'short': 'Keep it concise — 3–5 sentences, around 50–100 words.',
  'long': 'Write a thorough, detailed reply — 150–250 words. Go in-depth.',
}

export async function POST(req: NextRequest) {
  try {
    const { post, tone, productContext, customContext, length, productInfo, systemPrompt } = await req.json()

    const prompt = buildPrompt(post, tone, productContext, customContext, length, productInfo, systemPrompt)

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set in .env.local' }, { status: 500 })

    const maxTokens = length === 'long' ? 800 : length === 'short' ? 300 : 150

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.85 },
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
  customContext: string,
  length: string,
  productInfo?: { name: string; url: string; description: string; features: string },
  systemPrompt?: string
): string {
  const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.helpful
  const lengthInstruction = LENGTH_INSTRUCTIONS[length] || LENGTH_INSTRUCTIONS.short

  const hasProduct = productInfo && productInfo.name && productInfo.name.trim()

  const productBlock = hasProduct
    ? `
YOUR PRODUCT:
- Name: ${productInfo.name}
- URL: ${productInfo.url || '[no url]'}
- What it does: ${productInfo.description || '[no description]'}
- Key features: ${productInfo.features || '[no features listed]'}

PRODUCT MENTION RULES:
- Casually mention your product ONLY if it's genuinely relevant to the post
- Work it in naturally — like "I've been using X for this" or "something like X helped me with that"
- IMPORTANT: When you mention the product, INCLUDE THE URL naturally. E.g. "I've been using [product name](${productInfo.url})" or just drop the URL after mentioning it like "check out productname (${productInfo.url})". Reddit supports markdown links.
- Try to include the URL most of the time when mentioning the product — it's the whole point
- Never lead with the product. Lead with value, help, or shared experience first.
- If the post isn't related to your product at all, do NOT mention it
- Sound like a real user sharing a tool they like, not a marketer`
    : ''

  // If a custom system prompt is provided, fill in template variables
  if (systemPrompt) {
    return systemPrompt
      .replace(/\{\{post_title\}\}/g, post.title)
      .replace(/\{\{post_body\}\}/g, post.selftext || '[link post / no body text]')
      .replace(/\{\{subreddit\}\}/g, post.subreddit)
      .replace(/\{\{identity\}\}/g, productContext || 'A founder building software tools.')
      .replace(/\{\{tone_instruction\}\}/g, toneInstruction)
      .replace(/\{\{length_instruction\}\}/g, lengthInstruction)
      .replace(/\{\{product_block\}\}/g, productBlock)
      .replace(/\{\{custom_context\}\}/g, customContext ? `EXTRA CONTEXT: ${customContext}` : '')
  }

  return `You are a Reddit user replying to this post.

POST TITLE: ${post.title}
POST BODY: ${post.selftext || '[link post / no body text]'}
SUBREDDIT: r/${post.subreddit}

YOUR IDENTITY: ${productContext || 'A founder building software tools.'}
TONE: ${toneInstruction}
LENGTH: ${lengthInstruction}
${productBlock}
${customContext ? `EXTRA CONTEXT: ${customContext}` : ''}

TONE MATCHING: Study the subreddit's vibe and how the post is written. If the OP uses casual slang, lowercase, or abbreviations — mirror that slightly. If it's a serious/technical sub, match that energy. Blend your tone with the thread's natural voice so your reply feels native to the conversation.

Write a Reddit reply that:
- Sounds like a real human, not AI or a salesperson
- Adds genuine value — don't be generic
- Strictly follows the LENGTH instruction above
- Subtly matches the writing style & energy of the thread (slang, formality, humor level)
- Fits Reddit culture: no hype, no corporate speak, no hashtags
- No preamble, no "Great question!", just the reply text

Output the reply text only.`
}
