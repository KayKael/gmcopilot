# Bardic Buddy

# GM CO-PILOT — Assistente de Mestre de RPG em Tempo Real

## 1. CONTEXTO E OBJETIVO

Estou a construir uma ferramenta de trabalho para mim próprio: sou o mestre (game master) de sessões de RPG de mesa (D&D) com 4-5 jogadores. Durante a sessão eu falo constantemente (narração, diálogos, regras) e preciso de um co-piloto que:

1. Transcreva tudo o que digo em tempo real (para log e resumo pós-sessão)

2. Detete automaticamente o tipo de cena atual (combate, exploração, etc.) a partir do que digo

3. Troque a música do Spotify para a playlist adequada a essa cena, sem eu tocar em nada

4. Me dê efeitos sonoros a 1 clique (sons de espada, trovão, multidão...)

5. Responda a perguntas sobre a documentação da minha campanha (RAG)

UTILIZADOR: uma só pessoa (eu), sem login/multi-utilizador. É uma ferramenta pessoal.

AÇÃO-CHAVE: iniciar sessão → a app ouve, transcreve, classifica e troca a música sozinha.

FILOSOFIA: a app é um CO-PILOTO. Nunca bloqueia. Se qualquer automação falhar, todos os controlos manuais continuam a funcionar. Erros aparecem em toasts discretos no canto, nunca em modais.

## 2. STACK E ARQUITETURA (OBRIGATÓRIO — NÃO DESVIAR)

- Frontend: React + Vite + Tailwind CSS + shadcn/ui (stack padrão Lovable)

- Backend: APENAS Supabase Edge Functions (Deno). Não há outro servidor.

- Base de dados: Supabase Postgres com extensão pgvector ativada

- REGRA DE SEGURANÇA ABSOLUTA: a chave OPENAI_API_KEY vive APENAS em Supabase Edge Function Secrets e é lida com Deno.env.get('OPENAI_API_KEY'). NUNCA aparece no código frontend, NUNCA é passada ao browser. Toda a comunicação com a OpenAI passa por Edge Functions.

- O Spotify Client ID NÃO é secreto: fica num ficheiro src/config/spotify.ts exportado como constante, fácil de eu editar.

- Autenticação Spotify: Authorization Code Flow com PKCE, 100% client-side (sem Edge Function), tokens em localStorage.

- Estado global: Zustand ou React Context. Um único store de sessão (SessionStore) com: estado da sessão, cena atual, transcrição parcial, estado Spotify.

## 3. DESIGN E LAYOUT

- Tema escuro obrigatório (fundo zinc-950, painéis zinc-900, texto zinc-100). Uso noturno.

- Densidade alta: é um dashboard de ferramenta, não marketing. Sem hero sections, sem animações decorativas.

- Layout da página principal (/) em grelha CSS, ecrã cheio sem scroll da página (scroll apenas dentro dos painéis):

┌──────────────────────────────────────────────────────────────────┐

│ TOPBAR: logo "GM Co-Pilot" | estado sessão | botão Ligar Spotify │

│         | botão Iniciar/Parar Sessão | link /settings | /docs    │

├───────────────────────────────┬──────────────────────────────────┤

│                               │  PAINEL CENA ATUAL (grande)      │

│  PAINEL TRANSCRIÇÃO           │  nome + ícone + cor + confiança  │

│  (texto a correr,             │  [Classificar agora] [Auto: ON]  │

│   scroll interno auto,        ├──────────────────────────────────┤

│   timestamps à esquerda)      │  PAINEL SPOTIFY                  │

│                               │  faixa atual, play/pause/skip    │

│  ~50% largura                 ├──────────────────────────────────┤

│                               │  GRELHA SFX (botões grandes)     │

│                               │  + secção "Sugeridos" (3)        │

├───────────────────────────────┴──────────────────────────────────┤

│ PERGUNTAR À CAMPANHA: input + resposta (RAG)                     │

