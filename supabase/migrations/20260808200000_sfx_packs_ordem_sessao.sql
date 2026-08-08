-- Actualiza pack Ordem Paranormal com efeitos da sessão Odol Hiria / Último Batimento
update public.sfx_packs
set efeitos = array[
  'porta','passos','vento','coracao','trovao','magia','multidao','dragao',
  'sussurro','ritual','gotas','correntes','forja','portal','grito','relogio','estatica','impacto'
],
  ativo = true
where key = 'ordem_paranormal';
