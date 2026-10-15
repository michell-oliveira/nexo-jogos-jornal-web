# Jogos de Jornal — Sudoku (web)

Sudoku no navegador: Vite + TypeScript puro (sem framework), ~6 KB gzip de JS.
Motor portado do app Android `old_games` (`games/sudoku/domain`).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes do motor (vitest)
npm run build      # tsc --noEmit + vite build -> dist/
```

## Estrutura
- `src/domain/` — solver, gerador (solução única), destaque, estado da partida (sem DOM, testado).
- `src/theme.ts` — 13 temas, mesmas paletas do Android (`AppTheme.kt`); aplicados como CSS variables.
- `src/storage.ts` — preferências e partida salva em `localStorage` (tolerante a falha).
- `src/main.ts` — tela e eventos.
- `docs/mockup-sudoku.html` — mockup inicial (histórico).

## Comportamento
- Clique numa célula vazia: abre o teclado flutuante (flag "Abrir teclado ao clicar na célula"). Flag desligada: linha 1–9 abaixo do quadro.
- Selecionar uma célula com número destaca todas as células iguais e as linhas/colunas/blocos que o contêm.
- Teclado físico: 1–9, Backspace/Delete, setas, Esc.