└──────────────────────────────────────────────────────────────────┘

- Cada cena tem cor e ícone próprios (ver secção 6). O painel de cena usa a cor da cena como acento (borda + glow subtil).

- Atalhos de teclado GLOBAIS (funcionam mesmo com foco noutro painel, exceto quando a escrever num input):

  - Teclas 1-6: mudar cena manualmente (1=combate, 2=exploracao, 3=social, 4=tensao, 5=descanso, 6=epico)

  - Q W E R T Y: tocar os 6 primeiros efeitos sonoros

  - Espaço: play/pause Spotify (prevenir default do scroll)

  - M: ligar/desligar microfone da transcrição

- Mostrar legenda dos atalhos num tooltip/popover na topbar (ícone de teclado).

## 4. ESQUEMA DA BASE DE DADOS (Supabase — criar com migrations)

Tabela scene_configs (configuração das cenas, editável em /settings):

- id uuid pk default gen_random_uuid()

- key text unique (combate | exploracao | social | tensao | descanso | epico)

- nome text (ex.: 'Combate', 'Exploração')

- cor text (hex, ex.: '#ef4444')

- icone text (nome de ícone lucide: 'swords', 'compass', 'message-circle', 'skull', 'tent', 'crown')

- spotify_playlist_uri text (ex.: 'spotify:playlist:37i9dQZF1DX...' — editável pelo utilizador)

- sfx_sugeridos text[] (subset de: espada, porta, trovao, multidao, magia, passos, vento, coracao, moedas, dragao)

- ordem int (para as teclas 1-6)

SEED: inserir as 6 cenas com valores por defeito e playlist_uri vazia (eu preencho depois).

Tabela sessions:

- id uuid pk, nome text, started_at timestamptz default now(), ended_at timestamptz, resumo text

Tabela transcript_lines:

- id uuid pk, session_id uuid fk sessions, ts timestamptz default now(), texto text

Tabela scene_events:

- id uuid pk, session_id uuid fk, ts timestamptz default now(), cena text, origem text (auto|manual), confianca float

Tabela doc_chunks (RAG):

- id uuid pk, doc_name text, chunk_index int, content text, embedding vector(1536)

Função SQL match_documents(query_embedding vector(1536), match_threshold float, match_count int):

retorna id, content, doc_name, similarity — padrão pgvector com operador <=> (cosine distance).

## 5. FLUXO SPOTIFY — AUTENTICAÇÃO PKCE (client-side)

Ficheiro src/lib/spotifyAuth.ts:

1. handleLigarSpotify():

   a. Gera code_verifier: string aleatória base64url de 64 chars (crypto.getRandomValues)

   b. code_challenge = base64url(SHA-256(code_verifier))

   c. Guarda code_verifier em localStorage('spotify_code_verifier')

   d. Redireciona para https://accounts.spotify.com/authorize com query params:

      client_id (de src/config/spotify.ts), response_type=code,

      redirect_uri = window.location.origin + '/callback',

      scope = 'user-read-playback-state user-modify-playback-state user-read-currently-playing',

      code_challenge_method=S256, code_challenge

2. Página /callback:

   a. Lê ?code da URL, troca por tokens: POST https://accounts.spotify.com/api/token

      (form-urlencoded: grant_type=authorization_code, code, redirect_uri, client_id, code_verifier)

   b. Guarda em localStorage: spotify_access_token, spotify_refresh_token, spotify_expires_at (now + expires_in*1000)

   c. Limpa a URL e navega para '/'

3. getValidToken() (helper usado antes de QUALQUER chamada à API):

   - Se expires_at - now < 60s: refresh com POST grant_type=refresh_token; atualiza localStorage

   - Retorna access_token válido

4. Estado na UI: topbar mostra "Spotify: ligado ✓" (verde) ou botão "Ligar Spotify".

## 6. FLUXO SPOTIFY — REPRODUÇÃO POR CENA

