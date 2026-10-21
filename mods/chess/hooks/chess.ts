export type Color = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type Piece = { color: Color; type: PieceType }
export type Castling = { wk: boolean; wq: boolean; bk: boolean; bq: boolean }

export type Position = {
  board: readonly (Piece | null)[]
  turn: Color
  castling: Castling
  enPassant: number | null
  halfmove: number
  fullmove: number
}

export type Move = {
  from: number
  to: number
  piece: PieceType
  captured: PieceType | null
  promotion: PieceType | null
  castle: 'k' | 'q' | null
  isEnPassant: boolean
}

export type GameStatus = 'playing' | 'checkmate' | 'stalemate' | 'fifty-moves' | 'insufficient-material'

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const FILES = 'abcdefgh'
const PROMOTIONS: readonly PieceType[] = ['q', 'r', 'b', 'n']
const KNIGHT_STEPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]] as const
const KING_STEPS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const
const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const
const LINES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const SLIDES: Partial<Record<PieceType, readonly (readonly [number, number])[]>> = {
  b: DIAGONALS,
  r: LINES,
  q: [...DIAGONALS, ...LINES],
}
const CORNER_RIGHTS: Partial<Record<number, keyof Castling>> = { 0: 'wq', 7: 'wk', 56: 'bq', 63: 'bk' }

export const fileOf = (square: number) => square % 8
export const rankOf = (square: number) => Math.floor(square / 8)
export const opponent = (color: Color): Color => (color === 'w' ? 'b' : 'w')
export const squareName = (square: number) => `${FILES.charAt(fileOf(square))}${rankOf(square) + 1}`
export const uciOf = (move: Move) => `${squareName(move.from)}${squareName(move.to)}${move.promotion ?? ''}`

const forward = (color: Color) => (color === 'w' ? 1 : -1)

const step = (square: number, files: number, ranks: number) => {
  const file = fileOf(square) + files
  const rank = rankOf(square) + ranks

  return file < 0 || file > 7 || rank < 0 || rank > 7 ? null : rank * 8 + file
}

export const squareFrom = (name: string) => {
  const file = FILES.indexOf(name.charAt(0))
  const rank = Number(name.charAt(1)) - 1

  return name.length === 2 && file >= 0 && rank >= 0 && rank <= 7 ? rank * 8 + file : null
}

export const parseFen = (fen: string): Position => {
  const [placement = '', turn = 'w', castling = '-', enPassant = '-', halfmove = '0', fullmove = '1'] = fen.trim().split(/\s+/)
  const board: (Piece | null)[] = Array.from({ length: 64 }, () => null)

  placement.split('/').forEach((row, index) => {
    let file = 0
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char)
        continue
      }
      board[(7 - index) * 8 + file] = {
        color: char === char.toUpperCase() ? 'w' : 'b',
        type: char.toLowerCase() as PieceType,
      }
      file += 1
    }
  })

  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling: {
      wk: castling.includes('K'),
      wq: castling.includes('Q'),
      bk: castling.includes('k'),
      bq: castling.includes('q'),
    },
    enPassant: enPassant === '-' ? null : squareFrom(enPassant),
    halfmove: Number(halfmove),
    fullmove: Number(fullmove),
  }
}

export const toFen = (position: Position) => {
  const rows = Array.from({ length: 8 }, (_, index) => {
    const rank = 7 - index
    let row = ''
    let empty = 0

    for (let file = 0; file < 8; file += 1) {
      const piece = position.board[rank * 8 + file]
      if (!piece) {
        empty += 1
        continue
      }
      row += `${empty > 0 ? empty : ''}${piece.color === 'w' ? piece.type.toUpperCase() : piece.type}`
      empty = 0
    }

    return `${row}${empty > 0 ? empty : ''}`
  })
  const { wk, wq, bk, bq } = position.castling
  const rights = `${wk ? 'K' : ''}${wq ? 'Q' : ''}${bk ? 'k' : ''}${bq ? 'q' : ''}` || '-'
  const enPassant = position.enPassant === null ? '-' : squareName(position.enPassant)

  return [rows.join('/'), position.turn, rights, enPassant, position.halfmove, position.fullmove].join(' ')
}

export const isAttacked = (board: Position['board'], square: number, by: Color) => {
  const holds = (target: number | null, types: string) => {
    const piece = target === null ? null : board[target]

    return !!piece && piece.color === by && types.includes(piece.type)
  }
  const ray = (directions: readonly (readonly [number, number])[], types: string) =>
    directions.some(([files, ranks]) => {
      let target = step(square, files, ranks)
      while (target !== null) {
        const piece = board[target]
        if (piece) {
          return piece.color === by && types.includes(piece.type)
        }
        target = step(target, files, ranks)
      }
      return false
    })
  const pawnRank = -forward(by)

  return (
    holds(step(square, -1, pawnRank), 'p') ||
    holds(step(square, 1, pawnRank), 'p') ||
    KNIGHT_STEPS.some(([files, ranks]) => holds(step(square, files, ranks), 'n')) ||
    KING_STEPS.some(([files, ranks]) => holds(step(square, files, ranks), 'k')) ||
    ray(DIAGONALS, 'bq') ||
    ray(LINES, 'rq')
  )
}

