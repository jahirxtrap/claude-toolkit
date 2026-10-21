import type { Language } from '../types'

export const LANGUAGES: readonly { value: Language; label: string; name: string }[] = [
  { value: 'en', label: 'English', name: 'English' },
  { value: 'es', label: 'Español', name: 'Spanish' },
]

export const DEFAULT_LANGUAGE: Language = 'en'

const ENGLISH = {
  paneTitle: 'Chess',
  boardOpened: 'Board open.',
  boardWaiting: 'The board is waiting: {reason}',
  yourTurn: 'Your move: you play White.',
  yourTurnInCheck: 'Check! Your move: you play White.',
  claudesTurn: "Claude's move.",
  thinking: 'Claude is thinking…',
  youWin: 'Checkmate! You win.',
  claudeWins: 'Checkmate. Claude wins.',
  stalemate: 'Draw by stalemate.',
  fiftyMoves: 'Draw by the fifty-move rule.',
  insufficientMaterial: 'Draw: not enough material to mate.',
  youOpen: 'You open.',
  clickHint: 'Click a piece, then its square. Keyboard: arrows and Enter.',
  phoneHint: 'Open the board on a computer to play.',
  moveLabel: 'Your move',
  movePlaceholder: 'e4, Nf3, O-O or e2e4',
  moveSubmit: 'play',
  newGame: 'New game',
  undo: 'Undo',
  askClaude: 'Ask Claude to move',
  languageLabel: 'Language',
  gameOver: 'The game is over: start a new one.',
  waitForClaude: 'Wait for Claude to move.',
  illegalMove: '“{move}” is not a legal move.',
  noAnswer: 'Claude did not answer ({reason}).',
  noValidMove: 'Claude did not give a valid move.',
  claudeSays: 'Claude: {remark}',
}

export type MessageKey = keyof typeof ENGLISH

const SPANISH: Record<MessageKey, string> = {
  paneTitle: 'Ajedrez',
  boardOpened: 'Tablero abierto.',
  boardWaiting: 'El tablero quedó a la espera: {reason}',
  yourTurn: 'Te toca: juegas con blancas.',
  yourTurnInCheck: '¡Jaque! Te toca: juegas con blancas.',
  claudesTurn: 'Le toca a Claude.',
  thinking: 'Claude está pensando…',
  youWin: '¡Jaque mate! Ganas tú.',
  claudeWins: 'Jaque mate. Gana Claude.',
  stalemate: 'Tablas por ahogado.',
  fiftyMoves: 'Tablas por la regla de los 50 movimientos.',
  insufficientMaterial: 'Tablas: no queda material para dar mate.',
  youOpen: 'Abres tú.',
  clickHint: 'Pulsa una pieza y luego su destino. Con el teclado: flechas y Enter.',
  phoneHint: 'Abre el tablero en un ordenador para jugar.',
  moveLabel: 'Tu jugada',
  movePlaceholder: 'e4, Nf3, O-O o e2e4',
  moveSubmit: 'jugar',
  newGame: 'Nueva partida',
  undo: 'Deshacer',
  askClaude: 'Pedir jugada a Claude',
  languageLabel: 'Idioma',
  gameOver: 'La partida terminó: empieza una nueva.',
  waitForClaude: 'Espera a que juegue Claude.',
  illegalMove: '«{move}» no es una jugada legal.',
  noAnswer: 'Claude no respondió ({reason}).',
  noValidMove: 'Claude no devolvió una jugada válida.',
  claudeSays: 'Claude: {remark}',
}

const MESSAGES: Record<Language, Record<MessageKey, string>> = { en: ENGLISH, es: SPANISH }

export const isLanguage = (value: unknown): value is Language => LANGUAGES.some(language => language.value === value)

export const isMessageKey = (value: string): value is MessageKey => Object.hasOwn(ENGLISH, value)

export const languageName = (language: Language) =>
  LANGUAGES.find(candidate => candidate.value === language)?.name ?? 'English'

export const translate = (language: Language, key: MessageKey, params: Readonly<Record<string, string>> = {}) =>
  Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), MESSAGES[language][key])
