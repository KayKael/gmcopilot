# GM Co-Pilot — Fases 4 a 7 + Documentação completa

## Estado atual (confirmado no código)

- **Base de dados**: `scene_configs` (6 cenas seed), `sessions` (com coluna `resumo`), `transcript_lines`, `scene_events` (cena, origem, confiança), `doc_chunks` (com `embedding` + função `match_documents`).
- **Fase 1** — Dashboard escuro, painéis (transcrição, cena, Spotify, SFX), Definições com CRUD de cenas, shell de Documentação.
- **Fase 2** — Spotify PKCE, callback, refresh de token, play/pause/next, troca de playlist com fade, seleção de dispositivo e volume.
- **Fase 3** — Transcrição em tempo real (OpenAI Realtime via WebRTC, token efémero no servidor), gravação em `transcript_lines`, mute com tecla M, auto-scroll.
- **Por fazer**: classificação automática de cena (4), SFX reais + sugestões (5), RAG sobre documentos (6), resumos e histórico de sessões (7).

---

## Fase 4 — Classificação automática de cena

**Objetivo**: enquanto a transcrição corre, o sistema deteta sozinho se a mesa está em combate, exploração, social, tensão, descanso ou épico, e muda a música em conformidade — sem nunca interromper o mestre.

Como implemento:

1. **Janela deslizante de contexto**: um buffer com as últimas ~8 linhas finais (ou ~600 caracteres) da transcrição, atualizado no store.
2. **Disparo controlado**: classificar no máximo 1x a cada 15 s e só quando houver texto novo desde a última classificação (evita gastar tokens e evita cenas a "piscar").
3. **Server function `classificarCena`** (`src/lib/cena.functions.ts`): recebe a janela de texto, chama um modelo rápido e barato via Lovable AI (`google/gemini-3-flash-preview`) com *structured output* — devolve `{ cena, confianca, sfx_sugeridos[] }`. Sem chaves no browser.
4. **Histerese e limiares**: só troca de cena se `confianca >= 0.7` **e** a nova cena se repetir em 2 classificações seguidas, ou se a confiança for `>= 0.9`. Cooldown de 30 s entre trocas automáticas.
5. **Override manual sempre vence**: se o mestre carregar em 1–6, a auto-classificação fica em pausa 2 minutos (badge "manual" visível).
6. **Efeitos da troca**: atualiza o painel de cena (cor/ícone), troca a playlist do Spotify com fade (já existe), grava linha em `scene_events` com `origem = 'auto'` e a confiança.
7. **UI**: barra de confiança no painel de cena, etiqueta "auto/manual", e toggle "Classificação automática" (já existe `autoClassify` no store) na TopBar/Definições.
8. **Falhas**: se a IA falhar ou devolver 429, mantém a cena atual e mostra toast discreto; nunca bloqueia.

---

## Fase 5 — Efeitos sonoros reais e sugestões contextuais

**Objetivo**: painel de SFX que toca instantaneamente, com sugestões automáticas conforme a cena e a conversa.

Como implemento:

1. **Motor de áudio** (`src/lib/sfx.ts`): Web Audio API com pré-carregamento e descodificação dos 10 sons em `AudioBuffer` no arranque; disparo com latência ~0 ms, permitindo sobreposição de vários sons.
2. **Ducking**: ao disparar um SFX, baixa o volume do Spotify (ex.: 80 → 35) e restaura em rampa após o som — reaproveitando `definirVolume`.
3. **Volume próprio de SFX** com `GainNode`, guardado em localStorage e ajustável nas Definições.
4. **Atalhos**: Q W E R T Y para os 6 primeiros sons (já documentado nos atalhos); realce visual do botão ao disparar.
5. **Sugestões**: a classificação da Fase 4 devolve `sfx_sugeridos`; esses botões ganham brilho/anel de destaque e sobem para o topo do painel. Fallback: `sfx_sugeridos` da própria cena configurada.
6. **Substituição de sons**: os ficheiros em `public/sfx/` são placeholders — as Definições permitem escolher, por cada slot, um ficheiro carregado pelo utilizador (guardado em Storage) ou manter o predefinido.

---

## Fase 6 — Documentos da campanha e pergunta-resposta (RAG)

**Objetivo**: carregar notas/lore e perguntar durante a sessão "quem é o barão de Ravenhold?" com resposta em segundos, citando a fonte.

