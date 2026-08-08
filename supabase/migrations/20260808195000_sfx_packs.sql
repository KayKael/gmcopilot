-- Packs de efeitos sonoros (DnD, Ordem Paranormal, custom)
create table if not exists public.sfx_packs (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  nome text not null,
  efeitos text[] not null default '{}',
  built_in boolean not null default false,
  ativo boolean not null default true,
  ordem int not null default 0
);

grant select, insert, update, delete on public.sfx_packs to anon, authenticated;
grant all on public.sfx_packs to service_role;
alter table public.sfx_packs enable row level security;

drop policy if exists "sfx_packs open" on public.sfx_packs;
create policy "sfx_packs open" on public.sfx_packs for all using (true) with check (true);

insert into public.sfx_packs (key, nome, efeitos, built_in, ativo, ordem) values
  (
    'dnd',
    'DnD',
    array['espada','porta','magia','passos','moedas','dragao','trovao','multidao'],
    true,
    true,
    1
  ),
  (
    'ordem_paranormal',
    'Ordem Paranormal',
    array[
      'porta','passos','vento','coracao','trovao','magia','multidao','dragao',
      'sussurro','ritual','gotas','correntes','forja','portal','grito','relogio','estatica','impacto'
    ],
    true,
    true,
    2
  )
on conflict (key) do update set
  nome = excluded.nome,
  efeitos = excluded.efeitos,
  built_in = excluded.built_in,
  ordem = excluded.ordem,
  ativo = true;
