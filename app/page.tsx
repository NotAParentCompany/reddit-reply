'use client'

import { useState, useRef } from 'react'

/* ─── TYPES ─────────────────────────────────────────────────────────── */
interface RedditPost {
  id: string
  title: string
  selftext: string
  subreddit: string
  author: string
  score: number
  num_comments: number
  permalink: string
  url: string
  created_utc: number
  link_flair_text: string | null
}

interface InspectResult {
  post: RedditPost
  comments: { author: string; body: string; score: number }[]
  analysis: string
}

type Tab = 'search' | 'inspect'

/* ─── HELPERS ───────────────────────────────────────────────────────── */
function timeAgo(unix: number) {
  const sec = Math.floor(Date.now() / 1000 - unix)
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

function esc(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* ─── STYLES (CSS-in-JS object) ─────────────────────────────────────── */
const S: Record<string, React.CSSProperties> = {
  // layout
  app: { maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px', position: 'relative', zIndex: 1 },
  gridBg: {
    position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
    backgroundImage: 'linear-gradient(rgba(255,69,0,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,69,0,0.04) 1px,transparent 1px)',
    backgroundSize: '40px 40px',
  },
  // header
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '32px 0 32px', borderBottom: '1px solid #e0e0e0', marginBottom: 32 },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoIcon: { width: 38, height: 38, background: '#ff4500', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 17, color: '#fff' },
  logoText: { fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 22, letterSpacing: -0.5 },
  headerTag: { fontSize: 13, color: '#999', letterSpacing: 2, textTransform: 'uppercase' as const },
  // panel
  panel: { background: '#ffffff', border: '1px solid #e0e0e0', borderRadius: 14, padding: 28, marginBottom: 22 },
  panelTitle: { fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' as const, color: '#999', marginBottom: 18 },
  // grid
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 },
  // form
  label: { display: 'block', fontSize: 13, color: '#888', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 8 },
  input: { width: '100%', background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 10, color: '#1a1a1a', fontFamily: 'IBM Plex Mono, monospace', fontSize: 15, padding: '12px 14px', outline: 'none' },
  // tabs
  tabs: { display: 'flex', gap: 0, background: '#ffffff', border: '1px solid #e0e0e0', borderRadius: 12, padding: 5, marginBottom: 22, width: 'fit-content' },
  tabBtn: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, fontWeight: 600, padding: '10px 24px', border: 'none', borderRadius: 9, cursor: 'pointer', letterSpacing: 0.5, transition: 'all 0.15s' },
  // button
  btn: { background: '#ff4500', border: 'none', borderRadius: 10, color: '#fff', fontFamily: 'IBM Plex Mono, monospace', fontSize: 15, fontWeight: 600, padding: '12px 24px', cursor: 'pointer', whiteSpace: 'nowrap' as const, letterSpacing: 0.5, transition: 'background 0.15s' },
  btnGhost: { background: 'transparent', border: '1px solid #e0e0e0', color: '#888', borderRadius: 10, fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '9px 16px', cursor: 'pointer' },
  btnSm: { padding: '9px 16px', fontSize: 14 },
  // status
  statusBar: { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', background: '#ffffff', border: '1px solid #e0e0e0', borderRadius: 10, marginBottom: 22, fontSize: 14, color: '#888' },
  // tag
  tag: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,69,0,0.08)', border: '1px solid rgba(255,69,0,0.25)', borderRadius: 6, padding: '5px 12px', fontSize: 14, color: '#e03d00' },
  // card
  card: { background: '#ffffff', border: '1px solid #e0e0e0', borderRadius: 14, marginBottom: 16, overflow: 'hidden' },
  cardHeader: { padding: '18px 22px 14px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  subBadge: { fontSize: 13, fontWeight: 600, color: '#ff4500', background: 'rgba(255,69,0,0.08)', border: '1px solid rgba(255,69,0,0.2)', borderRadius: 6, padding: '3px 10px' },
  postTitle: { fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 600, lineHeight: 1.4, marginTop: 6, color: '#1a1a1a' },
  // analysis
  analysisBox: { background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 10, padding: 18, fontSize: 14, lineHeight: 1.9, color: '#444', whiteSpace: 'pre-wrap' as const },
  divider: { height: 1, background: '#e0e0e0', margin: '18px 0' },
}

/* ─── MAIN COMPONENT ─────────────────────────────────────────────────── */
export default function Page() {
  const [tab, setTab] = useState<Tab>('search')
  const [keywords, setKeywords] = useState<string[]>([])
  const [kwInput, setKwInput] = useState('')
  const [subreddits, setSubreddits] = useState('')
  const [sort, setSort] = useState('new')
  const [limit, setLimit] = useState('25')
  const [productContext, setProductContext] = useState('dight.pro — AI lead scoring tool for freelancers and small agencies')
  const [posts, setPosts] = useState<RedditPost[]>([])
  const [searching, setSearching] = useState(false)
  const [status, setStatus] = useState<{ state: 'idle' | 'active' | 'loading'; text: string }>({ state: 'idle', text: 'Ready.' })
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [tones, setTones] = useState<Record<string, string>>({})
  const [customCtx, setCustomCtx] = useState<Record<string, string>>({})
  const [showCtx, setShowCtx] = useState<Record<string, boolean>>({})
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({})
  // inspect tab
  const [inspectUrl, setInspectUrl] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── TOAST ── */
  function showToast(msg: string, type = '') {
    setToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  /* ── KEYWORDS ── */
  function addKeyword() {
    if (!kwInput.trim()) return
    const news = kwInput.split(',').map(k => k.trim()).filter(k => k && !keywords.includes(k))
    setKeywords([...keywords, ...news])
    setKwInput('')
  }

  /* ── SEARCH ── */
  async function runSearch() {
    if (!keywords.length) { showToast('Add at least one keyword', 'error'); return }
    setSearching(true)
    setStatus({ state: 'loading', text: 'Searching Reddit...' })
    try {
      const subs = subreddits.split(',').map(s => s.trim()).filter(Boolean)
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, subreddits: subs, sort, limit: parseInt(limit) }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPosts(data.posts || [])
      setStatus({ state: 'active', text: `Found ${data.posts?.length || 0} posts` })
    } catch (e) {
      setStatus({ state: 'idle', text: 'Search failed' })
      showToast(e instanceof Error ? e.message : 'Search failed', 'error')
    } finally {
      setSearching(false)
    }
  }

  /* ── GENERATE REPLY ── */
  async function generateReply(post: RedditPost) {
    setGenerating(g => ({ ...g, [post.id]: true }))
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post: { title: post.title, selftext: post.selftext, subreddit: post.subreddit },
          tone: tones[post.id] || 'helpful',
          productContext,
          customContext: customCtx[post.id] || '',
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setReplies(r => ({ ...r, [post.id]: data.reply }))
      showToast('Reply generated', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Generation failed', 'error')
    } finally {
      setGenerating(g => ({ ...g, [post.id]: false }))
    }
  }

  /* ── INSPECT ── */
  async function runInspect() {
    if (!inspectUrl.trim()) { showToast('Paste a Reddit URL', 'error'); return }
    setInspecting(true)
    setInspectResult(null)
    try {
      const res = await fetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inspectUrl.trim() }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setInspectResult(data)
      showToast('Thread analyzed', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Inspection failed', 'error')
    } finally {
      setInspecting(false)
    }
  }

  /* ── COPY ── */
  function copyText(text: string) {
    navigator.clipboard.writeText(text)
    showToast('Copied!', 'success')
  }

  /* ── STATUS DOT ── */
  const dotColor = status.state === 'active' ? '#16a34a' : status.state === 'loading' ? '#ff4500' : '#ccc'

  /* ── RENDER ── */
  return (
    <>
      <div style={S.gridBg} />
      <div style={S.app}>
        {/* HEADER */}
        <header style={S.header}>
          <div style={S.logo}>
            <div style={S.logoIcon}>d</div>
            <div style={S.logoText}>
              <span style={{ color: '#1a1a1a' }}>dight</span>
              <span style={{ color: '#ff4500' }}>.pro</span>
              <span style={{ color: '#999' }}> // reddit</span>
            </div>
          </div>
          <div style={S.headerTag}>Reply Engine</div>
        </header>

        {/* CONFIG */}
        <div style={S.panel}>
          <div style={S.panelTitle}>⚙ Config</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>AI Provider</label>
              <div style={{ ...S.input, background: '#f0f0f0', color: '#888', cursor: 'default' }}>Gemini 2.0 Flash</div>
            </div>
            <div style={{ flex: 2 }}>
              <label style={S.label}>Your Product Context</label>
              <input style={S.input} value={productContext} onChange={e => setProductContext(e.target.value)} placeholder="e.g. dight.pro — AI lead scoring for freelancers" />
            </div>
          </div>
        </div>

        {/* TABS */}
        <div style={S.tabs}>
          {(['search', 'inspect'] as Tab[]).map(t => (
            <button key={t} style={{ ...S.tabBtn, background: tab === t ? '#ff4500' : 'transparent', color: tab === t ? '#fff' : '#999' }} onClick={() => setTab(t)}>
              {t === 'search' ? '🔍 Search' : '🔗 Inspect URL'}
            </button>
          ))}
        </div>

        {/* ── SEARCH TAB ── */}
        {tab === 'search' && (
          <>
            <div style={S.panel}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={S.label}>Keywords</label>
                  <input
                    style={S.input}
                    value={kwInput}
                    onChange={e => setKwInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addKeyword()}
                    placeholder="lead generation, find clients, outreach..."
                  />
                </div>
                <button style={{ ...S.btn, background: 'transparent', border: '1px solid #e0e0e0', color: '#888' }} onClick={addKeyword}>+ Add</button>
              </div>

              {keywords.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginTop: 12 }}>
                  {keywords.map(k => (
                    <span key={k} style={S.tag}>
                      {k}
                      <button onClick={() => setKeywords(keywords.filter(x => x !== k))} style={{ background: 'none', border: 'none', color: '#ff4500', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}

              <div style={{ ...S.divider, marginTop: 18 }} />

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
                <div>
                  <label style={S.label}>Subreddits (comma-sep, blank = all)</label>
                  <input style={S.input} value={subreddits} onChange={e => setSubreddits(e.target.value)} placeholder="SaaS, freelance, entrepreneur" />
                </div>
                <div>
                  <label style={S.label}>Sort</label>
                  <select style={S.input} value={sort} onChange={e => setSort(e.target.value)}>
                    {['new', 'hot', 'top', 'rising'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Results</label>
                  <select style={S.input} value={limit} onChange={e => setLimit(e.target.value)}>
                    {['10', '20', '25'].map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <button style={{ ...S.btn, opacity: searching ? 0.5 : 1 }} onClick={runSearch} disabled={searching}>
                  {searching ? '...' : 'Search'}
                </button>
              </div>
            </div>

            {/* STATUS */}
            <div style={S.statusBar}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: status.state !== 'idle' ? `0 0 8px ${dotColor}` : 'none' }} />
              <span>{status.text}</span>
            </div>

            {/* RESULTS */}
            {posts.length === 0 && !searching && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>🔍</div>
                <p style={{ fontSize: 16, lineHeight: 1.7 }}>Search Reddit by keyword to find posts worth replying to.</p>
              </div>
            )}

            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                reply={replies[post.id] || ''}
                isGenerating={!!generating[post.id]}
                tone={tones[post.id] || 'helpful'}
                ctx={customCtx[post.id] || ''}
                showCtxPanel={!!showCtx[post.id]}
                replyOpen={!!openReplies[post.id]}
                onToneChange={t => setTones(x => ({ ...x, [post.id]: t }))}
                onCtxChange={t => setCustomCtx(x => ({ ...x, [post.id]: t }))}
                onToggleCtx={() => setShowCtx(x => ({ ...x, [post.id]: !x[post.id] }))}
                onToggleReply={() => setOpenReplies(x => ({ ...x, [post.id]: !x[post.id] }))}
                onGenerate={() => generateReply(post)}
                onReplyChange={t => setReplies(x => ({ ...x, [post.id]: t }))}
                onCopy={() => copyText(replies[post.id] || '')}
              />
            ))}
          </>
        )}

        {/* ── INSPECT TAB ── */}
        {tab === 'inspect' && (
          <>
            <div style={S.panel}>
              <div style={S.panelTitle}>🔗 Paste a Reddit thread URL</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <input style={{ ...S.input, flex: 1 }} value={inspectUrl} onChange={e => setInspectUrl(e.target.value)} placeholder="https://reddit.com/r/SaaS/comments/..." onKeyDown={e => e.key === 'Enter' && runInspect()} />
                <button style={{ ...S.btn, opacity: inspecting ? 0.5 : 1 }} onClick={runInspect} disabled={inspecting}>
                  {inspecting ? 'Analyzing...' : 'Inspect'}
                </button>
              </div>
              <p style={{ fontSize: 13, color: '#999', marginTop: 10 }}>AI fetches the thread, reads top comments, and surfaces reply opportunities.</p>
            </div>

            {inspectResult && (
              <>
                {/* Post summary */}
                <div style={S.card}>
                  <div style={S.cardHeader}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <span style={S.subBadge}>r/{inspectResult.post.subreddit}</span>
                        <span style={{ fontSize: 13, color: '#999' }}>{timeAgo(inspectResult.post.created_utc)} · ▲ {inspectResult.post.score} · 💬 {inspectResult.post.num_comments}</span>
                      </div>
                      <div style={S.postTitle}>{inspectResult.post.title}</div>
                    </div>
                    <a href={`https://reddit.com${inspectResult.post.permalink}`} target="_blank" rel="noopener noreferrer" style={{ ...S.btn, ...S.btnSm, background: 'transparent', border: '1px solid #e0e0e0', color: '#888', textDecoration: 'none', display: 'inline-block' }}>↗ View</a>
                  </div>
                  {inspectResult.post.selftext && (
                    <div style={{ padding: '14px 22px', fontSize: 15, color: '#666', lineHeight: 1.6, maxHeight: 100, overflow: 'hidden' }}>
                      {inspectResult.post.selftext.slice(0, 400)}
                    </div>
                  )}
                </div>

                {/* AI Analysis */}
                <div style={S.panel}>
                  <div style={S.panelTitle}>✨ AI Analysis</div>
                  <div style={S.analysisBox}>{inspectResult.analysis}</div>
                </div>

                {/* Top comments */}
                {inspectResult.comments.length > 0 && (
                  <div style={S.panel}>
                    <div style={S.panelTitle}>💬 Top Comments</div>
                    {inspectResult.comments.map((c, i) => (
                      <div key={i} style={{ padding: '14px 0', borderBottom: i < inspectResult.comments.length - 1 ? '1px solid #e0e0e0' : 'none' }}>
                        <div style={{ fontSize: 13, color: '#999', marginBottom: 6 }}>u/{c.author} · ▲ {c.score}</div>
                        <div style={{ fontSize: 15, color: '#444', lineHeight: 1.6 }}>{c.body.slice(0, 400)}{c.body.length > 400 ? '...' : ''}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Generate reply from inspect */}
                <div style={S.panel}>
                  <div style={S.panelTitle}>✍ Write Your Reply</div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <select style={{ ...S.input, flex: 1 }} value={tones['inspect'] || 'helpful'} onChange={e => setTones(x => ({ ...x, inspect: e.target.value }))}>
                      <option value="helpful">Helpful / Educational</option>
                      <option value="casual">Casual / Conversational</option>
                      <option value="expert">Expert / Authoritative</option>
                      <option value="curious">Curious / Questioning</option>
                      <option value="witty">Witty / Light</option>
                    </select>
                    <button style={{ ...S.btn, opacity: generating['inspect'] ? 0.5 : 1 }}
                      disabled={generating['inspect']}
                      onClick={async () => {
                        setGenerating(g => ({ ...g, inspect: true }))
                        try {
                          const res = await fetch('/api/generate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ post: inspectResult.post, tone: tones['inspect'] || 'helpful', productContext, customContext: customCtx['inspect'] || '' }),
                          })
                          const data = await res.json()
                          if (data.error) throw new Error(data.error)
                          setReplies(r => ({ ...r, inspect: data.reply }))
                          showToast('Reply generated', 'success')
                        } catch (e) { showToast(e instanceof Error ? e.message : 'Failed', 'error') }
                        finally { setGenerating(g => ({ ...g, inspect: false })) }
                      }}>
                      {generating['inspect'] ? '...' : '✨ Generate'}
                    </button>
                  </div>
                  <textarea
                    style={{ ...S.input, minHeight: 120, resize: 'vertical', lineHeight: 1.6 }}
                    value={replies['inspect'] || ''}
                    onChange={e => setReplies(r => ({ ...r, inspect: e.target.value }))}
                    placeholder="Generated reply appears here..."
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                    <button style={S.btnGhost} onClick={() => copyText(replies['inspect'] || '')}>📋 Copy</button>
                    <a href={`https://reddit.com${inspectResult.post.permalink}`} target="_blank" rel="noopener noreferrer" style={{ ...S.btn, textDecoration: 'none', display: 'inline-block' }}>Post on Reddit ↗</a>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, background: '#ffffff',
          border: `1px solid ${toast.type === 'success' ? '#16a34a' : toast.type === 'error' ? '#ff4500' : '#e0e0e0'}`,
          borderRadius: 10, padding: '14px 22px', fontSize: 15,
          color: toast.type === 'success' ? '#16a34a' : toast.type === 'error' ? '#e03d00' : '#1a1a1a',
          zIndex: 9999, fontFamily: 'IBM Plex Mono, monospace',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        }}>
          {toast.msg}
        </div>
      )}
    </>
  )
}

/* ─── POST CARD ─────────────────────────────────────────────────────── */
function PostCard({
  post, reply, isGenerating, tone, ctx, showCtxPanel, replyOpen,
  onToneChange, onCtxChange, onToggleCtx, onToggleReply,
  onGenerate, onReplyChange, onCopy,
}: {
  post: RedditPost
  reply: string
  isGenerating: boolean
  tone: string
  ctx: string
  showCtxPanel: boolean
  replyOpen: boolean
  onToneChange: (t: string) => void
  onCtxChange: (t: string) => void
  onToggleCtx: () => void
  onToggleReply: () => void
  onGenerate: () => void
  onReplyChange: (t: string) => void
  onCopy: () => void
}) {
  const S2: Record<string, React.CSSProperties> = {
    card: { background: '#ffffff', border: '1px solid #e0e0e0', borderRadius: 14, marginBottom: 16, overflow: 'hidden' },
    cardHeader: { padding: '18px 22px 14px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
    subBadge: { fontSize: 13, fontWeight: 600, color: '#ff4500', background: 'rgba(255,69,0,0.08)', border: '1px solid rgba(255,69,0,0.2)', borderRadius: 6, padding: '3px 10px' },
  }
  const redditUrl = `https://reddit.com${post.permalink}`

  return (
    <div style={S2.card}>
      <div style={S2.cardHeader}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 8 }}>
            <span style={S2.subBadge}>r/{post.subreddit}</span>
            <span style={{ fontSize: 13, color: '#999' }}>{timeAgo(post.created_utc)}</span>
            <span style={{ fontSize: 13, color: '#888' }}>▲ {post.score} · 💬 {post.num_comments}</span>
            {post.link_flair_text && <span style={{ fontSize: 13, color: '#888', background: '#f0f0f0', border: '1px solid #e0e0e0', borderRadius: 4, padding: '2px 8px' }}>{post.link_flair_text}</span>}
          </div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 600, lineHeight: 1.4, color: '#1a1a1a' }}>{post.title}</div>
          {post.selftext && (
            <div style={{ fontSize: 14, color: '#666', marginTop: 8, lineHeight: 1.6 }}>
              {post.selftext.slice(0, 200)}{post.selftext.length > 200 ? '...' : ''}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <a href={redditUrl} target="_blank" rel="noopener noreferrer" style={{ background: 'transparent', border: '1px solid #e0e0e0', color: '#888', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '8px 14px', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}>↗</a>
          <button onClick={onToggleReply} style={{ background: replyOpen ? '#ff4500' : 'transparent', border: '1px solid ' + (replyOpen ? '#ff4500' : '#e0e0e0'), color: replyOpen ? '#fff' : '#888', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '8px 16px', cursor: 'pointer' }}>
            {replyOpen ? 'Close' : 'Reply'}
          </button>
        </div>
      </div>

      {replyOpen && (
        <div style={{ padding: '18px 22px', borderTop: '1px solid #e0e0e0' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <select value={tone} onChange={e => onToneChange(e.target.value)} style={{ flex: 1, background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 10, color: '#1a1a1a', fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '10px 14px', outline: 'none' }}>
              <option value="helpful">Helpful / Educational</option>
              <option value="casual">Casual / Conversational</option>
              <option value="expert">Expert / Authoritative</option>
              <option value="curious">Curious / Questioning</option>
              <option value="witty">Witty / Light</option>
            </select>
            <button onClick={onGenerate} disabled={isGenerating} style={{ background: '#ff4500', border: 'none', borderRadius: 10, color: '#fff', fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, fontWeight: 600, padding: '10px 20px', cursor: isGenerating ? 'not-allowed' : 'pointer', opacity: isGenerating ? 0.5 : 1 }}>
              {isGenerating ? 'Generating...' : '✨ Generate'}
            </button>
          </div>

          <button onClick={onToggleCtx} style={{ background: 'none', border: 'none', color: '#999', fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: showCtxPanel ? 10 : 14, textDecoration: 'underline' }}>
            {showCtxPanel ? '− hide' : '+ custom context'}
          </button>

          {showCtxPanel && (
            <textarea value={ctx} onChange={e => onCtxChange(e.target.value)} placeholder="Extra context for AI (e.g. mention dight.pro if relevant)..." style={{ width: '100%', background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 10, color: '#1a1a1a', fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '12px 14px', outline: 'none', minHeight: 70, resize: 'vertical' as const, marginBottom: 12 }} />
          )}

          <textarea value={reply} onChange={e => onReplyChange(e.target.value)} placeholder="Generated reply appears here..." style={{ width: '100%', background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 10, color: '#1a1a1a', fontFamily: 'IBM Plex Mono, monospace', fontSize: 15, padding: '12px 14px', outline: 'none', minHeight: 110, resize: 'vertical' as const, lineHeight: 1.7 }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <span style={{ fontSize: 13, color: '#999' }}>{reply.length} chars</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onCopy} style={{ background: 'transparent', border: '1px solid #e0e0e0', color: '#888', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '8px 16px', cursor: 'pointer' }}>📋 Copy</button>
              <a href={redditUrl} target="_blank" rel="noopener noreferrer" style={{ background: '#ff4500', border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, fontWeight: 600, padding: '8px 16px', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}>Post on Reddit ↗</a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