Como implemento:

1. **Upload** em `/docs`: aceita `.md` e `.txt` (drag & drop). Ficheiro lido no browser e enviado como texto para o servidor.
2. **Chunking** (`src/lib/rag.server.ts`): divisão por títulos markdown e depois por ~800 caracteres com 100 de sobreposição, preservando o cabeçalho da secção como contexto.
3. **Embeddings**: server function `indexarDocumento` gera embeddings em lotes e grava em `doc_chunks` (`doc_name`, `chunk_index`, `content`, `embedding`). Progresso mostrado por barra na UI.
4. **Gestão**: lista de documentos indexados com nº de chunks e botão para remover (apaga chunks do documento).
5. **Pesquisa**: server function `perguntarDocs` — embedding da pergunta → `match_documents` (pgvector, top 6, limiar de similaridade) → resposta gerada com os excertos, em português europeu, obrigada a dizer "não encontrei nas tuas notas" quando não há suporte.
6. **UI de perguntas**: caixa "Perguntar às notas" no dashboard (atalho `/`), resposta curta em painel lateral com os excertos-fonte colapsáveis. Histórico das últimas perguntas da sessão.
7. **Extra opcional**: botão "explicar a última menção" que usa as últimas linhas da transcrição como pergunta implícita.

---

## Fase 7 — Resumos, histórico e exportação

**Objetivo**: no fim da sessão, ter um resumo utilizável e um arquivo pesquisável.

Como implemento:

1. **Resumo automático ao parar a sessão**: server function `resumirSessao` lê todas as `transcript_lines` da sessão (com os `scene_events` como marcadores temporais) e produz: síntese narrativa, decisões dos jogadores, NPCs e locais mencionados, ganchos em aberto e ações para o mestre. Guardado em `sessions.resumo`.
2. **Sessões longas**: resumo em duas passagens (resumo por blocos → resumo dos resumos) para não estourar o contexto.
3. **Nova rota `/sessoes`**: lista de sessões (data, duração, nº de linhas, cenas dominantes), com detalhe por sessão — resumo, transcrição completa pesquisável e linha do tempo de cenas.
4. **Exportação**: descarregar resumo + transcrição em Markdown; opção de indexar o resumo em `doc_chunks` para que sessões passadas fiquem pesquisáveis pelo RAG.
5. **Renomear/apagar sessões**; sessões vazias descartadas automaticamente.
6. **Robustez**: se o resumo falhar, a sessão fecha na mesma e fica um botão "Gerar resumo" no histórico.

---

## Documentação

Reescrevo a rota `/docs` como centro de documentação em duas abas — **Campanha** (upload/RAG da Fase 6) e **Manual** — e crio `README.md` com o mesmo conteúdo:

- Visão geral e filosofia (co-piloto: nunca bloqueia, erros só em toasts).
- Guia de arranque: ligar Spotify, Redirect URIs necessários, permissões de microfone, iniciar sessão.
- Referência de atalhos (1–6 cenas, Q–Y sons, Espaço, M, `/` perguntar).
- Cenas: como configurar cores, ícones, playlists e sons; como funciona a auto-classificação e como a desativar.
- Documentos: formatos aceites, como escrever notas para melhores respostas.
- Resumos e histórico: o que é gerado e como exportar.
- Resolução de problemas: `redirect_uri` do Spotify, sem dispositivo ativo, microfone sem acesso, transcrição a reconectar.
- Nota técnica: arquitetura (React + TanStack Start, base de dados Lovable Cloud, IA no servidor), tabelas e onde vive cada peça.

---

## Notas técnicas

- Toda a IA passa por server functions (`*.functions.ts`) com Lovable AI Gateway — nenhuma chave no cliente. Modelos: `google/gemini-3-flash-preview` para classificação (rápido/barato) e `google/gemini-3-pro-preview` para resumos e respostas RAG.
- Tratamento explícito de 429/402 do gateway, com degradação silenciosa.
- Sem autenticação, mantendo a app de utilizador único; as tabelas continuam com as políticas atuais.
- Ordem sugerida de execução: 4 → 5 → 6 → 7 → documentação, cada fase entregue e testável isoladamente.

## Fora do âmbito

- Multi-utilizador, contas ou partilha com jogadores.
- Aplicação móvel ou modo offline.