Ficheiro src/lib/spotifyPlayer.ts:

- playScenePlaylist(playlist_uri):

  1. token = await getValidToken()

  2. PUT https://api.spotify.com/v1/me/player/play com body { "context_uri": playlist_uri, "offset": {"position": 0} } e header Authorization: Bearer

  3. Depois PUT /v1/me/player/shuffle?state=true

  4. Tratamento de erros:

     - 404 (sem dispositivo ativo): GET /v1/me/player/devices; se houver dispositivos, PUT /v1/me/player com {"device_ids": [primeiro.id], "play": true} e retenta o play; se não houver, toast: "Abre o Spotify num dispositivo (app ou web player)"

     - 403: toast "Controlo de playback requer Spotify Premium"

     - 401: força refresh do token e retenta UMA vez

- Polling: a cada 5s, GET /v1/me/player/currently-playing → atualiza painel Spotify (nome da faixa, artista, capa do álbum 64px). Se 204 (nada a tocar), mostra "Nada a reproduzir".

- Botões manuais play/pause (PUT /v1/me/player/play | /pause) e skip (POST /v1/me/player/next).

## 7. FLUXO DE TRANSCRIÇÃO EM TEMPO REAL (OpenAI Realtime API)

Edge Function `realtime-token` (supabase/functions/realtime-token/index.ts):

- POST sem body. Lê OPENAI_API_KEY de Deno.env.

- Faz POST a https://api.openai.com/v1/realtime/transcription_sessions com:

  header Authorization: Bearer OPENAI_API_KEY, body:

  {

    "input_audio_transcription": { "model": "gpt-4o-transcribe", "language": "pt" },

    "turn_detection": { "type": "server_vad", "threshold": 0.5, "prefix_padding_ms": 300, "silence_duration_ms": 800 }

  }

- Devolve ao frontend: { "client_secret": <valor de client_secret.value da resposta> }

- CORS: responde a OPTIONS com Access-Control-Allow-Origin: * e headers authorization, content-type.

Frontend (src/lib/transcription.ts):

1. Ao clicar "Iniciar Sessão":

   a. Cria registo na tabela sessions (nome automático: 'Sessão ' + data/hora)

   b. Chama a Edge Function realtime-token → obtém client_secret

   c. Abre WebSocket: wss://api.openai.com/v1/realtime?intent=transcription

      com subprotocols: ['realtime', 'openai-insecure-api-key.' + client_secret]

   d. Captura microfone: navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 24000, echoCancellation: true, noiseSuppression: true } })

   e. AudioContext (24000 Hz) + AudioWorkletNode: o worklet recebe Float32, converte para PCM16 little-endian ((s*32767) clampado), e envia pelo WebSocket como:

      { "type": "input_audio_buffer.append", "audio": <base64 do buffer PCM16> }

      em chunks de ~100ms (2400 amostras).

2. Receção de eventos WebSocket:

   - "conversation.item.input_audio_transcription.delta": anexa event.delta à linha parcial atual (renderizada em cinzento zinc-500, itálico)

   - "conversation.item.input_audio_transcription.completed": fixa a linha (branco), com timestamp HH:MM:SS à esquerda; insere em transcript_lines com o session_id; limpa a linha parcial

   - "error": toast com a mensagem, mas NÃO fecha a sessão

3. Botão "Parar Sessão": fecha mic + WebSocket, faz update sessions.ended_at, chama Edge Function summarize-session (ver secção 10).

4. Reconexão: se o WebSocket cair a meio da sessão, tenta reconectar automaticamente até 3 vezes (novo token + novo WS), com indicador "a reconectar..." amarelo.

5. O AudioWorklet deve ser definido inline via Blob URL para não depender de ficheiros extra no build.

## 8. FLUXO DE CLASSIFICAÇÃO DE CENA

Edge Function `classify-scene`:

- Input POST: { "texto": "<transcrição dos últimos 60 segundos>" }

