import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// GET — load last saved subreddits
export async function GET() {
  try {
    const sb = getSupabase()
    if (!sb) return NextResponse.json({ subreddits: [] })

    const { data, error } = await sb
      .from('subreddit_history')
      .select('subreddits')
      .order('used_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return NextResponse.json({ subreddits: [] })
    return NextResponse.json({ subreddits: data.subreddits || [] })
  } catch {
    return NextResponse.json({ subreddits: [] })
  }
}

// POST — save subreddits
export async function POST(req: NextRequest) {
  try {
    const { subreddits } = await req.json()
    const sb = getSupabase()
    if (!sb) return NextResponse.json({ ok: false, error: 'Supabase not configured' })

    const subs: string[] = Array.isArray(subreddits) ? subreddits.filter(Boolean) : []

    const { error } = await sb
      .from('subreddit_history')
      .insert({
        subreddits: subs,
        raw_input: subs.join(', '),
      })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Save failed'
    return NextResponse.json({ ok: false, error: msg })
  }
}
