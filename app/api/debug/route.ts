import { NextResponse } from 'next/server'

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const BOT_UA = 'web:reddit-reply-tool:v1.0 (by /u/dight_pro)'

export async function GET() {
  const debug: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID ? `set (${process.env.REDDIT_CLIENT_ID.length} chars)` : 'NOT SET',
      REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET ? `set (${process.env.REDDIT_CLIENT_SECRET.length} chars)` : 'NOT SET',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'set' : 'NOT SET',
    },
  }

  // Test 1: Reddit OAuth
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  if (clientId && clientSecret) {
    try {
      const oauthRes = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': BOT_UA,
        },
        body: 'grant_type=client_credentials',
      })
      const oauthText = await oauthRes.text()
      debug.oauth = { status: oauthRes.status, body: oauthText.slice(0, 500) }
    } catch (err) {
      debug.oauth_error = String(err)
    }
  }

  // Test 2: PullPush.io
  try {
    const ppRes = await fetch('https://api.pullpush.io/reddit/search/submission/?q=python&size=3', {
      headers: { 'User-Agent': BROWSER_UA },
    })
    const ppText = await ppRes.text()
    debug.pullpush = {
      status: ppRes.status,
      body_length: ppText.length,
      posts_found: (() => {
        try { return JSON.parse(ppText)?.data?.length || 0 } catch { return 'parse_error' }
      })(),
      body_preview: ppText.slice(0, 200),
    }
  } catch (err) {
    debug.pullpush_error = String(err)
  }

  // Test 3: old.reddit.com with browser UA
  try {
    const oldRes = await fetch('https://old.reddit.com/r/all/search.json?q=python&sort=new&limit=3&restrict_sr=0&t=week&raw_json=1', {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    const oldText = await oldRes.text()
    const isJson = oldText.startsWith('{') || oldText.startsWith('[')
    debug.old_reddit = {
      status: oldRes.status,
      is_json: isJson,
      body_length: oldText.length,
      posts_found: isJson ? (() => { try { return JSON.parse(oldText)?.data?.children?.length || 0 } catch { return 'parse_error' } })() : 0,
      body_preview: oldText.slice(0, 200),
    }
  } catch (err) {
    debug.old_reddit_error = String(err)
  }

  // Test 4: www.reddit.com (original - likely blocked)
  try {
    const wwwRes = await fetch('https://www.reddit.com/r/all/search.json?q=python&sort=new&limit=3&restrict_sr=0&t=week&raw_json=1', {
      headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json' },
    })
    const wwwText = await wwwRes.text()
    const isJson = wwwText.startsWith('{') || wwwText.startsWith('[')
    debug.www_reddit = {
      status: wwwRes.status,
      is_json: isJson,
      body_length: wwwText.length,
      posts_found: isJson ? (() => { try { return JSON.parse(wwwText)?.data?.children?.length || 0 } catch { return 'parse_error' } })() : 0,
    }
  } catch (err) {
    debug.www_reddit_error = String(err)
  }

  return NextResponse.json(debug, { status: 200 })
}
