-- Biblioteca de imagens + estado da apresentação visual

create table if not exists public.visual_assets (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  storage_path text not null unique,
  public_url text not null,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists visual_assets_ordem_idx on public.visual_assets (ordem, created_at);

grant select, insert, update, delete on public.visual_assets to anon, authenticated;
grant all on public.visual_assets to service_role;
alter table public.visual_assets enable row level security;

drop policy if exists "visual_assets open" on public.visual_assets;
create policy "visual_assets open" on public.visual_assets for all using (true) with check (true);

create table if not exists public.visual_presentation (
  id text primary key default 'default',
  active_asset_id uuid references public.visual_assets(id) on delete set null,
  fade_ms int not null default 800,
  updated_at timestamptz not null default now(),
  constraint visual_presentation_fade_ms_check check (fade_ms >= 0 and fade_ms <= 10000)
);

grant select, insert, update, delete on public.visual_presentation to anon, authenticated;
grant all on public.visual_presentation to service_role;
alter table public.visual_presentation enable row level security;

drop policy if exists "visual_presentation open" on public.visual_presentation;
create policy "visual_presentation open" on public.visual_presentation for all using (true) with check (true);

insert into public.visual_presentation (id, active_asset_id, fade_ms)
values ('default', null, 800)
on conflict (id) do nothing;

-- Storage bucket (público para leitura das imagens no ecrã de apresentação)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visual-assets',
  'visual-assets',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "visual_assets storage read" on storage.objects;
create policy "visual_assets storage read"
  on storage.objects for select
  using (bucket_id = 'visual-assets');

drop policy if exists "visual_assets storage insert" on storage.objects;
create policy "visual_assets storage insert"
  on storage.objects for insert
  with check (bucket_id = 'visual-assets');

drop policy if exists "visual_assets storage update" on storage.objects;
create policy "visual_assets storage update"
  on storage.objects for update
  using (bucket_id = 'visual-assets')
  with check (bucket_id = 'visual-assets');

drop policy if exists "visual_assets storage delete" on storage.objects;
create policy "visual_assets storage delete"
  on storage.objects for delete
  using (bucket_id = 'visual-assets');
