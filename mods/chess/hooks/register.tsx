import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, RenderSurface } from 'claude-code'

import type { Language, Notice } from '../types'
import type { BoardProps } from './board'
import { inCheck, legalMoves, parseMove, replay, squareName, statusOf, uciOf } from './chess'
import type { Color, GameStatus, PieceType, Position } from './chess'
import { drawBoard } from './grid'
import { boardColumnsFor, FILE_LABEL_ROWS, squareRowsFor } from './layout'
import { DEFAULT_LANGUAGE, isLanguage, isMessageKey, LANGUAGES, languageName, translate } from './locales'
import type { MessageKey } from './locales'
import { squareColor } from './palette'
import { promptFor, readReply, systemPromptFor } from './prompt'

const PANE = 'chess'
const BOARD_KEY = 'board'
const GAME_KEY = 'game'
const LANGUAGE_KEY = 'language'
const PLAYER: Color = 'w'
const MODEL = 'sonnet'
const EFFORT = 'low'
const ATTEMPTS = 2
const REPLY_TOKENS = 700
const REPLY_TIMEOUT_MS = 45_000
const HISTORY_ROWS = 10
const SIDE_COLUMNS = 30
const SIDE_GAP = 3
const CONTROL_ROWS = 3
const STATIC_SQUARE_ROWS = 1

const TEXT_PRESENTATION = String.fromCodePoint(0xfe0e)

const GLYPHS: Record<Color, Record<PieceType, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
}

const DRAW_KEYS: Record<Exclude<GameStatus, 'playing' | 'checkmate'>, MessageKey> = {
  stalemate: 'stalemate',
  'fifty-moves': 'fiftyMoves',
  'insufficient-material': 'insufficientMaterial',
}

const moves = atom({ plugin: 'chess', key: 'moves' } as const, [] as string[])
const isThinking = atom({ plugin: 'chess', key: 'isThinking' } as const, false)
const notice = atom({ plugin: 'chess', key: 'notice' } as const, null as Notice | null)
const remark = atom({ plugin: 'chess', key: 'remark' } as const, null as string | null)
const language = atom({ plugin: 'chess', key: 'language' } as const, DEFAULT_LANGUAGE as Language)

let generation = 0

type Game = ReturnType<typeof replay>

const movePairs = (sans: readonly string[]) =>
  Array.from({ length: Math.ceil(sans.length / 2) }, (_, index) =>
    `${index + 1}. ${sans[index * 2] ?? ''} ${sans[index * 2 + 1] ?? ''}`.trimEnd(),
  )

const say = (key: MessageKey, params: Record<string, string> = {}): Notice => ({ key, params })

const noticeText = (current: Language, shown: Notice) =>
  isMessageKey(shown.key) ? translate(current, shown.key, shown.params) : shown.key

const saveMoves = async ($: EngineInterface, list: string[]) => {
  await update($, moves, () => list)
  await $.store.set(GAME_KEY, list)
}

const askClaude = async ($: EngineInterface, game: Game) => {
  const legal = legalMoves(game.position)
  const system = systemPromptFor(languageName(await read($, language)))
  const prompt = promptFor(game.position, movePairs(game.sans).join(' '), legal)

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const answered = await $.model.complete({
      model: MODEL,
      effort: EFFORT,
      system,
      prompt,
      maxTokens: REPLY_TOKENS,
      timeoutMs: REPLY_TIMEOUT_MS,
    })

    if (!answered.isAnswered) {
      return { failure: say('noAnswer', { reason: answered.reason }) }
    }

    const reply = readReply(game.position, answered.text)
    if (reply.move) {
      return { move: reply.move, remark: reply.remark }
    }
  }

  return { failure: say('noValidMove') }
}

const claudeMove = async ($: EngineInterface) => {
  const history = await read($, moves)
  const game = replay(history)

  if (game.position.turn === PLAYER || statusOf(game.position) !== 'playing') {
    return
  }

  generation += 1
  const request = generation
  await update($, isThinking, () => true)
  await update($, notice, () => null)

  try {
    const answer = await askClaude($, game)
    if (request !== generation) {
      return
    }
    if ('failure' in answer) {
      await update($, notice, () => answer.failure)
      return
    }
    await update($, remark, () => answer.remark)
    await saveMoves($, [...history, uciOf(answer.move)])
  } finally {
    if (request === generation) {
      await update($, isThinking, () => false)
    }
  }
}

