-- ============================================================================
-- REDDIT REPLY ENGINE — SUPABASE SCHEMA + SEED DATA
-- Full activity logging: searches, posts, replies, inspections, product changes
-- Includes keyword packs, system prompts, subreddit history
-- ============================================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ─── SESSIONS ───────────────────────────────────────────────────────────────
create table sessions (
  id            uuid primary key default uuid_generate_v4(),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  user_agent    text,
  ip_address    inet,
  metadata      jsonb default '{}'::jsonb
);

-- ─── PRODUCT CONFIG ─────────────────────────────────────────────────────────
create table product_configs (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid references sessions(id) on delete set null,
  action        text not null check (action in ('save', 'clear', 'update')),
  product_name  text,
  product_url   text,
  description   text,
  features      text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index idx_product_configs_session on product_configs(session_id);
create index idx_product_configs_created on product_configs(created_at desc);

-- ─── SYSTEM PROMPTS ─────────────────────────────────────────────────────────
create table system_prompts (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid references sessions(id) on delete set null,
  prompt_text   text not null,
  is_default    boolean not null default false,
  label         text,
  created_at    timestamptz not null default now()
);

create index idx_system_prompts_session on system_prompts(session_id);
create index idx_system_prompts_created on system_prompts(created_at desc);

-- ─── KEYWORD PACKS ──────────────────────────────────────────────────────────
create table keyword_packs (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid references sessions(id) on delete set null,
  name          text not null,
  keywords      text[] not null,
  pack_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_keyword_packs_session on keyword_packs(session_id);
create index idx_keyword_packs_order on keyword_packs(pack_order);

-- ─── SUBREDDIT HISTORY ──────────────────────────────────────────────────────
create table subreddit_history (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid references sessions(id) on delete set null,
  subreddits    text[] not null,
  raw_input     text not null,
  used_at       timestamptz not null default now()
);

create index idx_subreddit_history_session on subreddit_history(session_id);
create index idx_subreddit_history_used on subreddit_history(used_at desc);

-- ─── KEYWORD HISTORY ────────────────────────────────────────────────────────
create table keyword_history (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid references sessions(id) on delete set null,
  keywords      text[] not null,
  source_pack   uuid references keyword_packs(id) on delete set null,
  used_at       timestamptz not null default now()
);

create index idx_keyword_history_session on keyword_history(session_id);
create index idx_keyword_history_used on keyword_history(used_at desc);

-- ─── SEARCHES ───────────────────────────────────────────────────────────────
create table searches (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid references sessions(id) on delete set null,
  keywords      text[] not null,
  subreddits    text[] default '{}',
  sort_by       text not null default 'new',
  result_limit  int not null default 25,
  results_count int,
  status        text not null default 'pending' check (status in ('pending', 'success', 'error')),
  error_message text,
  duration_ms   int,
  created_at    timestamptz not null default now()
);

create index idx_searches_session on searches(session_id);
create index idx_searches_created on searches(created_at desc);
create index idx_searches_keywords on searches using gin(keywords);

-- ─── REDDIT POSTS ───────────────────────────────────────────────────────────
create table reddit_posts (
  id              uuid primary key default uuid_generate_v4(),
  reddit_id       text not null,
  title           text not null,
  selftext        text,
  subreddit       text not null,
  author          text,
  score           int,
  num_comments    int,
  permalink       text not null,
  url             text,
  flair           text,
  created_utc     timestamptz,
  source          text not null check (source in ('search', 'inspect')),
  search_id       uuid references searches(id) on delete set null,
  first_seen_at   timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  
  constraint uq_reddit_posts_reddit_id unique (reddit_id)
);

create index idx_reddit_posts_reddit_id on reddit_posts(reddit_id);
create index idx_reddit_posts_subreddit on reddit_posts(subreddit);
create index idx_reddit_posts_search on reddit_posts(search_id);
create index idx_reddit_posts_created on reddit_posts(first_seen_at desc);

-- ─── INSPECTIONS ────────────────────────────────────────────────────────────
create table inspections (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid references sessions(id) on delete set null,
  reddit_post_id  uuid references reddit_posts(id) on delete set null,
  input_url       text not null,
  ai_analysis     text,
  comments_count  int,
  top_comments    jsonb default '[]'::jsonb,
  status          text not null default 'pending' check (status in ('pending', 'success', 'error')),
  error_message   text,
  duration_ms     int,
  created_at      timestamptz not null default now()
);

create index idx_inspections_session on inspections(session_id);
create index idx_inspections_post on inspections(reddit_post_id);
create index idx_inspections_created on inspections(created_at desc);

-- ─── GENERATED REPLIES ──────────────────────────────────────────────────────
create table generated_replies (
  id                  uuid primary key default uuid_generate_v4(),
  session_id          uuid references sessions(id) on delete set null,
  reddit_post_id      uuid references reddit_posts(id) on delete set null,
  inspection_id       uuid references inspections(id) on delete set null,
  
  tone                text not null default 'helpful',
  length_option       text not null default 'short',
  product_context     text,
  custom_context      text,
  product_config_id   uuid references product_configs(id) on delete set null,
  product_was_active  boolean not null default false,
  system_prompt_id    uuid references system_prompts(id) on delete set null,
  
  prompt_sent         text,
  reply_text          text,
  model_used          text default 'gemini-3.1-flash-lite-preview',
  max_tokens          int,
  temperature         numeric(3,2) default 0.85,
  
  status              text not null default 'pending' check (status in ('pending', 'success', 'error')),
  error_message       text,
  duration_ms         int,
  
  was_edited          boolean not null default false,
  edited_text         text,
  was_copied          boolean not null default false,
  copied_at           timestamptz,
  
  created_at          timestamptz not null default now()
);

create index idx_replies_session on generated_replies(session_id);
create index idx_replies_post on generated_replies(reddit_post_id);
create index idx_replies_inspection on generated_replies(inspection_id);
create index idx_replies_tone on generated_replies(tone);
create index idx_replies_created on generated_replies(created_at desc);
create index idx_replies_product on generated_replies(product_config_id);
create index idx_replies_prompt on generated_replies(system_prompt_id);

-- ─── REPLY EDITS ────────────────────────────────────────────────────────────
create table reply_edits (
  id              uuid primary key default uuid_generate_v4(),
  reply_id        uuid not null references generated_replies(id) on delete cascade,
  previous_text   text not null,
  new_text        text not null,
  char_diff       int,
  edited_at       timestamptz not null default now()
);

create index idx_reply_edits_reply on reply_edits(reply_id);

-- ─── COPY EVENTS ────────────────────────────────────────────────────────────
create table copy_events (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid references sessions(id) on delete set null,
  reply_id        uuid references generated_replies(id) on delete set null,
  copied_text     text not null,
  source_tab      text check (source_tab in ('search', 'inspect')),
  reddit_post_id  uuid references reddit_posts(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_copy_events_session on copy_events(session_id);
create index idx_copy_events_reply on copy_events(reply_id);

-- ─── ACTIVITY LOG ───────────────────────────────────────────────────────────
create table activity_log (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid references sessions(id) on delete set null,
  event_type      text not null,
  event_data      jsonb default '{}'::jsonb,
  reddit_post_id  uuid references reddit_posts(id) on delete set null,
  reply_id        uuid references generated_replies(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_activity_event_type on activity_log(event_type);
create index idx_activity_session on activity_log(session_id);
create index idx_activity_created on activity_log(created_at desc);
create index idx_activity_data on activity_log using gin(event_data);

-- ─── API USAGE ──────────────────────────────────────────────────────────────
create table api_calls (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid references sessions(id) on delete set null,
  endpoint        text not null,
  model           text not null default 'gemini-3.1-flash-lite-preview',
  prompt_tokens   int,
  completion_tokens int,
  total_tokens    int,
  max_tokens_sent int,
  temperature     numeric(3,2),
  status_code     int,
  status          text not null default 'pending' check (status in ('pending', 'success', 'error')),
  error_message   text,
  duration_ms     int,
  created_at      timestamptz not null default now()
);

create index idx_api_calls_session on api_calls(session_id);
create index idx_api_calls_endpoint on api_calls(endpoint);
create index idx_api_calls_status on api_calls(status);
create index idx_api_calls_created on api_calls(created_at desc);

-- ─── PRODUCT CHANGE HISTORY ─────────────────────────────────────────────────
create table product_changes (
  id              uuid primary key default uuid_generate_v4(),
  product_config_id uuid not null references product_configs(id) on delete cascade,
  session_id      uuid references sessions(id) on delete set null,
  field_name      text not null check (field_name in ('name', 'url', 'description', 'features', 'is_active')),
  old_value       text,
  new_value       text,
  changed_at      timestamptz not null default now()
);

create index idx_product_changes_config on product_changes(product_config_id);
create index idx_product_changes_field on product_changes(field_name);
create index idx_product_changes_time on product_changes(changed_at desc);

-- ─── DAILY STATS (materialized view) ────────────────────────────────────────
create materialized view daily_stats as
with days as (
  select generate_series(
    (select min(date_trunc('day', created_at))::date from searches),
    current_date,
    '1 day'::interval
  )::date as day
),
search_stats as (
  select date_trunc('day', created_at)::date as day,
         count(distinct id) as total_searches,
         coalesce(sum(results_count), 0) as total_posts_found
  from searches group by 1
),
reply_stats as (
  select date_trunc('day', created_at)::date as day,
         count(*) as total_replies,
         count(*) filter (where product_was_active = true) as replies_with_product
  from generated_replies group by 1
),
copy_stats as (
  select date_trunc('day', created_at)::date as day,
         count(*) as total_copies
  from copy_events group by 1
),
inspect_stats as (
  select date_trunc('day', created_at)::date as day,
         count(*) as total_inspections
  from inspections group by 1
),
error_stats as (
  select date_trunc('day', created_at)::date as day,
         count(*) as api_errors
  from api_calls where status = 'error' group by 1
)
select
  d.day,
  coalesce(ss.total_searches, 0) as total_searches,
  coalesce(ss.total_posts_found, 0) as total_posts_found,
  coalesce(rs.total_replies, 0) as total_replies,
  coalesce(rs.replies_with_product, 0) as replies_with_product,
  coalesce(cs.total_copies, 0) as total_copies,
  coalesce(is2.total_inspections, 0) as total_inspections,
  coalesce(es.api_errors, 0) as api_errors
from days d
left join search_stats ss on ss.day = d.day
left join reply_stats rs on rs.day = d.day
left join copy_stats cs on cs.day = d.day
left join inspect_stats is2 on is2.day = d.day
left join error_stats es on es.day = d.day
order by d.day desc;

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────
alter table sessions enable row level security;
alter table product_configs enable row level security;
alter table system_prompts enable row level security;
alter table keyword_packs enable row level security;
alter table subreddit_history enable row level security;
alter table keyword_history enable row level security;
alter table searches enable row level security;
alter table reddit_posts enable row level security;
alter table inspections enable row level security;
alter table generated_replies enable row level security;
alter table reply_edits enable row level security;
alter table copy_events enable row level security;
alter table activity_log enable row level security;
alter table api_calls enable row level security;
alter table product_changes enable row level security;

-- ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_reddit_posts_updated
  before update on reddit_posts
  for each row execute function update_updated_at();

create trigger trg_keyword_packs_updated
  before update on keyword_packs
  for each row execute function update_updated_at();

create or replace function log_activity(
  p_session_id uuid,
  p_event_type text,
  p_event_data jsonb default '{}'::jsonb,
  p_reddit_post_id uuid default null,
  p_reply_id uuid default null
) returns uuid as $$
declare
  v_id uuid;
begin
  insert into activity_log (session_id, event_type, event_data, reddit_post_id, reply_id)
  values (p_session_id, p_event_type, p_event_data, p_reddit_post_id, p_reply_id)
  returning id into v_id;
  return v_id;
end;
$$ language plpgsql;


-- ============================================================================
-- SEED DATA — dight.pro product + keyword packs + default prompt
-- ============================================================================

-- ─── Seed: Product Config (dight.pro) ────────────────────────────────────────
insert into product_configs (action, product_name, product_url, description, features, is_active)
values (
  'save',
  'dight.pro',
  'https://dight.pro',
  'Finds businesses with weak digital presence, scores them by how likely they are to need your services, and generates personalized outreach emails — so you know exactly who to pitch and when.',
  'AI lead scoring (Proprietary Value Score)
Finds leads by industry and location
Personalized outreach email generator
LeadLens, RedditRecon, AudienceRadar, SignalFire, DirPilot
Credit-based pricing from $10/month',
  true
);

-- ─── Seed: Keyword Packs ─────────────────────────────────────────────────────

insert into keyword_packs (name, keywords, pack_order) values
  ('🔥 Quick Start', ARRAY['find clients', 'no clients', 'lead generation', 'cold outreach', 'freelance clients'], 0),
  ('🎯 Intent', ARRAY['find clients', 'get clients', 'lead generation', 'finding clients', 'how to find clients', 'client outreach', 'cold outreach', 'prospecting', 'getting clients', 'new clients'], 1),
  ('😤 Pain', ARRAY['no clients', 'struggling to find clients', 'slow month', 'dry pipeline', 'need more clients', 'lost a client', 'client churn', 'not enough work'], 2),
  ('🏷 Niche', ARRAY['web design clients', 'freelance clients', 'SMMA clients', 'marketing agency clients', 'SEO clients', 'social media clients'], 3),
  ('🔧 Tools', ARRAY['Apollo alternative', 'lead gen tool', 'Clay alternative', 'LinkedIn outreach', 'cold email tool', 'prospect finder'], 4);

-- ─── Seed: Default System Prompt ─────────────────────────────────────────────
insert into system_prompts (prompt_text, is_default, label) values (
  'You are a Reddit user replying to this post.

POST TITLE: {{post_title}}
POST BODY: {{post_body}}
SUBREDDIT: r/{{subreddit}}

YOUR IDENTITY: {{identity}}
TONE: {{tone_instruction}}
LENGTH: {{length_instruction}}
{{product_block}}
{{custom_context}}

TONE MATCHING: Study the subreddit''s vibe and how the post is written. If the OP uses casual slang, lowercase, or abbreviations — mirror that slightly. If it''s a serious/technical sub, match that energy. Blend your tone with the thread''s natural voice so your reply feels native to the conversation.

Write a Reddit reply that:
- Sounds like a real human, not AI or a salesperson
- Adds genuine value — don''t be generic
- Strictly follows the LENGTH instruction above
- Subtly matches the writing style & energy of the thread (slang, formality, humor level)
- Fits Reddit culture: no hype, no corporate speak, no hashtags
- No preamble, no "Great question!", just the reply text

Output the reply text only.',
  true,
  'Default Reddit Reply Prompt'
);

-- ─── Seed: Subreddit History ─────────────────────────────────────────────────
insert into subreddit_history (subreddits, raw_input) values (
  ARRAY['SaaS', 'freelance', 'entrepreneur', 'smallbusiness', 'webdev', 'marketing', 'startups'],
  'SaaS, freelance, entrepreneur, smallbusiness, webdev, marketing, startups'
);

-- ─── Seed: Keyword History (Quick Start) ─────────────────────────────────────
insert into keyword_history (keywords) values (
  ARRAY['find clients', 'no clients', 'lead generation', 'cold outreach', 'freelance clients']
);

-- ─── Seed: Activity Log for initial setup ────────────────────────────────────
insert into activity_log (event_type, event_data) values
  ('product_save', '{"product_name": "dight.pro", "product_url": "https://dight.pro"}'::jsonb),
  ('prompt_save', '{"label": "Default Reddit Reply Prompt", "is_default": true}'::jsonb),
  ('pack_create', '{"pack_name": "🔥 Quick Start", "keyword_count": 5}'::jsonb),
  ('pack_create', '{"pack_name": "🎯 Intent", "keyword_count": 10}'::jsonb),
  ('pack_create', '{"pack_name": "😤 Pain", "keyword_count": 8}'::jsonb),
  ('pack_create', '{"pack_name": "🏷 Niche", "keyword_count": 6}'::jsonb),
  ('pack_create', '{"pack_name": "🔧 Tools", "keyword_count": 6}'::jsonb);


-- ─── USEFUL QUERIES ─────────────────────────────────────────────────────────

-- Most generated-for subreddits:
-- select rp.subreddit, count(*) as replies from generated_replies gr
--   join reddit_posts rp on rp.id = gr.reddit_post_id
--   group by rp.subreddit order by replies desc limit 20;

-- Product mention rate:
-- select count(*) filter (where reply_text ilike '%dight%') as mentioned,
--        count(*) as total
--   from generated_replies where product_was_active = true;

-- Most used keyword packs:
-- select kp.name, count(kh.id) as times_used
--   from keyword_packs kp
--   left join keyword_history kh on kh.source_pack = kp.id
--   group by kp.name order by times_used desc;

-- Subreddit frequency:
-- select unnest(subreddits) as sub, count(*) as times_used
--   from subreddit_history group by sub order by times_used desc limit 20;

-- Prompt usage:
-- select sp.label, count(gr.id) as replies_generated
--   from system_prompts sp
--   left join generated_replies gr on gr.system_prompt_id = sp.id
--   group by sp.label order by replies_generated desc;

-- Tone popularity:
-- select tone, count(*) from generated_replies group by tone order by count desc;

-- Average generation time by length:
-- select length_option, round(avg(duration_ms)) as avg_ms, count(*) 
--   from generated_replies where status = 'success' group by length_option;

-- ─── COPIED REPLIES (standalone, no FK deps) ────────────────────────────────
create table if not exists copied_replies (
  id              uuid primary key default uuid_generate_v4(),
  reply_text      text not null,
  source_tab      text check (source_tab in ('search', 'inspect')),
  post_title      text,
  subreddit       text,
  comment_author  text,
  reddit_url      text,
  copied_at       timestamptz not null default now()
);

create index if not exists idx_copied_replies_at on copied_replies(copied_at desc);
