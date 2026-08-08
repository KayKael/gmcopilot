create extension if not exists vector with schema public;

create table public.scene_configs (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  nome text not null,
  cor text not null,
  icone text not null,
  spotify_playlist_uri text default '',
  sfx_sugeridos text[] not null default '{}',
  ordem int not null
);
grant select, insert, update, delete on public.scene_configs to anon, authenticated;
grant all on public.scene_configs to service_role;
alter table public.scene_configs enable row level security;
create policy "scene_configs open" on public.scene_configs for all using (true) with check (true);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  nome text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  resumo text
);
grant select, insert, update, delete on public.sessions to anon, authenticated;
grant all on public.sessions to service_role;
alter table public.sessions enable row level security;
create policy "sessions open" on public.sessions for all using (true) with check (true);

create table public.transcript_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  ts timestamptz not null default now(),
  texto text not null
);
create index transcript_lines_session_ts_idx on public.transcript_lines (session_id, ts);
grant select, insert, update, delete on public.transcript_lines to anon, authenticated;
grant all on public.transcript_lines to service_role;
alter table public.transcript_lines enable row level security;
create policy "transcript_lines open" on public.transcript_lines for all using (true) with check (true);

create table public.scene_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  ts timestamptz not null default now(),
  cena text not null,
  origem text not null default 'auto',
  confianca float
);
create index scene_events_session_ts_idx on public.scene_events (session_id, ts);
grant select, insert, update, delete on public.scene_events to anon, authenticated;
grant all on public.scene_events to service_role;
alter table public.scene_events enable row level security;
create policy "scene_events open" on public.scene_events for all using (true) with check (true);

create table public.doc_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_name text not null,
  chunk_index int not null,
  content text not null,
  embedding vector(1536)
);
create index doc_chunks_doc_name_idx on public.doc_chunks (doc_name);
grant select, insert, update, delete on public.doc_chunks to anon, authenticated;
grant all on public.doc_chunks to service_role;
alter table public.doc_chunks enable row level security;
create policy "doc_chunks open" on public.doc_chunks for all using (true) with check (true);

create or replace function public.match_documents(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (id uuid, content text, doc_name text, similarity float)
language sql
stable
security definer
set search_path = public
as $$
  select dc.id, dc.content, dc.doc_name, 1 - (dc.embedding <=> query_embedding) as similarity
  from public.doc_chunks dc
  where dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function public.match_documents(vector, float, int) to anon, authenticated, service_role;

insert into public.scene_configs (key, nome, cor, icone, spotify_playlist_uri, sfx_sugeridos, ordem) values
  ('combate', 'Combate', '#ef4444', 'swords', '', array['espada','magia','dragao'], 1),
  ('exploracao', 'Exploração', '#22c55e', 'compass', '', array['passos','vento','porta'], 2),
  ('social', 'Social', '#3b82f6', 'message-circle', '', array['multidao','moedas','porta'], 3),
  ('tensao', 'Tensão', '#a855f7', 'skull', '', array['coracao','trovao','vento'], 4),
  ('descanso', 'Descanso', '#f59e0b', 'tent', '', array['moedas','passos','multidao'], 5),
  ('epico', 'Épico', '#eab308', 'crown', '', array['dragao','trovao','magia'], 6);