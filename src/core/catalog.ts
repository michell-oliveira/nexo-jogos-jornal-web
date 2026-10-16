import type { GameModule } from './types';

export interface CatalogEntry {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Ausente = jogo ainda não portado do app Android (aparece como "Em breve"). */
  load?: () => Promise<GameModule>;
}

/** Mesma lista de jogos do app Android `old_games`; cada lote de port liga o `load` do seu jogo. */
export const CATALOG: CatalogEntry[] = [
  { id: 'sudoku', title: 'Sudoku', description: 'Complete a grade 9×9 sem repetir números.', icon: '▦', load: () => import('../games/sudoku').then((m) => m.sudoku) },
  { id: '2048', title: '2048', description: 'Deslize e combine as peças até chegar ao 2048.', icon: '🔢', load: () => import('../games/g2048').then((m) => m.game2048) },
  { id: 'lightsout', title: 'Lights Out', description: 'Apague todas as luzes do tabuleiro.', icon: '💡', load: () => import('../games/lightsout').then((m) => m.lightsout) },
  { id: 'minesweeper', title: 'Campo Minado', description: 'Abra as casas sem pisar em nenhuma mina.', icon: '💣', load: () => import('../games/minesweeper').then((m) => m.minesweeper) },
  { id: 'takuzu', title: 'Takuzu', description: 'Preencha com 0 e 1 sem trincas nem linhas repetidas.', icon: '⚫', load: () => import('../games/takuzu').then((m) => m.takuzu) },
  { id: 'numbermatch', title: 'Number Match', description: 'Elimine pares de números iguais ou que somam 10.', icon: '🔗', load: () => import('../games/numbermatch').then((m) => m.numbermatch) },
  { id: 'termo', title: 'Termo', description: 'Descubra a palavra de 5 letras em 6 tentativas.', icon: '🟩', load: () => import('../games/termo').then((m) => m.termo) },
  { id: 'hangman', title: 'Forca', description: 'Adivinhe a palavra antes de acabarem as tentativas.', icon: '🔤', load: () => import('../games/hangman').then((m) => m.hangman) },
  { id: 'anagram', title: 'Anagrama', description: 'Reordene as letras e descubra a palavra.', icon: '🔀', load: () => import('../games/anagram').then((m) => m.anagram) },
  { id: 'cryptogram', title: 'Criptograma', description: 'Decifre a frase em que cada letra virou um símbolo.', icon: '🔐', load: () => import('../games/cryptogram').then((m) => m.cryptogram) },
  { id: 'wordcipher', title: 'Palavras Cifradas', description: 'Decifre as palavras escondidas na cifra.', icon: '🗝️', load: () => import('../games/wordcipher').then((m) => m.wordcipher) },
];
