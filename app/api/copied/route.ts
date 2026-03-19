import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const { reply_text, source_tab, post_title, subreddit, comment_author, reddit_url } = await req.json()

    const sb = getSupabase()
    if (!sb) return NextResponse.json({ ok: false, error: 'Supabase not configured' })

    if (!reply_text?.trim()) return NextResponse.json({ ok: false, error: 'Empty reply' })

    const { error } = await sb
      .from('copied_replies')
      .insert({
        reply_text: reply_text.trim(),
        source_tab: source_tab || 'search',
        post_title: post_title || null,
        subreddit: subreddit || null,
        comment_author: comment_author || null,
        reddit_url: reddit_url || null,
      })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Save failed'
    return NextResponse.json({ ok: false, error: msg })
  }
}
