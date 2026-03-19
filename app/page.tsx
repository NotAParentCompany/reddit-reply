'use client'

import { useState, useRef, useEffect } from 'react'

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

interface ProductInfo {
  name: string
  url: string
  description: string
  features: string
}

interface KeywordPack {
  name: string
  keywords: string[]
}

type Tab = 'search' | 'inspect' | 'product' | 'prompt'

/* ─── KEYWORD PACKS ─────────────────────────────────────────────────── */
const DEFAULT_KEYWORD_PACKS: KeywordPack[] = [
  { name: '🔥 Quick Start', keywords: ['find clients', 'no clients', 'lead generation', 'cold outreach', 'freelance clients'] },
  { name: '🎯 Intent', keywords: ['find clients', 'get clients', 'lead generation', 'finding clients', 'how to find clients', 'client outreach', 'cold outreach', 'prospecting', 'getting clients', 'new clients'] },
  { name: '😤 Pain', keywords: ['no clients', 'struggling to find clients', 'slow month', 'dry pipeline', 'need more clients', 'lost a client', 'client churn', 'not enough work'] },
  { name: '🏷 Niche', keywords: ['web design clients', 'freelance clients', 'SMMA clients', 'marketing agency clients', 'SEO clients', 'social media clients'] },
  { name: '🔧 Tools', keywords: ['Apollo alternative', 'lead gen tool', 'Clay alternative', 'LinkedIn outreach', 'cold email tool', 'prospect finder'] },
]

/* ─── DEFAULT PROMPT ─────────────────────────────────────────────────── */
const DEFAULT_PROMPT = `You are a Reddit user replying to this post.

POST TITLE: {{post_title}}
POST BODY: {{post_body}}
SUBREDDIT: r/{{subreddit}}

YOUR IDENTITY: {{identity}}
TONE: {{tone_instruction}}
LENGTH: {{length_instruction}}
{{product_block}}
{{custom_context}}

TONE MATCHING: Study the subreddit's vibe and how the post is written. If the OP uses casual slang, lowercase, or abbreviations — mirror that slightly. If it's a serious/technical sub, match that energy. Blend your tone with the thread's natural voice so your reply feels native to the conversation.

Write a Reddit reply that:
- Sounds like a real human, not AI or a salesperson
- Adds genuine value — don't be generic
- Strictly follows the LENGTH instruction above
- Subtly matches the writing style & energy of the thread (slang, formality, humor level)
- Fits Reddit culture: no hype, no corporate speak, no hashtags
- No preamble, no "Great question!", just the reply text

Output the reply text only.`

