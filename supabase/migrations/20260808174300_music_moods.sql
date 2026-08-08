-- Mood DJ: catálogo de playlists por mood (independente das 6 cenas UI)
create table if not exists public.music_moods (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  nome text not null,
  descricao text not null default '',
  spotify_playlist_uri text not null default '',
  ativo boolean not null default true,
  ordem int not null default 0
);

grant select, insert, update, delete on public.music_moods to anon, authenticated;
grant all on public.music_moods to service_role;
alter table public.music_moods enable row level security;

drop policy if exists "music_moods open" on public.music_moods;
create policy "music_moods open" on public.music_moods for all using (true) with check (true);

insert into public.music_moods (key, nome, descricao, spotify_playlist_uri, ordem) values
  ('investigacao', 'Investigação', 'pistas, pesquisa, arquivo, exploração calma, descoberta de factos', 'spotify:playlist:4Tnfm2lnySIpwdv5cJGwrJ', 1),
  ('realidade', 'Realidade', 'momentos mundanos, conversa normal, dia-a-dia, base Ordo Realitas', 'spotify:playlist:6g5dlFncuxhr26BoGRHatU', 2),
  ('visoes', 'Visões', 'visões, pesadelos, arte paranormal, alucinações, tinta e faces', 'spotify:playlist:2HD9epxHFVpKyFdsvJ4rda', 3),
  ('combate_normal', 'Combate Normal', 'luta, iniciativa, tiroteio, combate padrão, emboscada', 'spotify:playlist:79wHTIFLSG72gvYhxvWH3f', 4),
  ('combate_epico', 'Combate Épico', 'boss fight, combate decisivo, criatura grande, clímax de luta', 'spotify:playlist:2PXMbDFI89ZONYEntxXmUM', 5),
  ('festival', 'Festival', 'festa, celebração, taberna, folclore, momento social alegre', 'spotify:playlist:5ojohl7rMdzzCASMB6r7v8', 6),
  ('outro_lado', 'Outro Lado', 'outro lado, exposição paranormal, entidades, transcendência', 'spotify:playlist:2xTsdjnDgzhbAo9VhfbjGU', 7),
  ('insanidade', 'Insanidade', 'loucura, sanity loss, dilema mental, máscaras, portal', 'spotify:playlist:26XPsU6zSR7brIMpDqVjxo', 8),
  ('tecnologia', 'Tecnologia', 'tecnologia, transmissão, energia, laboratório, sinais electrónicos', 'spotify:playlist:38P5G4Q7SsWj8ueucXaKWc', 9),
  ('realizacao_fim', 'Realização do fim', 'revelação final, segredo desvendado, fim da linha, descoberta crítica', 'spotify:playlist:0FfUJ0mfg8bKiya3lrnksz', 10),
  ('base', 'Base', 'base segura, quartel, planeamento, Ordo, pausa estratégica', 'spotify:playlist:6ZDTOYfTcOvo3Ha2Qr8Yj4', 11),
  ('tensao', 'Tensão', 'tensão crescente, perigo iminente, suspense, ansiedade, espreita', 'spotify:playlist:72a1fvBTY88Soj1zWg63Mq', 12),
  ('batalha_sagrada', 'Batalha Sagrada', 'combate ritual, sagrado vs profano, entidade maior, marca de Kian', 'spotify:playlist:0zDth6aEGtmIeFMDZwMCOl', 13),
  ('perseguicao', 'Perseguição', 'fuga, perseguição, corre, chase, emboscada em movimento', 'spotify:playlist:4tZDyaZ7YFfWXgNiyqxR4l', 14),
  ('sagrado', 'Sagrado', 'atmosfera sagrada, ritual, templos, espiritual, ominoso calmo', 'spotify:playlist:1E0aKFnknjIdpOaCj1OY6Y', 15),
  ('felicidade', 'Felicidade', 'alegria, família, alívio, momentos quentes, esperança', 'spotify:playlist:3mYDyikde3nHNZJaKjVEHE', 16),
  ('tristeza', 'Tristeza', 'luto, perda, adeus, melancolia, sacrifício', 'spotify:playlist:6fUg16vTTO0oXBIdaLC9hR', 17),
  ('suspense', 'Suspense', 'terror, horror, suspense cinematográfico, clima opressivo', 'spotify:playlist:4es5RmVnaacqXQa4tfVgD3', 18)
on conflict (key) do update set
  nome = excluded.nome,
  descricao = excluded.descricao,
  spotify_playlist_uri = excluded.spotify_playlist_uri,
  ordem = excluded.ordem,
  ativo = true;
