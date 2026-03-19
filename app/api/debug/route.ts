import { NextResponse } from 'next/server'

const UA = 'web:reddit-reply-tool:v1.0 (by /u/dight_pro)'

export async function GET() {
  const debug: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID ? `set (${process.env.REDDIT_CLIENT_ID.length} chars)` : 'NOT SET',
      REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET ? `set (${process.env.REDDIT_CLIENT_SECRET.length} chars)` : 'NOT SET',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'set' : 'NOT SET',
    },
  }

  // Step 1: Try Reddit OAuth
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET

  if (clientId && clientSecret) {
    try {
      const oauthRes = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA,
        },
        body: 'grant_type=client_credentials',
      })
      const oauthText = await oauthRes.text()
      debug.oauth = {
        status: oauthRes.status,
        body: oauthText.slice(0, 500),
      }

      if (oauthRes.ok) {
        const oauthData = JSON.parse(oauthText)
        const token = oauthData.access_token

        // Step 2: Try OAuth search
        const searchUrl = `https://oauth.reddit.com/r/all/search?q=python&sort=new&limit=3&restrict_sr=0&t=week&raw_json=1&type=link`
        const searchRes = await fetch(searchUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': UA,
            'Accept': 'application/json',
          },
        })
        const searchText = await searchRes.text()
        debug.oauth_search = {
          status: searchRes.status,
          body_length: searchText.length,
          body_preview: searchText.slice(0, 300),
          posts_found: (() => {
            try { return JSON.parse(searchText)?.data?.children?.length || 0 } catch { return 'parse_error' }
          })(),
        }
      }
    } catch (err) {
      debug.oauth_error = String(err)
    }
  }

  // Step 3: Try public API (will likely fail on Vercel but good to confirm)
  try {
    const pubUrl = 'https://www.reddit.com/r/all/search.json?q=python&sort=new&limit=3&restrict_sr=0&t=week&raw_json=1'
    const pubRes = await fetch(pubUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
      },
    })
    const pubText = await pubRes.text()
    debug.public_api = {
      status: pubRes.status,
      body_length: pubText.length,
      body_preview: pubText.slice(0, 300),
      posts_found: (() => {
        try { return JSON.parse(pubText)?.data?.children?.length || 0 } catch { return 'parse_error' }
      })(),
    }
  } catch (err) {
    debug.public_api_error = String(err)
  }

  return NextResponse.json(debug, { status: 200 })
}
