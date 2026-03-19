-- ============================================================================
-- REDDIT REPLY ENGINE — SUPABASE SCHEMA
-- Full activity logging: searches, posts, replies, inspections, product changes
-- ============================================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ─── SESSIONS ───────────────────────────────────────────────────────────────
-- Track each browser session / usage session
create table sessions (
  id            uuid primary key default uuid_generate_v4(),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  user_agent    text,
  ip_address    inet,
  metadata      jsonb default '{}'::jsonb
);

-- ─── PRODUCT CONFIG ─────────────────────────────────────────────────────────
-- Every time the user saves/clears product info, log it
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

-- ─── SEARCHES ───────────────────────────────────────────────────────────────
-- Log every Reddit search performed
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
-- Cache/log every Reddit post we encounter (from search or inspect)
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
-- Log every thread inspection (deep analysis)
create table inspections (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid references sessions(id) on delete set null,
  reddit_post_id  uuid references reddit_posts(id) on delete set null,
  input_url       text not null,
  ai_analysis     text,
  comments_count  int,
  top_comments    jsonb default '[]'::jsonb,  -- [{author, body, score}]
  status          text not null default 'pending' check (status in ('pending', 'success', 'error')),
  error_message   text,
  duration_ms     int,
  created_at      timestamptz not null default now()
);

create index idx_inspections_session on inspections(session_id);
create index idx_inspections_post on inspections(reddit_post_id);
create index idx_inspections_created on inspections(created_at desc);

-- ─── GENERATED REPLIES ──────────────────────────────────────────────────────
-- Log every AI-generated reply with full context
create table generated_replies (
  id                  uuid primary key default uuid_generate_v4(),
  session_id          uuid references sessions(id) on delete set null,
  reddit_post_id      uuid references reddit_posts(id) on delete set null,
  inspection_id       uuid references inspections(id) on delete set null,
  
  -- Generation input params
  tone                text not null default 'helpful',
  length_option       text not null default 'short',
  product_context     text,
  custom_context      text,
  product_config_id   uuid references product_configs(id) on delete set null,
  product_was_active  boolean not null default false,
  
  -- AI output
  prompt_sent         text,
  reply_text          text,
  model_used          text default 'gemini-3.1-flash-lite-preview',
  max_tokens          int,
  temperature         numeric(3,2) default 0.85,
  
  -- Status
  status              text not null default 'pending' check (status in ('pending', 'success', 'error')),
  error_message       text,
  duration_ms         int,
  
  -- User edits after generation
  was_edited          boolean not null default false,
  edited_text         text,
  
  -- Actions taken
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

-- ─── REPLY EDITS ────────────────────────────────────────────────────────────
-- Track every manual edit a user makes to a generated reply
create table reply_edits (
  id              uuid primary key default uuid_generate_v4(),
  reply_id        uuid not null references generated_replies(id) on delete cascade,
  previous_text   text not null,
  new_text        text not null,
  char_diff       int, -- positive = added chars, negative = removed
  edited_at       timestamptz not null default now()
);

create index idx_reply_edits_reply on reply_edits(reply_id);

-- ─── COPY EVENTS ────────────────────────────────────────────────────────────
-- Log every time a user copies a reply
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
-- Catch-all event log for any action in the app
create table activity_log (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid references sessions(id) on delete set null,
  event_type      text not null,
  -- Common event types:
  --   'search', 'inspect', 'generate_reply', 'copy_reply', 'edit_reply',
  --   'product_save', 'product_clear', 'product_update',
  --   'tab_switch', 'keyword_add', 'keyword_remove',
  --   'tone_change', 'length_change', 'open_reddit_link'
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
-- Track every Gemini API call for rate limiting, cost monitoring, debugging
create table api_calls (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid references sessions(id) on delete set null,
  endpoint        text not null,  -- 'generate', 'inspect'
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
-- Granular field-level change tracking for product info
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
-- Pre-computed daily metrics for dashboarding
create materialized view daily_stats as
select
  date_trunc('day', s.created_at)::date as day,
  count(distinct s.id) as total_searches,
  sum(s.results_count) as total_posts_found,
  (select count(*) from generated_replies gr where date_trunc('day', gr.created_at)::date = date_trunc('day', s.created_at)::date) as total_replies,
  (select count(*) from generated_replies gr where gr.product_was_active = true and date_trunc('day', gr.created_at)::date = date_trunc('day', s.created_at)::date) as replies_with_product,
  (select count(*) from copy_events ce where date_trunc('day', ce.created_at)::date = date_trunc('day', s.created_at)::date) as total_copies,
  (select count(*) from inspections i where date_trunc('day', i.created_at)::date = date_trunc('day', s.created_at)::date) as total_inspections,
  (select count(*) from api_calls ac where ac.status = 'error' and date_trunc('day', ac.created_at)::date = date_trunc('day', s.created_at)::date) as api_errors
from searches s
group by date_trunc('day', s.created_at)::date
order by day desc;

-- Refresh daily via cron or manually:
-- refresh materialized view daily_stats;

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────
-- Enable RLS on all tables (configure policies based on your auth setup)
alter table sessions enable row level security;
alter table product_configs enable row level security;
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

-- Auto-update updated_at on reddit_posts
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

-- Function to log activity (call from app or edge functions)
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

-- ─── USEFUL QUERIES (for reference) ─────────────────────────────────────────

-- Most generated-for subreddits:
-- select rp.subreddit, count(*) as replies from generated_replies gr
--   join reddit_posts rp on rp.id = gr.reddit_post_id
--   group by rp.subreddit order by replies desc limit 20;

-- Reply generation success rate:
-- select status, count(*), round(count(*)::numeric / sum(count(*)) over() * 100, 1) as pct
--   from generated_replies group by status;

-- Product mention rate (when product is active):
-- select count(*) filter (where reply_text ilike '%' || (select product_name from product_configs where is_active order by created_at desc limit 1) || '%') as mentioned,
--        count(*) as total
--   from generated_replies where product_was_active = true;

-- Average generation time by length:
-- select length_option, round(avg(duration_ms)) as avg_ms, count(*) 
--   from generated_replies where status = 'success' group by length_option;

-- Tone popularity:
-- select tone, count(*) from generated_replies group by tone order by count desc;