- Chama https://api.openai.com/v1/chat/completions, modelo gpt-4o-mini, temperature 0, response_format { "type": "json_object" }, mensagens:

  system: "És um classificador de cenas de sessões de RPG de mesa em português. Recebes um excerto de transcrição do mestre e classificas a cena atual. Categorias possíveis: combate (lutas, iniciativa, ataques, dano), exploracao (movimento, investigação, descrição de locais), social (diálogo com NPCs, negociação), tensao (perigo iminente, perseguição, suspense), descanso (pausas, acampamento, compras, planeamento calmo), epico (momentos culminantes, boss, revelações dramáticas). Responde APENAS com JSON: {\"cena\": \"<uma das 6>\", \"confianca\": <0.0-1.0>, \"sfx\": [<até 3 de: espada, porta, trovao, multidao, magia, passos, vento, coracao, moedas, dragao>]}"

  user: o excerto de transcrição

- Devolve o JSON parseado ao frontend.

Frontend (lógica no SessionStore):

- Modo AUTOMÁTICO (toggle no painel de cena, default ON): a cada 30s, se houver texto novo transcrito desde a última classificação, chama classify-scene com o texto dos últimos 60s.

- Botão "Classificar agora": força classificação imediata.

- Regra de mudança: se cena_classificada ≠ cena_atual E confianca > 0.6:

  1. Atualiza cena_atual no store (painel muda de cor/ícone)

  2. Chama playScenePlaylist(playlist_uri da nova cena) — se playlist_uri estiver vazia, salta este passo silenciosamente

  3. Atualiza os 3 SFX sugeridos no painel

  4. Insere em scene_events (origem 'auto', confianca)

- Mudança MANUAL (teclas 1-6 ou clicar numa cena): mesmos passos, origem 'manual', confianca null. Manual NUNCA exige confiança.

- Histerese: no modo auto, ignorar classificações iguais à anterior ou com menos de 15s desde a última mudança (evita oscilação de música).

## 9. FLUXO DE EFEITOS SONOROS

- Ficheiros em /public/sfx/: espada.mp3, porta.mp3, trovao.mp3, multidao.mp3, magia.mp3, passos.mp3, vento.mp3, coracao.mp3, moedas.mp3, dragao.mp3. Para já, cria os ficheiros vazios/placeholder; eu substituo. O código deve falhar em silêncio se o ficheiro não existir (catch no play()).

- Grelha 5x2 de botões grandes (min 96px altura): ícone lucide + nome. Clicar: new Audio('/sfx/X.mp3'), volume 0.8, play(). Permitir overlap (cada clique cria nova instância Audio — sons podem sobrepor-se).

- Secção "Sugeridos para esta cena": 3 botões destacados (borda da cor da cena) com os sfx devolvidos pelo classificador ou os sfx_sugeridos da scene_config.

- Atalhos Q-Y mapeados aos 6 primeiros efeitos da grelha.

## 10. FLUXO RAG — DOCUMENTAÇÃO DA CAMPANHA

Página /docs:

- Lista de documentos carregados (doc_name, nº de chunks, botão apagar).

- Upload de ficheiros .md e .txt (input file múltiplo). Lê o texto no browser e envia para a Edge Function embed-docs: { "doc_name": "...", "content": "..." }.

Edge Function `embed-docs`:

- Chunking: dividir por parágrafos, agrupar até ~500 palavras por chunk com overlap de 50 palavras entre chunks consecutivos.

- Para cada chunk: POST https://api.openai.com/v1/embeddings, modelo text-embedding-3-small, input = chunk.

- Insert em doc_chunks (doc_name, chunk_index, content, embedding).

- Se doc_name já existe: apaga chunks antigos desse doc antes de inserir (re-upload = substituir).

Caixa "Perguntar à campanha" (página principal) → Edge Function `ask-lore`:

- Input: { "pergunta": "..." }

- Gera embedding da pergunta (text-embedding-3-small)