const playMove = async ($: EngineInterface, text: string) => {
  const history = await read($, moves)
  const game = replay(history)
  const refuse = (shown: Notice) => update($, notice, () => shown)

  if (statusOf(game.position) !== 'playing') {
    await refuse(say('gameOver'))
    return
  }
  if (game.position.turn !== PLAYER || (await read($, isThinking))) {
    await refuse(say('waitForClaude'))
    return
  }

  const move = parseMove(game.position, text)
  if (!move) {
    await refuse(say('illegalMove', { move: text.trim() }))
    return
  }

  await update($, notice, () => null)
  await update($, remark, () => null)
  await saveMoves($, [...history, uciOf(move)])
  void claudeMove($)
}

const resetThinking = async ($: EngineInterface) => {
  generation += 1
  await update($, isThinking, () => false)
  await update($, notice, () => null)
  await update($, remark, () => null)
}

const newGame = async ($: EngineInterface) => {
  await resetThinking($)
  await saveMoves($, [])
}

const undo = async ($: EngineInterface) => {
  const history = await read($, moves)
  const drop = history.length % 2 === 1 ? 1 : 2

  await resetThinking($)
  await saveMoves($, history.slice(0, Math.max(0, history.length - drop)))
}

const openBoard = async ($: EngineInterface) =>
  $.ui.open({ id: PANE, title: translate(await read($, language), 'paneTitle') })

const chooseLanguage = async ($: EngineInterface, value: string) => {
  if (!isLanguage(value)) {
    return
  }

  await update($, language, () => value)
  await $.store.set(LANGUAGE_KEY, value)
  await openBoard($)
}

const headlineKeyOf = (position: Position, status: GameStatus, thinking: boolean): MessageKey => {
  if (status === 'checkmate') {
    return position.turn === PLAYER ? 'claudeWins' : 'youWin'
  }
  if (status !== 'playing') {
    return DRAW_KEYS[status]
  }
  if (thinking) {
    return 'thinking'
  }
  if (position.turn !== PLAYER) {
    return 'claudesTurn'
  }

  return inCheck(position) ? 'yourTurnInCheck' : 'yourTurn'
}

const glyphsOf = (position: Position) =>
  position.board.map(piece => (piece ? `${GLYPHS[piece.color][piece.type]}${TEXT_PRESENTATION}` : ''))

const lastSquaresOf = (game: Game) => (game.lastMove ? [game.lastMove.from, game.lastMove.to] : [])

const boardPropsOf = (game: Game, isLocked: boolean): BoardProps => {
  const targets: Record<string, number[]> = {}

  if (!isLocked) {
    for (const move of legalMoves(game.position)) {
      const reachable = targets[String(move.from)] ?? []
      if (!reachable.includes(move.to)) {
        targets[String(move.from)] = [...reachable, move.to]
      }
    }
  }

  return { squares: glyphsOf(game.position), last: lastSquaresOf(game), targets, isLocked }
}

const boardClient = ($: EngineInterface, e: RenderInput<'Pane', 'terminal' | 'desktop'>, props: BoardProps) => {
  const { Client } = $.ui.resolve(e)
  const isSideBySide = e.props.bodyColumns >= boardColumnsFor(1) + SIDE_GAP + SIDE_COLUMNS
  const columns = isSideBySide ? e.props.bodyColumns - SIDE_GAP - SIDE_COLUMNS : e.props.bodyColumns
  const squareRows = squareRowsFor(columns, e.props.scroll.bodyRows - CONTROL_ROWS)

  return (
    <Client
      key={BOARD_KEY}
      module="./board.tsx"
      props={props}
      width={boardColumnsFor(squareRows)}
      height={8 * squareRows + FILE_LABEL_ROWS}
    />
  )
}

const staticBoard = ($: EngineInterface, e: RenderInput<'Pane'>, game: Game) => {
  const squares = glyphsOf(game.position)
  const last = lastSquaresOf(game)

  return drawBoard($.ui.resolve(e), {
    squareRows: STATIC_SQUARE_ROWS,
    glyphSize: 'body',
    glyphOf: square => squares[square] ?? '',
    colorOf: (square, rank, file) => squareColor((rank + file) % 2 === 1, last.includes(square)),
  })
}

const moveInput = ($: EngineInterface, e: RenderInput<'Pane', Exclude<RenderSurface, 'mobile'>>, current: Language) => {
  const { Input } = $.ui.resolve(e)

  return (
    <Input
      key="move"
      label={translate(current, 'moveLabel')}
      value=""
      placeholder={translate(current, 'movePlaceholder')}
      submitLabel={translate(current, 'moveSubmit')}
      onSubmit={value => void playMove($, value)}
    />
  )
}