/* ─── LOCALSTORAGE HELPERS ──────────────────────────────────────────── */
function loadLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}
function saveLocal(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

/* ─── HELPERS ───────────────────────────────────────────────────────── */
function timeAgo(unix: number) {
  const sec = Math.floor(Date.now() / 1000 - unix)
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

/* ─── STYLES (CSS-in-JS object) ─────────────────────────────────────── */
const S: Record<string, React.CSSProperties> = {
  app: { maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px', position: 'relative', zIndex: 1 },
  gridBg: {
    position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
    backgroundImage: 'linear-gradient(rgba(255,69,0,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,69,0,0.04) 1px,transparent 1px)',
    backgroundSize: '40px 40px',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '32px 0 32px', borderBottom: '1px solid #e0e0e0', marginBottom: 32 },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoIcon: { width: 38, height: 38, background: '#ff4500', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 17, color: '#fff' },
  logoText: { fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 22, letterSpacing: -0.5 },
  headerTag: { fontSize: 13, color: '#999', letterSpacing: 2, textTransform: 'uppercase' as const },
  panel: { background: '#ffffff', border: '1px solid #e0e0e0', borderRadius: 14, padding: 28, marginBottom: 22 },
  panelTitle: { fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' as const, color: '#999', marginBottom: 18 },
  label: { display: 'block', fontSize: 13, color: '#888', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 8 },
  input: { width: '100%', background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 10, color: '#1a1a1a', fontFamily: 'IBM Plex Mono, monospace', fontSize: 15, padding: '12px 14px', outline: 'none' },
  tabs: { display: 'flex', gap: 0, background: '#ffffff', border: '1px solid #e0e0e0', borderRadius: 12, padding: 5, marginBottom: 22, width: 'fit-content' },
  tabBtn: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, fontWeight: 600, padding: '10px 24px', border: 'none', borderRadius: 9, cursor: 'pointer', letterSpacing: 0.5, transition: 'all 0.15s' },
  btn: { background: '#ff4500', border: 'none', borderRadius: 10, color: '#fff', fontFamily: 'IBM Plex Mono, monospace', fontSize: 15, fontWeight: 600, padding: '12px 24px', cursor: 'pointer', whiteSpace: 'nowrap' as const, letterSpacing: 0.5, transition: 'background 0.15s' },
  btnGhost: { background: 'transparent', border: '1px solid #e0e0e0', color: '#888', borderRadius: 10, fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '9px 16px', cursor: 'pointer' },
  btnSm: { padding: '9px 16px', fontSize: 14 },
  statusBar: { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', background: '#ffffff', border: '1px solid #e0e0e0', borderRadius: 10, marginBottom: 22, fontSize: 14, color: '#888' },
  tag: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,69,0,0.08)', border: '1px solid rgba(255,69,0,0.25)', borderRadius: 6, padding: '5px 12px', fontSize: 14, color: '#e03d00' },
  card: { background: '#ffffff', border: '1px solid #e0e0e0', borderRadius: 14, marginBottom: 16, overflow: 'hidden' },
  cardHeader: { padding: '18px 22px 14px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  subBadge: { fontSize: 13, fontWeight: 600, color: '#ff4500', background: 'rgba(255,69,0,0.08)', border: '1px solid rgba(255,69,0,0.2)', borderRadius: 6, padding: '3px 10px' },
  postTitle: { fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 600, lineHeight: 1.4, marginTop: 6, color: '#1a1a1a' },
  analysisBox: { background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 10, padding: 18, fontSize: 14, lineHeight: 1.9, color: '#444', whiteSpace: 'pre-wrap' as const },
  divider: { height: 1, background: '#e0e0e0', margin: '18px 0' },
  lengthBar: { display: 'flex', gap: 0, background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 10, padding: 3, overflow: 'hidden' },
  lengthPill: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, fontWeight: 600, padding: '7px 14px', border: 'none', cursor: 'pointer', borderRadius: 8, transition: 'all 0.15s', whiteSpace: 'nowrap' as const },
  packBar: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 12 },
  packBtn: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, fontWeight: 600, padding: '6px 14px', border: '1px solid #e0e0e0', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: '#888', transition: 'all 0.15s' },
  packBtnActive: { background: 'rgba(255,69,0,0.08)', border: '1px solid rgba(255,69,0,0.3)', color: '#e03d00' },
}

const LENGTH_OPTIONS = [
  { value: 'very-very-short', label: '🔥 Tiny' },
  { value: 'very-short', label: '⚡ V.Short' },
  { value: 'short', label: '📝 Short' },
  { value: 'long', label: '📖 Long' },
]

/* ─── MAIN COMPONENT ─────────────────────────────────────────────────── */
export default function Page() {
  const [tab, setTab] = useState<Tab>('search')
  const [keywords, setKeywords] = useState<string[]>([])
  const [kwInput, setKwInput] = useState('')
  const [subreddits, setSubreddits] = useState('')
  const [sort, setSort] = useState('new')
  const [limit, setLimit] = useState('25')
  const [posts, setPosts] = useState<RedditPost[]>([])
  const [searching, setSearching] = useState(false)
  const [status, setStatus] = useState<{ state: 'idle' | 'active' | 'loading'; text: string }>({ state: 'idle', text: 'Ready.' })
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [tones, setTones] = useState<Record<string, string>>({})
  const [lengths, setLengths] = useState<Record<string, string>>({})
  const [customCtx, setCustomCtx] = useState<Record<string, string>>({})
  const [showCtx, setShowCtx] = useState<Record<string, boolean>>({})
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({})
  const [inspectUrl, setInspectUrl] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null)
  const [productInfo, setProductInfo] = useState<ProductInfo>({ name: '', url: '', description: '', features: '' })
  const [productSaved, setProductSaved] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT)
  const [keywordPacks, setKeywordPacks] = useState<KeywordPack[]>(DEFAULT_KEYWORD_PACKS)
  const [promptSaved, setPromptSaved] = useState(true)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hydrated = useRef(false)

  // ── Load persisted state on mount ──
  useEffect(() => {
    setKeywords(loadLocal<string[]>('rr_keywords', []))
    setSubreddits(loadLocal<string>('rr_subreddits', ''))
    setSystemPrompt(loadLocal<string>('rr_system_prompt', DEFAULT_PROMPT))
    setKeywordPacks(loadLocal<KeywordPack[]>('rr_keyword_packs', DEFAULT_KEYWORD_PACKS))
    const savedProduct = loadLocal<ProductInfo | null>('rr_product_info', null)
    if (savedProduct && savedProduct.name) {
      setProductInfo(savedProduct)
      setProductSaved(true)
    }
    hydrated.current = true
  }, [])

  // ── Auto-save keywords, subreddits, prompt to localStorage ──
  useEffect(() => { if (hydrated.current) saveLocal('rr_keywords', keywords) }, [keywords])
  useEffect(() => { if (hydrated.current) saveLocal('rr_subreddits', subreddits) }, [subreddits])
  useEffect(() => { if (hydrated.current) saveLocal('rr_system_prompt', systemPrompt) }, [systemPrompt])
  useEffect(() => { if (hydrated.current) saveLocal('rr_keyword_packs', keywordPacks) }, [keywordPacks])

  function showToast(msg: string, type = '') {
    setToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  function addKeyword() {
    if (!kwInput.trim()) return
    const news = kwInput.split(',').map(k => k.trim()).filter(k => k && !keywords.includes(k))
    setKeywords([...keywords, ...news])
    setKwInput('')
  }

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
    } finally { setSearching(false) }
  }

  async function generateReply(postId: string, post: { title: string; selftext: string; subreddit: string }) {
    setGenerating(g => ({ ...g, [postId]: true }))
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post,
          tone: tones[postId] || 'helpful',
          length: lengths[postId] || 'short',
          productContext: productSaved ? `${productInfo.name} — ${productInfo.description}` : '',
          customContext: customCtx[postId] || '',
          productInfo: productSaved ? productInfo : undefined,
          systemPrompt: systemPrompt !== DEFAULT_PROMPT ? systemPrompt : undefined,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setReplies(r => ({ ...r, [postId]: data.reply }))
      showToast('Reply generated', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Generation failed', 'error')
    } finally { setGenerating(g => ({ ...g, [postId]: false })) }
  }

  function inspectPost(post: RedditPost) {
    const url = `https://reddit.com${post.permalink}`
    setInspectUrl(url)
    setInspectResult(null)
    setTab('inspect')
    setTimeout(() => runInspectWithUrl(url), 100)
  }

  async function runInspect() {
    if (!inspectUrl.trim()) { showToast('Paste a Reddit URL', 'error'); return }
    await runInspectWithUrl(inspectUrl.trim())
  }

  async function runInspectWithUrl(url: string) {
    setInspecting(true)
    setInspectResult(null)
    try {
      const res = await fetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setInspectResult(data)
      showToast('Thread analyzed', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Inspection failed', 'error')
    } finally { setInspecting(false) }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text)
    showToast('Copied!', 'success')
  }

  const dotColor = status.state === 'active' ? '#16a34a' : status.state === 'loading' ? '#ff4500' : '#ccc'

  const tabLabels: { key: Tab; label: string }[] = [
    { key: 'search', label: '🔍 Search' },
    { key: 'inspect', label: '🔗 Inspect' },
    { key: 'product', label: '📦 Product' },
    { key: 'prompt', label: '🧠 Prompt' },
  ]

  return (
    <>
      <div style={S.gridBg} />
      <div style={S.app}>
        <header style={S.header}>
          <div style={S.logo}>
            <div style={S.logoIcon}>d</div>
            <div style={S.logoText}>
              <span style={{ color: '#1a1a1a' }}>dight</span>
              <span style={{ color: '#ff4500' }}>.pro</span>
              <span style={{ color: '#999' }}> // reddit</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {productSaved && (
              <span style={{ fontSize: 12, color: '#16a34a', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 6, padding: '4px 10px', fontFamily: 'IBM Plex Mono, monospace' }}>
                📦 {productInfo.name}
              </span>
            )}
            <div style={S.headerTag}>Reply Engine</div>
          </div>
        </header>

        <div style={S.tabs}>
          {tabLabels.map(t => (
            <button key={t.key} style={{ ...S.tabBtn, background: tab === t.key ? '#ff4500' : 'transparent', color: tab === t.key ? '#fff' : '#999' }} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── PRODUCT TAB ── */}
        {tab === 'product' && (
          <div style={S.panel}>
            <div style={S.panelTitle}>📦 Your Product Details</div>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 20, lineHeight: 1.6 }}>
              Fill in your product info. When saved, AI will casually pitch your product in replies where it{"'"}s genuinely relevant — like a real user recommending a tool they love.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={S.label}>Product Name</label>
                <input style={S.input} value={productInfo.name} onChange={e => setProductInfo(p => ({ ...p, name: e.target.value }))} placeholder="e.g. dight.pro" />
              </div>
              <div>
                <label style={S.label}>Product URL</label>
                <input style={S.input} value={productInfo.url} onChange={e => setProductInfo(p => ({ ...p, url: e.target.value }))} placeholder="e.g. https://dight.pro" />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>What does it do? (1-2 sentences)</label>
              <textarea
                style={{ ...S.input, minHeight: 80, resize: 'vertical' as const, lineHeight: 1.6 }}
                value={productInfo.description}
                onChange={e => setProductInfo(p => ({ ...p, description: e.target.value }))}
                placeholder="e.g. AI-powered lead scoring tool that helps freelancers identify their best potential clients from social signals."
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={S.label}>Key Features (one per line or comma-separated)</label>
              <textarea
                style={{ ...S.input, minHeight: 100, resize: 'vertical' as const, lineHeight: 1.6 }}
                value={productInfo.features}
                onChange={e => setProductInfo(p => ({ ...p, features: e.target.value }))}
                placeholder={"e.g.\nAuto-scores leads from Reddit, Twitter, LinkedIn\nAI-generated outreach drafts\nIntegrates with your CRM\nFree tier available"}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button style={{ ...S.btn, opacity: productInfo.name.trim() ? 1 : 0.5 }} disabled={!productInfo.name.trim()} onClick={() => { setProductSaved(true); saveLocal('rr_product_info', productInfo); showToast(`Product "${productInfo.name}" saved — AI will use it in replies`, 'success') }}>
                💾 Save Product
              </button>
              {productSaved && (
                <button style={S.btnGhost} onClick={() => { setProductSaved(false); saveLocal('rr_product_info', null); showToast('Product removed from replies', '') }}>
                  🗑 Clear
                </button>
              )}
              {productSaved && <span style={{ fontSize: 13, color: '#16a34a' }}>✓ Active — AI will pitch casually when relevant</span>}
            </div>
          </div>
        )}

        {/* ── SEARCH TAB ── */}
        {tab === 'search' && (
          <>
            <div style={S.panel}>
              {/* ── Keyword Packs ── */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...S.label, marginBottom: 10 }}>Keyword Packs</label>
                <div style={S.packBar}>
                  {keywordPacks.map((pack, i) => (
                    <button
                      key={i}
                      style={{ ...S.packBtn, ...(JSON.stringify(keywords) === JSON.stringify(pack.keywords) ? S.packBtnActive : {}) }}
                      onClick={() => { setKeywords(pack.keywords); showToast(`Loaded "${pack.name}" pack`, 'success') }}
                      title={pack.keywords.join(', ')}
                    >
                      {pack.name} ({pack.keywords.length})
                    </button>
                  ))}
                </div>
              </div>
              <div style={S.divider} />
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' as const, marginTop: 16 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={S.label}>Keywords</label>
                  <input style={S.input} value={kwInput} onChange={e => setKwInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKeyword()} placeholder="lead generation, find clients, outreach..." />
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
            <div style={S.statusBar}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: status.state !== 'idle' ? `0 0 8px ${dotColor}` : 'none' }} />
              <span>{status.text}</span>
            </div>
            {posts.length === 0 && !searching && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>🔍</div>
                <p style={{ fontSize: 16, lineHeight: 1.7 }}>Search Reddit by keyword to find posts worth replying to.</p>
              </div>
            )}
            {posts.map(post => (
              <PostCard
                key={post.id} post={post} reply={replies[post.id] || ''} isGenerating={!!generating[post.id]}
                tone={tones[post.id] || 'helpful'} length={lengths[post.id] || 'short'}
                ctx={customCtx[post.id] || ''} showCtxPanel={!!showCtx[post.id]} replyOpen={!!openReplies[post.id]}
                onToneChange={t => setTones(x => ({ ...x, [post.id]: t }))}
                onLengthChange={l => setLengths(x => ({ ...x, [post.id]: l }))}
                onCtxChange={t => setCustomCtx(x => ({ ...x, [post.id]: t }))}
                onToggleCtx={() => setShowCtx(x => ({ ...x, [post.id]: !x[post.id] }))}
                onToggleReply={() => setOpenReplies(x => ({ ...x, [post.id]: !x[post.id] }))}
                onGenerate={() => generateReply(post.id, { title: post.title, selftext: post.selftext, subreddit: post.subreddit })}
                onReplyChange={t => setReplies(x => ({ ...x, [post.id]: t }))}
                onCopy={() => copyText(replies[post.id] || '')}
                onInspect={() => inspectPost(post)}
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
                <div style={S.panel}>
                  <div style={S.panelTitle}>✨ AI Analysis</div>
                  <div style={S.analysisBox}>{inspectResult.analysis}</div>
                </div>
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
                <div style={S.panel}>
                  <div style={S.panelTitle}>✍ Write Your Reply</div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                    <select style={{ ...S.input, flex: 1, minWidth: 160 }} value={tones['inspect'] || 'helpful'} onChange={e => setTones(x => ({ ...x, inspect: e.target.value }))}>
                      <option value="helpful">Helpful / Educational</option>
                      <option value="casual">Casual / Conversational</option>
                      <option value="expert">Expert / Authoritative</option>
                      <option value="curious">Curious / Questioning</option>
                      <option value="witty">Witty / Light</option>
                    </select>
                    <div style={S.lengthBar}>
                      {LENGTH_OPTIONS.map(lo => (
                        <button key={lo.value} style={{ ...S.lengthPill, background: (lengths['inspect'] || 'short') === lo.value ? '#ff4500' : 'transparent', color: (lengths['inspect'] || 'short') === lo.value ? '#fff' : '#888' }} onClick={() => setLengths(x => ({ ...x, inspect: lo.value }))}>
                          {lo.label}
                        </button>
                      ))}
                    </div>
                    <button style={{ ...S.btn, opacity: generating['inspect'] ? 0.5 : 1 }} disabled={generating['inspect']} onClick={() => generateReply('inspect', inspectResult.post)}>
                      {generating['inspect'] ? '...' : '✨ Generate'}
                    </button>
                  </div>
                  <textarea style={{ ...S.input, minHeight: 120, resize: 'vertical', lineHeight: 1.6 }} value={replies['inspect'] || ''} onChange={e => setReplies(r => ({ ...r, inspect: e.target.value }))} placeholder="Generated reply appears here..." />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                    <button style={S.btnGhost} onClick={() => copyText(replies['inspect'] || '')}>📋 Copy</button>
                    <a href={`https://reddit.com${inspectResult.post.permalink}`} target="_blank" rel="noopener noreferrer" style={{ ...S.btn, textDecoration: 'none', display: 'inline-block' }}>Post on Reddit ↗</a>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── PROMPT TAB ── */}
        {tab === 'prompt' && (
          <>
            <div style={S.panel}>
              <div style={S.panelTitle}>🧠 AI System Prompt</div>
              <p style={{ fontSize: 14, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
                Customize the system prompt that drives reply generation. Use these placeholders — they{"'"}ll be replaced at generation time:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginBottom: 18 }}>
                {['{{post_title}}', '{{post_body}}', '{{subreddit}}', '{{identity}}', '{{tone_instruction}}', '{{length_instruction}}', '{{product_block}}', '{{custom_context}}'].map(p => (
                  <code key={p} style={{ fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', background: 'rgba(255,69,0,0.06)', border: '1px solid rgba(255,69,0,0.2)', borderRadius: 5, padding: '3px 8px', color: '#e03d00' }}>{p}</code>
                ))}
              </div>
              <textarea
                style={{ ...S.input, minHeight: 360, resize: 'vertical' as const, lineHeight: 1.7, fontSize: 14 }}
                value={systemPrompt}
                onChange={e => { setSystemPrompt(e.target.value); setPromptSaved(false) }}
                spellCheck={false}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button style={S.btn} onClick={() => { saveLocal('rr_system_prompt', systemPrompt); setPromptSaved(true); showToast('Prompt saved', 'success') }}>
                    💾 Save Prompt
                  </button>
                  <button style={S.btnGhost} onClick={() => { setSystemPrompt(DEFAULT_PROMPT); setPromptSaved(false); showToast('Reset to default prompt', '') }}>
                    ↩ Reset Default
                  </button>
                </div>
                {promptSaved && <span style={{ fontSize: 13, color: '#16a34a' }}>✓ Saved</span>}
                {!promptSaved && <span style={{ fontSize: 13, color: '#ff4500' }}>● Unsaved changes</span>}
              </div>
            </div>

            <div style={S.panel}>
              <div style={S.panelTitle}>📦 Keyword Packs Manager</div>
              <p style={{ fontSize: 14, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
                Manage reusable keyword packs. Click a pack name in the Search tab to instantly load it.
              </p>
              {keywordPacks.map((pack, i) => (
                <div key={i} style={{ padding: '14px 0', borderBottom: i < keywordPacks.length - 1 ? '1px solid #e0e0e0' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <input
                      style={{ ...S.input, width: 200, fontWeight: 600, fontSize: 14 }}
                      value={pack.name}
                      onChange={e => { const p = [...keywordPacks]; p[i] = { ...p[i], name: e.target.value }; setKeywordPacks(p) }}
                    />
                    <button style={{ ...S.btnGhost, color: '#e03d00', borderColor: 'rgba(255,69,0,0.3)', fontSize: 13 }} onClick={() => { const p = keywordPacks.filter((_, j) => j !== i); setKeywordPacks(p); showToast('Pack deleted', '') }}>
                      🗑 Delete
                    </button>
                  </div>
                  <textarea
                    style={{ ...S.input, minHeight: 50, resize: 'vertical' as const, fontSize: 13, lineHeight: 1.6 }}
                    value={pack.keywords.join(', ')}
                    onChange={e => { const p = [...keywordPacks]; p[i] = { ...p[i], keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) }; setKeywordPacks(p) }}
                  />
                </div>
              ))}
              <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                <button style={S.btnGhost} onClick={() => setKeywordPacks([...keywordPacks, { name: '📌 New Pack', keywords: [] }])}>
                  + Add Pack
                </button>
                {keywords.length > 0 && (
                  <button style={S.btnGhost} onClick={() => { setKeywordPacks([...keywordPacks, { name: `💾 Saved (${new Date().toLocaleDateString()})`, keywords: [...keywords] }]); showToast('Current keywords saved as pack', 'success') }}>
                    💾 Save Current Keywords as Pack
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, background: '#ffffff',
          border: `1px solid ${toast.type === 'success' ? '#16a34a' : toast.type === 'error' ? '#ff4500' : '#e0e0e0'}`,
          borderRadius: 10, padding: '14px 22px', fontSize: 15,
          color: toast.type === 'success' ? '#16a34a' : toast.type === 'error' ? '#e03d00' : '#1a1a1a',
          zIndex: 9999, fontFamily: 'IBM Plex Mono, monospace', boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        }}>
          {toast.msg}
        </div>
      )}
    </>
  )
}

/* ─── POST CARD ─────────────────────────────────────────────────────── */
function PostCard({
  post, reply, isGenerating, tone, length, ctx, showCtxPanel, replyOpen,
  onToneChange, onLengthChange, onCtxChange, onToggleCtx, onToggleReply,
  onGenerate, onReplyChange, onCopy, onInspect,
}: {
  post: RedditPost; reply: string; isGenerating: boolean; tone: string; length: string
  ctx: string; showCtxPanel: boolean; replyOpen: boolean
  onToneChange: (t: string) => void; onLengthChange: (l: string) => void
  onCtxChange: (t: string) => void; onToggleCtx: () => void; onToggleReply: () => void
  onGenerate: () => void; onReplyChange: (t: string) => void; onCopy: () => void; onInspect: () => void
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
          <button onClick={onInspect} title="Inspect this thread" style={{ background: 'transparent', border: '1px solid #e0e0e0', color: '#888', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '8px 14px', cursor: 'pointer' }}>🔍</button>
          <a href={redditUrl} target="_blank" rel="noopener noreferrer" style={{ background: 'transparent', border: '1px solid #e0e0e0', color: '#888', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '8px 14px', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}>↗</a>
          <button onClick={onToggleReply} style={{ background: replyOpen ? '#ff4500' : 'transparent', border: '1px solid ' + (replyOpen ? '#ff4500' : '#e0e0e0'), color: replyOpen ? '#fff' : '#888', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '8px 16px', cursor: 'pointer' }}>
            {replyOpen ? 'Close' : 'Reply'}
          </button>
        </div>
      </div>

      {replyOpen && (
        <div style={{ padding: '18px 22px', borderTop: '1px solid #e0e0e0' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            <select value={tone} onChange={e => onToneChange(e.target.value)} style={{ flex: 1, minWidth: 160, background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 10, color: '#1a1a1a', fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '10px 14px', outline: 'none' }}>
              <option value="helpful">Helpful / Educational</option>
              <option value="casual">Casual / Conversational</option>
              <option value="expert">Expert / Authoritative</option>
              <option value="curious">Curious / Questioning</option>
              <option value="witty">Witty / Light</option>
            </select>
            <div style={S.lengthBar}>
              {LENGTH_OPTIONS.map(lo => (
                <button key={lo.value} style={{ ...S.lengthPill, background: length === lo.value ? '#ff4500' : 'transparent', color: length === lo.value ? '#fff' : '#888' }} onClick={() => onLengthChange(lo.value)}>
                  {lo.label}
                </button>
              ))}
            </div>
            <button onClick={onGenerate} disabled={isGenerating} style={{ background: '#ff4500', border: 'none', borderRadius: 10, color: '#fff', fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, fontWeight: 600, padding: '10px 20px', cursor: isGenerating ? 'not-allowed' : 'pointer', opacity: isGenerating ? 0.5 : 1 }}>
              {isGenerating ? 'Generating...' : '✨ Generate'}
            </button>
          </div>
          <button onClick={onToggleCtx} style={{ background: 'none', border: 'none', color: '#999', fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: showCtxPanel ? 10 : 14, textDecoration: 'underline' }}>
            {showCtxPanel ? '− hide' : '+ custom context'}
          </button>
          {showCtxPanel && (
            <textarea value={ctx} onChange={e => onCtxChange(e.target.value)} placeholder="Extra context for AI..." style={{ width: '100%', background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 10, color: '#1a1a1a', fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, padding: '12px 14px', outline: 'none', minHeight: 70, resize: 'vertical' as const, marginBottom: 12 }} />
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