export const inCheck = (position: Position, color: Color = position.turn) => {
  const king = position.board.findIndex(piece => piece?.color === color && piece.type === 'k')

  return king >= 0 && isAttacked(position.board, king, opponent(color))
}

const moveOf = (position: Position, from: number, to: number, extra: Partial<Move> = {}): Move => ({
  from,
  to,
  piece: position.board[from]?.type ?? 'p',
  captured: position.board[to]?.type ?? null,
  promotion: null,
  castle: null,
  isEnPassant: false,
  ...extra,
})

const pawnMoves = (position: Position, from: number): Move[] => {
  const color = position.turn
  const direction = forward(color)
  const lastRank = color === 'w' ? 7 : 0
  const moves: Move[] = []
  const add = (to: number, extra: Partial<Move> = {}) => {
    if (rankOf(to) === lastRank) {
      for (const promotion of PROMOTIONS) {
        moves.push(moveOf(position, from, to, { ...extra, promotion }))
      }
    } else {
      moves.push(moveOf(position, from, to, extra))
    }
  }
  const one = step(from, 0, direction)

  if (one !== null && !position.board[one]) {
    add(one)
    const two = step(from, 0, 2 * direction)
    if (rankOf(from) === (color === 'w' ? 1 : 6) && two !== null && !position.board[two]) {
      add(two)
    }
  }

  for (const side of [-1, 1]) {
    const to = step(from, side, direction)
    if (to === null) {
      continue
    }
    const target = position.board[to]
    if (target && target.color !== color) {
      add(to)
    } else if (!target && to === position.enPassant) {
      add(to, { captured: 'p', isEnPassant: true })
    }
  }

  return moves
}

const pieceMoves = (position: Position, from: number): Move[] => {
  const piece = position.board[from]
  if (!piece) {
    return []
  }

  if (piece.type === 'n' || piece.type === 'k') {
    return (piece.type === 'n' ? KNIGHT_STEPS : KING_STEPS)
      .map(([files, ranks]) => step(from, files, ranks))
      .filter((to): to is number => to !== null && position.board[to]?.color !== piece.color)
      .map(to => moveOf(position, from, to))
  }

  const moves: Move[] = []
  for (const [files, ranks] of SLIDES[piece.type] ?? []) {
    let to = step(from, files, ranks)
    while (to !== null) {
      const target = position.board[to]
      if (target?.color === piece.color) {
        break
      }
      moves.push(moveOf(position, from, to))
      if (target) {
        break
      }
      to = step(to, files, ranks)
    }
  }

  return moves
}

const castlingMoves = (position: Position): Move[] => {
  const color = position.turn
  const home = color === 'w' ? 0 : 56
  const king = home + 4
  const kingPiece = position.board[king]

  if (kingPiece?.type !== 'k' || kingPiece.color !== color || inCheck(position, color)) {
    return []
  }

  const enemy = opponent(color)
  const sides = [
    { castle: 'k', right: color === 'w' ? 'wk' : 'bk', rook: 7, empty: [5, 6], safe: [5, 6], target: 6 },
    { castle: 'q', right: color === 'w' ? 'wq' : 'bq', rook: 0, empty: [1, 2, 3], safe: [3, 2], target: 2 },
  ] as const

  return sides
    .filter(side => {
      const rook = position.board[home + side.rook]

      return (
        position.castling[side.right] &&
        rook?.type === 'r' &&
        rook.color === color &&
        side.empty.every(offset => !position.board[home + offset]) &&
        side.safe.every(offset => !isAttacked(position.board, home + offset, enemy))
      )
    })
    .map(side => moveOf(position, king, home + side.target, { castle: side.castle }))
}

const pseudoMoves = (position: Position): Move[] => [
  ...position.board.flatMap((piece, from) => {
    if (!piece || piece.color !== position.turn) {
      return []
    }
    return piece.type === 'p' ? pawnMoves(position, from) : pieceMoves(position, from)
  }),
  ...castlingMoves(position),
]

