-- Run this in Supabase SQL Editor to create the copied_replies table
-- Dashboard → SQL Editor → New query → paste this → Run

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

-- Disable RLS so the service key can insert freely
alter table copied_replies enable row level security;
create policy "Service key full access" on copied_replies for all using (true) with check (true);
