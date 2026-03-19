# reddit-reply — dight.pro

AI-powered Reddit reply engine. Search by keyword, inspect URLs, generate replies.

## Setup

```bash
npm install
```

Edit `.env.local`:
```
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
DEFAULT_AI_PROVIDER=gemini
```

## Run

```bash
npm run dev      # development
npm run build    # production build
npm start        # production server
```

Opens at http://localhost:3000

## Features

- **Search tab** — search Reddit by keyword across subreddits, filter by sort/limit
- **Inspect URL tab** — paste any Reddit thread URL, AI reads the thread + top comments and surfaces reply opportunities
- **Reply generation** — 5 tones (helpful, casual, expert, curious, witty), custom context per post
- **One-click copy + link** to Reddit post for fast posting

## API Routes

- `POST /api/search` — searches Reddit public API (no auth needed)
- `POST /api/generate` — generates reply via Gemini or OpenAI (uses env keys)
- `POST /api/inspect` — fetches Reddit thread JSON + AI analysis

## Deploy

Works on Vercel, Railway, or any Node.js host. Set env vars in your host's dashboard.
# reddit-reply