- Chama a função SQL match_documents(embedding, 0.5, 5) via supabase.rpc

- Chama gpt-4o-mini: system "És o assistente de um mestre de RPG. Responde APENAS com base no contexto fornecido da campanha. Sê conciso: máximo 3 frases. No fim, indica entre parêntesis o documento de origem. Se a resposta não estiver no contexto, diz 'Não encontrei isso na documentação da campanha.'", user: "Contexto:\n<chunks concatenados>\n\nPergunta: <pergunta>"

- Devolve { "resposta": "..." }. Mostrar na UI com spinner enquanto espera.

## 11. FLUXO DE RESUMO PÓS-SESSÃO

Edge Function `summarize-session`:

- Input: { "session_id": "..." }

- Lê todas as transcript_lines da sessão (ordenadas por ts) e os scene_events

- Chama gpt-4o-mini: "Resume esta sessão de RPG em português europeu: 5 bullets com os momentos principais, depois uma linha com a sequência de cenas (ex.: Exploração → Combate → Épico). Transcrição: <texto, truncado a ~12000 chars se necessário>"

- Guarda em sessions.resumo e devolve ao frontend.

- Página /summary/:id mostra o resumo + timeline de scene_events + transcrição completa (colapsável).

## 12. EDGE FUNCTIONS — REGRAS COMUNS

- Todas em supabase/functions/<nome>/index.ts, Deno, sem dependências externas além de fetch nativo.

- CORS em TODAS: handler de OPTIONS com status 200 e headers Access-Control-Allow-Origin: *, Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type.

- Erros: devolver { "error": "<mensagem>" } com status adequado; o frontend mostra toast.

- verify_jwt = false no config.toml de cada função (app pessoal sem auth).

## 13. PÁGINA /settings

- Tabela editável das 6 cenas: nome, cor (color picker), playlist Spotify URI (text input com placeholder 'spotify:playlist:...'), sfx sugeridos (multi-select dos 10).

- Botão "Guardar" faz upsert em scene_configs.

- Secção Spotify: estado da ligação, botão desligar (limpa localStorage), e lista de dispositivos disponíveis (GET /v1/me/player/devices) com botão "Tocar aqui" que chama transfer playback.

## 14. ORDEM DE CONSTRUÇÃO (FASES — COMPLETAR CADA UMA ANTES DA SEGUINTE)

FASE 1: Shell visual completo (layout grelha, topbar, painéis vazios com títulos) + migrations + seed de scene_configs + página /settings funcional (CRUD de cenas).

FASE 2: Spotify — PKCE auth completo + /callback + play/pause/skip manual + polling da faixa atual + troca de playlist ao clicar numa cena.

FASE 3: Transcrição — Edge Function realtime-token + WebSocket + AudioWorklet PCM16 + painel de transcrição a correr + gravação em transcript_lines.

FASE 4: Classificação — Edge Function classify-scene + modo auto (30s) + botão manual + mudança automática de música + scene_events.

FASE 5: SFX — grelha + atalhos + sugeridos por cena.

FASE 6: RAG — /docs upload + embed-docs + ask-lore + caixa de perguntas.

FASE 7: Resumo — summarize-session + /summary.

No fim de cada fase, lista-me o que ficou funcional para eu testar.

## 15. CONSTRAINTS (NÃO FAZER)

- NÃO colocar OPENAI_API_KEY em código frontend nem em variáveis VITE_*

- NÃO usar o Spotify Web Playback SDK (uso a app Spotify instalada como dispositivo)

- NÃO adicionar autenticação de utilizadores (Supabase Auth) — app pessoal

- NÃO criar landing page nem rotas de marketing

- NÃO usar localStorage para a transcrição (só Supabase)

- NÃO bloquear a UI à espera de respostas de API — tudo async com estados de loading

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://gmcopilot.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/696462a7-a005-4f89-ba9f-883da3ae9bc0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
