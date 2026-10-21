import type { ClientModule, ClientSurface } from 'claude-code'

import { drawBoard } from './grid'
import type { GlyphSize } from './grid'
import { RANK_LABEL_COLUMNS, squareColumnsFor, squareRowsFor } from './layout'
import { BOARD_COLORS, squareColor } from './palette'

export type BoardProps = {
  squares: string[]
  last: number[]
  targets: Record<string, number[]>
  isLocked: boolean
}

type BoardState = {
  cursor: number
  selected: number | null
  usesKeys: boolean
  live: { props: BoardProps; squareRows: number }
}

const START_CURSOR = 12
const TARGET_MARK = '•'
const GLYPH_SIZES: readonly GlyphSize[] = ['body', 'body', 'heading', 'title']
const STEPS: Partial<Record<string, readonly [number, number]>> = {
  up: [0, 1],
  down: [0, -1],
  left: [-1, 0],
  right: [1, 0],
}
const CHOOSE_KEYS = ['return', ' ']

const squareAt = (x: number, y: number, squareRows: number) => {
  const file = Math.floor((x - RANK_LABEL_COLUMNS) / squareColumnsFor(squareRows))
  const rank = 7 - Math.floor(y / squareRows)

  return x < RANK_LABEL_COLUMNS || file > 7 || rank < 0 || rank > 7 ? null : rank * 8 + file
}

const stepped = (square: number, [files, ranks]: readonly [number, number]) => {
  const file = Math.min(7, Math.max(0, (square % 8) + files))
  const rank = Math.min(7, Math.max(0, Math.floor(square / 8) + ranks))

  return rank * 8 + file
}

const choose = (surface: ClientSurface<BoardState>, square: number, usesKeys: boolean) => {
  const now = surface.state
  if (!now) {
    return
  }

  const { targets, isLocked } = now.live.props
  const reachable = now.selected === null ? [] : (targets[String(now.selected)] ?? [])

  if (!isLocked && now.selected !== null && reachable.includes(square)) {
    surface.post({ move: [now.selected, square] })
    surface.setState({ ...now, cursor: square, selected: null, usesKeys })
    return
  }

  const canSelect = !isLocked && targets[String(square)] !== undefined && now.selected !== square
  surface.setState({ ...now, cursor: square, selected: canSelect ? square : null, usesKeys })
}

const ChessBoard: ClientModule<BoardProps, BoardState> = (props, surface) => {
  const squareRows = squareRowsFor(surface.columns, surface.rows)
  const glyphSize = GLYPH_SIZES[Math.min(squareRows, GLYPH_SIZES.length - 1)] ?? 'body'

  if (surface.state === undefined) {
    surface.onPointer(event => {
      const live = surface.state?.live.squareRows ?? 1
      const square = event.type === 'down' && event.button === 'left' ? squareAt(event.x, event.y, live) : null
      if (square !== null) {
        choose(surface, square, false)
      }
    })
    surface.onKey(event => {
      const now = surface.state
      const step = STEPS[event.key]
      if (!now) {
        return
      }
      if (step) {
        surface.setState({ ...now, cursor: stepped(now.cursor, step), usesKeys: true })
      } else if (CHOOSE_KEYS.includes(event.key)) {
        choose(surface, now.cursor, true)
      }
    })
    surface.setState({ cursor: START_CURSOR, selected: null, usesKeys: false, live: { props, squareRows } })
  }

  const state = surface.state ?? { cursor: START_CURSOR, selected: null, usesKeys: false, live: { props, squareRows } }
  state.live.props = props
  state.live.squareRows = squareRows

  const selected = props.isLocked ? null : state.selected
  const reachable = selected === null ? [] : (props.targets[String(selected)] ?? [])

  const colorOf = (square: number, rank: number, file: number) =>
    state.usesKeys && state.cursor === square
      ? BOARD_COLORS.cursor
      : square === selected
        ? BOARD_COLORS.selected
        : reachable.includes(square)
          ? BOARD_COLORS.target
          : squareColor((rank + file) % 2 === 1, props.last.includes(square))

  return drawBoard(surface.elements, {
    squareRows,
    glyphSize,
    glyphOf: square => props.squares[square] || (reachable.includes(square) ? TARGET_MARK : ''),
    colorOf,
  })
}

export default ChessBoard