const languageSelect = ($: EngineInterface, e: RenderInput<'Pane', Exclude<RenderSurface, 'mobile'>>, current: Language) => {
  const { Select } = $.ui.resolve(e)

  return (
    <Select
      key="language"
      label={translate(current, 'languageLabel')}
      options={LANGUAGES.map(option => ({ value: option.value, label: option.label }))}
      value={current}
      onSelect={value => void chooseLanguage($, value)}
    />
  )
}

const languageToggle = ($: EngineInterface, e: RenderInput<'Pane', 'mobile'>, current: Language) => {
  const { Button } = $.ui.resolve(e)
  const next = LANGUAGES.find(option => option.value !== current) ?? LANGUAGES[0]

  return next && <Button key="language" dimColor label={next.label} onPress={() => void chooseLanguage($, next.value)} />
}

const isBoardMove = (data: unknown): data is { move: [number, number] } => {
  const move = (data as { move?: unknown } | null)?.move

  return Array.isArray(move) && move.length === 2 && move.every(square => Number.isInteger(square) && square >= 0 && square < 64)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'chess',
      description: 'Play chess against Claude in a pane, any time',
    })
    const [savedGame, savedLanguage] = await Promise.all([$.store.get(GAME_KEY), $.store.get(LANGUAGE_KEY)])

    if (Array.isArray(savedGame) && savedGame.every(item => typeof item === 'string')) {
      await update($, moves, () => savedGame as string[])
    }
    if (isLanguage(savedLanguage)) {
      await update($, language, () => savedLanguage)
    }

    return next(e)
  })

  on('command.run', { command: 'chess' }, async $ => {
    const opened = await openBoard($)
    const current = await read($, language)

    return {
      text: opened.isPlaced
        ? translate(current, 'boardOpened')
        : translate(current, 'boardWaiting', { reason: opened.reason }),
    }
  })

  on('ui.message', async ($, e) => {
    if (e.element === BOARD_KEY && isBoardMove(e.data)) {
      const [from, to] = e.data.move
      await playMove($, `${squareName(from)}${squareName(to)}`)
    }

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const [history, thinking, shown, said, current] = await Promise.all([
      read($, moves),
      read($, isThinking),
      read($, notice),
      read($, remark),
      read($, language),
    ])
    const game = replay(history)
    const status = statusOf(game.position)
    const isPlayersTurn = game.position.turn === PLAYER && status === 'playing' && !thinking
    const isClaudesTurn = game.position.turn !== PLAYER && status === 'playing' && !thinking

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexWrap="wrap" columnGap={SIDE_GAP} rowGap={1}>
          {e.surface === 'terminal' || e.surface === 'desktop'
            ? boardClient($, e, boardPropsOf(game, !isPlayersTurn))
            : staticBoard($, e, game)}

          <Box flexDirection="column" gap={1} width={SIDE_COLUMNS}>
            <Text weight="bold">{translate(current, headlineKeyOf(game.position, status, thinking))}</Text>
            {said !== null && !thinking && <Text italic>{translate(current, 'claudeSays', { remark: said })}</Text>}
            {(e.surface === 'terminal' || e.surface === 'desktop') && (
              <Text dimColor>{translate(current, 'clickHint')}</Text>
            )}
            {game.sans.length === 0 ? (
              <Text dimColor>{translate(current, 'youOpen')}</Text>
            ) : (
              <Box flexDirection="column">
                {movePairs(game.sans)
                  .slice(-HISTORY_ROWS)
                  .map(row => (
                    <Text mono>{row}</Text>
                  ))}
              </Box>
            )}
            {shown !== null && <Text color="error">{noticeText(current, shown)}</Text>}
          </Box>
        </Box>

        {e.surface === 'vscode' && moveInput($, e, current)}
        {e.surface === 'mobile' && <Text dimColor>{translate(current, 'phoneHint')}</Text>}

        <Box flexWrap="wrap" columnGap={1} rowGap={1} alignItems="center">
          <Button key="new" hotkey="n" dimColor label={translate(current, 'newGame')} onPress={() => void newGame($)} />
          <Button key="undo" hotkey="u" dimColor label={translate(current, 'undo')} onPress={() => void undo($)} />
          {isClaudesTurn && (
            <Button
              key="retry"
              hotkey="r"
              variant="primary"
              label={translate(current, 'askClaude')}
              onPress={() => void claudeMove($)}
            />
          )}
          {e.surface === 'mobile' ? languageToggle($, e, current) : languageSelect($, e, current)}
        </Box>
      </Box>
    )
  })
}
