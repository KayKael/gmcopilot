-- Overlays transparentes (PNG/GIF) sobre a imagem de fundo

alter table public.visual_assets
  add column if not exists kind text not null default 'fundo';

alter table public.visual_assets
  drop constraint if exists visual_assets_kind_check;

alter table public.visual_assets
  add constraint visual_assets_kind_check check (kind in ('fundo', 'overlay'));

create index if not exists visual_assets_kind_ordem_idx
  on public.visual_assets (kind, ordem, created_at);

alter table public.visual_presentation
  add column if not exists overlay_asset_id uuid references public.visual_assets(id) on delete set null;