export const applyMove = (position: Position, move: Move): Position => {
  const board = [...position.board]
  const color = position.turn
  const piece = board[move.from] ?? { color, type: move.piece }

  board[move.to] = move.promotion ? { color, type: move.promotion } : piece
  board[move.from] = null

  if (move.isEnPassant) {
    board[move.to - 8 * forward(color)] = null
  }

  if (move.castle) {
    const home = color === 'w' ? 0 : 56
    const [rookFrom, rookTo] = move.castle === 'k' ? [home + 7, home + 5] : [home, home + 3]
    board[rookTo] = board[rookFrom] ?? null
    board[rookFrom] = null
  }

  const castling = { ...position.castling }
  if (piece.type === 'k') {
    castling[color === 'w' ? 'wk' : 'bk'] = false
    castling[color === 'w' ? 'wq' : 'bq'] = false
  }
  for (const square of [move.from, move.to]) {
    const right = CORNER_RIGHTS[square]
    if (right) {
      castling[right] = false
    }
  }

  return {
    board,
    turn: opponent(color),
    castling,
    enPassant: piece.type === 'p' && Math.abs(move.to - move.from) === 16 ? (move.from + move.to) / 2 : null,
    halfmove: piece.type === 'p' || move.captured ? 0 : position.halfmove + 1,
    fullmove: position.fullmove + (color === 'b' ? 1 : 0),
  }
}

export const legalMoves = (position: Position): Move[] =>
  pseudoMoves(position).filter(move => !inCheck(applyMove(position, move), position.turn))

export const statusOf = (position: Position): GameStatus => {
  if (legalMoves(position).length === 0) {
    return inCheck(position) ? 'checkmate' : 'stalemate'
  }
  if (position.halfmove >= 100) {
    return 'fifty-moves'
  }
  const rest = position.board.filter((piece): piece is Piece => piece !== null && piece.type !== 'k')
  const lone = rest[0]
  if (rest.length === 0 || (rest.length === 1 && lone !== undefined && (lone.type === 'n' || lone.type === 'b'))) {
    return 'insufficient-material'
  }

  return 'playing'
}

const sanBody = (position: Position, move: Move) => {
  if (move.castle) {
    return move.castle === 'k' ? 'O-O' : 'O-O-O'
  }

  const capture = move.captured === null ? '' : 'x'

  if (move.piece === 'p') {
    const origin = capture ? FILES.charAt(fileOf(move.from)) : ''
    const promotion = move.promotion ? `=${move.promotion.toUpperCase()}` : ''

    return `${origin}${capture}${squareName(move.to)}${promotion}`
  }

  const rivals = legalMoves(position).filter(
    other => other.piece === move.piece && other.to === move.to && other.from !== move.from,
  )
  const sharesFile = rivals.some(other => fileOf(other.from) === fileOf(move.from))
  const sharesRank = rivals.some(other => rankOf(other.from) === rankOf(move.from))
  const origin =
    rivals.length === 0
      ? ''
      : !sharesFile
        ? FILES.charAt(fileOf(move.from))
        : !sharesRank
          ? String(rankOf(move.from) + 1)
          : squareName(move.from)

  return `${move.piece.toUpperCase()}${origin}${capture}${squareName(move.to)}`
}

export const toSan = (position: Position, move: Move) => {
  const after = applyMove(position, move)
  const suffix = inCheck(after) ? (legalMoves(after).length === 0 ? '#' : '+') : ''

  return `${sanBody(position, move)}${suffix}`
}

const normalize = (text: string) =>
  text
    .trim()
    .replace(/[+#!?\s]/g, '')
    .replace(/0/g, 'O')
    .replace(/^o-o-o$/i, 'O-O-O')
    .replace(/^o-o$/i, 'O-O')

const loose = (san: string) => san.replace(/[x=]/g, '')

export const parseMove = (position: Position, text: string): Move | null => {
  const legal = legalMoves(position)
  const plain = normalize(text)
  const uci = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(plain)

  if (uci) {
    const [, from = '', to = '', promotion] = uci
    const matches = legal.filter(
      move => squareName(move.from) === from.toLowerCase() && squareName(move.to) === to.toLowerCase(),
    )
    const wanted = promotion?.toLowerCase() ?? (matches.some(move => move.promotion) ? 'q' : null)

    return matches.find(move => move.promotion === wanted) ?? null
  }

  const candidates = [plain, /^[nrqk]/.test(plain) ? `${plain.charAt(0).toUpperCase()}${plain.slice(1)}` : plain]

  return (
    legal.find(move => {
      const san = loose(sanBody(position, move))
      const unnamedQueen = move.promotion === 'q' ? san.slice(0, -1) : null

      return candidates.some(candidate => loose(candidate) === san || loose(candidate) === unnamedQueen)
    }) ?? null
  )
}

export const replay = (history: readonly string[]) => {
  let position = parseFen(START_FEN)
  let lastMove: Move | null = null
  const sans: string[] = []

  for (const text of history) {
    const move = parseMove(position, text)
    if (!move) {
      break
    }
    sans.push(toSan(position, move))
    position = applyMove(position, move)
    lastMove = move
  }

  return { position, sans, lastMove }
}
