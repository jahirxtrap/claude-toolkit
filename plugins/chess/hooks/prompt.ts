import { parseMove, squareName, toFen, uciOf } from './chess'
import type { Move, Piece, Position } from './chess'
import { FILE_INDEXES, FILE_LETTERS, RANKS } from './layout'

const MAX_THINKING_WORDS = 120
const MAX_REMARK_LENGTH = 200
const EMPTY_SQUARE = '.'
const PIECE_ORDER = 'kqrbnp'

const MOVE_LINE = /^\s*MOVE:\s*(\S+)/im
const SAY_LINE = /^\s*SAY:\s*(.+)$/im
const UCI_TOKEN = /[a-h][1-8][a-h][1-8][qrbn]?/gi

export const systemPromptFor = (languageName: string) =>
  [
    'You are Claude, playing a friendly game of chess as Black against the user.',
    'Think briefly before you move: read the board, check what White threatens (checks, captures,',
    'mating ideas such as an open back rank) and whether your king has an escape square, then',
    `compare two or three candidate moves. Keep your thinking under ${MAX_THINKING_WORDS} words.`,
    'Then end with exactly these two lines and nothing after them:',
    'MOVE: <your move in UCI notation, taken from the list of legal moves>',
    `SAY: <one short, friendly sentence to the user about your move, in ${languageName}>`,
  ].join('\n')

const letterOf = (piece: Piece) => (piece.color === 'w' ? piece.type.toUpperCase() : piece.type)

export const diagramOf = (position: Position) =>
  [
    ...RANKS.map(
      rank =>
        `${rank + 1} ${FILE_INDEXES.map(file => {
          const piece = position.board[rank * 8 + file]
          return piece ? letterOf(piece) : EMPTY_SQUARE
        }).join(' ')}`,
    ),
    `  ${FILE_LETTERS.join(' ')}`,
  ].join('\n')

const piecesOf = (position: Position, color: Piece['color']) =>
  position.board
    .flatMap((piece, square) =>
      piece?.color === color ? [{ type: piece.type, name: `${piece.type.toUpperCase()}${squareName(square)}` }] : [],
    )
    .sort((first, second) => PIECE_ORDER.indexOf(first.type) - PIECE_ORDER.indexOf(second.type))
    .map(piece => piece.name)
    .join(' ')

export const promptFor = (position: Position, history: string, legal: readonly Move[]) =>
  [
    'Board (White at the bottom; uppercase is White, lowercase is Black, a dot is empty):',
    diagramOf(position),
    '',
    `Black pieces (yours): ${piecesOf(position, 'b')}`,
    `White pieces: ${piecesOf(position, 'w')}`,
    `FEN: ${toFen(position)}`,
    `Moves so far: ${history === '' ? 'none' : history}`,
    `Legal moves for Black (UCI): ${legal.map(uciOf).join(' ')}`,
  ].join('\n')

export const readReply = (position: Position, reply: string) => {
  const named = MOVE_LINE.exec(reply)?.[1]
  const fromLine = named === undefined ? null : parseMove(position, named)
  const tokens = reply.match(UCI_TOKEN) ?? []
  const lastLegal = tokens
    .map(token => parseMove(position, token))
    .filter(move => move !== null)
    .at(-1)
  const remark = SAY_LINE.exec(reply)?.[1]?.trim().slice(0, MAX_REMARK_LENGTH) ?? null

  return { move: fromLine ?? lastLegal ?? null, remark: remark === '' ? null : remark }
}
