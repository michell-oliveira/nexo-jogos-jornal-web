# Jogos de Jornal (web)

Portal com os 11 jogos do app Android `old_games`, no ar em **https://nexohorizonte.com.br/jogos-jornal/**:
Sudoku, 2048, Lights Out, Campo Minado, Takuzu, Number Match, Termo, Forca, Anagrama, Criptograma e Palavras Cifradas.
O acesso exige login; o progresso é salvo por usuário e há 30 temas (`src/core/theme.ts`).

## Stack
- **Front-end:** Vite + TypeScript puro (sem framework). Rotas por hash (`#/<jogo>`); cada jogo é carregado sob demanda.
- **Worker Cloudflare** (`worker/`): login com sessão em cookie assinado (HMAC-SHA-256), limite de tentativas, tela `/admin`
  para cadastrar usuários (Cloudflare KV, binding `USERS`; senha guardada só como salt + hash PBKDF2-SHA-256) e serviço dos
  arquivos estáticos de `dist/` (binding `ASSETS`). Rota publicada em `nexohorizonte.com.br/jogos-jornal*` (`wrangler.jsonc`).
- **Testes:** Vitest + happy-dom.

## Como rodar
```bash
npm install
npm run dev          # Vite em http://localhost:5173 (sem o Worker: sem login)
npm run build        # tsc --noEmit + vite build -> dist/
npm run typecheck    # só tsc --noEmit
npm test             # vitest run
npm run deploy:dry   # build + wrangler deploy --dry-run
npm run deploy       # build + wrangler deploy (publica em produção)
```
O Worker lê os secrets `APP_USER`, `APP_PASSWORD` e `SESSION_SECRET` (opcional: `APP_USERS`). Em desenvolvimento local ficam
em `.dev.vars`, que **não é versionado**; em produção são secrets do Cloudflare.

## Estrutura
```
src/
  main.ts            hub, rotas por hash, cabeçalho, temas
  style.css
  core/              núcleo compartilhado (ver GameShell abaixo)
  games/<jogo>/      anagram, cryptogram, g2048, hangman, lightsout, minesweeper,
                     numbermatch, sudoku, takuzu, termo, wordcipher
  games/words/       banco de palavras, teclado e utilitários dos jogos de palavras
worker/              index.ts (rotas), auth.ts, users.ts, loginPage.ts, adminPage.ts + testes
public/words/        lista de palavras de 5 letras (pt_br_5letras.txt) e NOTICE.txt
docs/                mockups HTML históricos (login, admin, sudoku, temas, teoria das cores)
```
Cada jogo tem `domain.ts` (regras, sem DOM, testado) e `index.ts` (tabuleiro e ligação com o domínio).
Testes ficam ao lado do código (`*.test.ts`; os jogos simples em `src/games/lote*.test.ts`).

## Arquitetura: GameShell
O comportamento comum dos jogos vive em `src/core/gameShell.ts` (Template Method: menu → jogar → fim; cada jogo injeta o que
muda, como Strategy). `createGame(def)` recebe uma `GameDefinition<S, L>` e devolve o `GameModule` (`src/core/types.ts`) que
o catálogo monta. O shell cuida de:
- menu padrão (Continuar, níveis com recorde, Como jogar, "← Voltar aos jogos"); ajuda abre sozinha na 1ª vez;
- carregar, salvar e limpar o progresso; partida terminada nunca fica salva;
- diálogo de fim (Novo jogo, Menu), barra de status com botão Menu e desmontagem.

**Contrato.** `GameDefinition` define `meta`, `help`, `levels`, `newGame`, `levelOf`, `save` (`key`, `parse`, `serialize`,
`isOver`), `resumeLabel`, `mountView` e, opcionais, `options`, `records`, `menuExtras`, `className`, `statusText`, `finish`,
`onOpen`. O `GameHost<S>` entregue ao jogo expõe `state()`, `update(next)`, `commit()`, `clock`, `status`, `option(name)`,
`menu()` e `newGame()`.

**Serviços do núcleo:** `dom.ts` (`el`, `button`, `fmtTime`, `randInt`, `shuffled`), `dialog.ts` (`dialog`, `helpController`),
`records.ts` (recorde por nível), `menu.ts`, `option.ts` (opção persistida), `clock.ts` (cronômetro), `gameStore.ts`
(persistência), `storage.ts` (`localStorage` tolerante a falha, escopo por usuário), `theme.ts`, `catalog.ts`.
`ui.ts` apenas reexporta `dom`, `dialog`, `menu` e `records`.

## Como adicionar um jogo
1. Crie `src/games/<jogo>/domain.ts` (regras puras, com testes) e `index.ts`.
2. No `index.ts`, monte uma `GameDefinition` e exporte `createGame(def)`. A chave de progresso segue `jj.<jogo>.game.v1`
   (use `jj.` no início: é o que `storage.ts` isola por usuário).
3. Em `src/core/catalog.ts`, ligue o `load` da entrada do jogo: `load: () => import('../games/<jogo>').then((m) => m.<modulo>)`
   (a entrada sem `load` aparece como "Em breve").
4. Escreva os testes e rode `npm run typecheck` e `npm test`.

## Progresso salvo
Tudo em `localStorage`, tolerante a falha. Partida: `jj.<jogo>.game.v1` (ex.: `jj.sudoku.game.v1`, `jj.2048.game.v1`);
preferências/tema: `jj.prefs.v1` (inclui `popup`, `autoNotes` e, no Sudoku, `hlMatch`/`hlLines`/`hlBox` — os
interruptores da engrenagem ⚙ de destaques; ausentes em prefs antigas = ligados). Com usuário logado a chave real vira `jj.u.<usuario>.<resto>`, então cada conta tem
o seu progresso. Mudar uma chave ou formato apaga o progresso dos jogadores: mantenha ambos estáveis.

## Testes
```bash
npx vitest run               # todos
rtk proxy npx vitest run     # no ambiente do owner (RTK filtra a saída do vitest)
```
Cobrem domínios dos jogos, GameShell (menu, continuar, fim, voltar), armazenamento, Worker (login, sessão, `/admin`, KV).
