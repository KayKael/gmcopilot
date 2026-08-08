# GM Co-Pilot — Assistente de Mestre de RPG em Tempo Real

Ferramenta pessoal de co-piloto para sessões de D&D: transcrição em tempo real, deteção de cena, Spotify por cena, SFX a um clique e RAG sobre notas da campanha.

**Filosofia:** nunca bloqueia o jogo. Falhas de automação aparecem só em toasts; controlos manuais continuam.

## Stack (actual)

| Camada | Tecnologia |
|---|---|
| Frontend | React + Vite + TanStack Start/Router + Tailwind + shadcn/ui |
| Servidor | TanStack `createServerFn` (Nitro) — **não** Edge Functions Deno |
| Base de dados | Supabase Postgres + pgvector |
| IA | OpenAI (`OPENAI_API_KEY` no servidor): Realtime, embeddings, chat |
| Spotify | PKCE 100% no browser (`src/config/spotify.ts` + `src/lib/spotify.ts`) |

> O README histórico falava em Edge Functions. A implementação real usa server functions em `src/lib/*.functions.ts`.

## Arranque local

```sh
cp .env.example .env   # preenche as chaves
npm i
npm run dev
```

Abre **http://127.0.0.1:8080/** (evita `localhost` por causa do Spotify).

### Variáveis `.env`

| Variável | Onde | Função |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser | Cliente Supabase |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | Servidor | Fallback admin se RLS aberta |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor | Preferível para RAG/admin |
| `OPENAI_API_KEY` | Servidor | Transcrição, classificação, embeddings, RAG, resumos |

Nunca uses prefixo `VITE_` em segredos. O ficheiro `.env` está no `.gitignore`.

**Segurança:** se a chave OpenAI foi partilhada em chat, **roda-a** no [OpenAI Dashboard](https://platform.openai.com/api-keys).

## Spotify

1. Dashboard Spotify → Redirect URIs exactamente: `http://127.0.0.1:8080/callback`
2. Spotify rejeita `localhost` — a app normaliza para `127.0.0.1`
3. Premium + dispositivo activo (app desktop/web a tocar)
4. Em Definições, preenche `spotify:playlist:…` nas 6 cenas

## Fluxo de sessão

1. Ligar Spotify → escolher dispositivo  
2. Iniciar Sessão → microfone → linhas em `transcript_lines`  
3. Auto-classificação a cada ~15s (ou “Classificar agora”) → troca cena + playlist  
4. SFX: escolher pack no dropdown · grelha / Q–Y (MP3 em `public/sfx/`)   
5. Perguntar com `/` → RAG  
6. Parar Sessão → resumo em `sessions.resumo` → histórico em `/sessoes`

## Atalhos

| Tecla | Acção |
|---|---|
| 1–6 | Mudar cena |
| Q W E R T Y | 6 primeiros SFX |
| Espaço | Play/pause Spotify |
| M | Mute microfone |
| / | Focar pergunta à campanha |

## Mapa de ficheiros

| Feature | Ficheiros |
|---|---|
| Transcrição | `src/hooks/useTranscricao.ts`, `src/lib/realtime-client.ts`, `src/lib/realtime.functions.ts` |
| Cena | `src/hooks/useClassificador.ts`, `src/hooks/useCena.ts`, `src/lib/cena.functions.ts` |
| Spotify | `src/lib/spotify.ts`, `src/hooks/useSpotify.ts`, `src/config/spotify.ts` |
| SFX | `src/lib/sfx.ts`, `src/lib/sfx-packs.ts`, `src/hooks/useSfx.ts`, `public/sfx/` |
| RAG | `src/lib/rag.functions.ts`, `src/lib/rag.server.ts`, `src/routes/docs.tsx` |
| Resumo | `src/lib/sessao.functions.ts`, `src/routes/sessoes.*.tsx` |
| IA | `src/lib/ai.server.ts` |

## Troubleshooting

| Sintoma | Solução |
|---|---|
| `redirect_uri: Not matching` | URI no Dashboard = `http://127.0.0.1:8080/callback` |
| 403 Spotify | Conta Premium + dispositivo activo |
| Falha a indexar / SERVICE_ROLE | Define `SUPABASE_SERVICE_ROLE_KEY` ou usa publishable com RLS aberta |
| Classificação / resumo / RAG falha | `OPENAI_API_KEY` com créditos, ou `LOVABLE_API_KEY` como fallback; reinicia `npm run dev` |
| OpenAI “no credits remaining” | [Billing OpenAI](https://platform.openai.com/settings/organization/billing/) — Realtime pode ainda funcionar; chat/embeddings precisam de créditos |
| SFX sem som | Se um MP3 em `public/sfx/` estiver vazio/ausente → fallback procedural; podes substituir os ficheiros pelos teus |
| Transcrição a reconectar | Até 3 retries automáticos; depois pára a sessão |

## Checklist pré-sessão

1. `http://127.0.0.1:8080`  
2. Spotify ligado + dispositivo  
3. 6 playlists guardadas  
4. Docs indexados + pergunta de teste  
5. Iniciar Sessão → linhas a aparecer  
6. Classificar / Auto → playlist muda  
7. Q/W → SFX audível  
8. Parar → resumo em `/sessoes`

---

Built with [Lovable](https://lovable.dev) · Live: https://gmcopilot.lovable.app
