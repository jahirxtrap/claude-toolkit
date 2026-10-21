import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { boardColumnsFor, FILE_LABEL_ROWS, RANK_LABEL_COLUMNS, squareColumnsFor } from './layout'

const PANE = {
  plugin: 'chess',
  component: 'Pane',
  requestId: 'chess',
  props: {
    title: 'Chess',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const SQUARE_ROWS = 2
const BOARD = { columns: boardColumnsFor(SQUARE_ROWS), rows: 8 * SQUARE_ROWS + FILE_LABEL_ROWS, in: 'board' }

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

const reply = (move: string, remark = 'Nice move!') => `Thinking about the centre.\nMOVE: ${move}\nSAY: ${remark}`

const at = (name: string) => {
  const file = name.charCodeAt(0) - 'a'.charCodeAt(0)
  const rank = Number(name[1]) - 1

  return {
    x: RANK_LABEL_COLUMNS + file * squareColumnsFor(SQUARE_ROWS) + 1,
    y: (7 - rank) * SQUARE_ROWS,
  }
}

const engine = (on: On, replies: string[]) => {
  const requests: { system: string; prompt: string; effort: unknown }[] = []
  const titles: string[] = []

  mock.store(on)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', (_, e) => (titles.push(e.title ?? ''), { value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', (_, e) => {
    requests.push({ system: e.system ?? '', prompt: e.prompt, effort: e.effort })

    return { value: { isAnswered: true, text: replies.shift() ?? 'no idea', usage: USAGE } }
  })

  return { requests, titles }
}

const start = async <S extends 'terminal' | 'desktop' | 'vscode' | 'mobile'>($: Engine, surface: S) => {
  await $.session.start({ cwd: '/', surface, isInteractive: true })

  return $.ui.mount({ ...PANE, surface })
}

const runChess = ($: Engine, args: string) =>
  $.command.run({
    command: 'chess',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

const texts = async (ui: { findAll: (query: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(found => found.text)

test('you click a piece and then its square, and Claude thinks and answers, on terminal and desktop', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { requests } = engine(on, [reply('e7e5', 'Meeting you in the centre.'), reply('e7e5')])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'new' })
    await ui.resize(BOARD)

    expect(await texts(ui)).toContain('Your move: you play White.')

    await ui.pointer({ type: 'down', button: 'left', ...at('e2'), in: 'board' })
    expect(await ui.findAll({ type: 'Text', text: '•', in: 'board' })).toHaveLength(2)

    await ui.pointer({ type: 'down', button: 'left', ...at('e4'), in: 'board' })
    await clock.settle()

    expect(await texts(ui)).toContain('1. e4 e5')
    expect(requests.at(-1)?.effort).toBe('low')
    expect(requests.at(-1)?.prompt).toContain('4 . . . . P . . .')
    expect(requests.at(-1)?.system).toContain('in English')

    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await texts(ui)).toContain('Claude: Nice move!')
  await ui.unmount()
})

test('the keyboard plays too: Enter picks, the arrows move', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  engine(on, [reply('g8f6')])
  const ui = await start($, 'desktop')
  await ui.resize(BOARD)

  await ui.key({ key: 'return', in: 'board' })
  await ui.key({ key: 'up', in: 'board' })
  await ui.key({ key: 'up', in: 'board' })
  await ui.key({ key: 'return', in: 'board' })
  await clock.settle()

  expect(await texts(ui)).toContain('1. e4 Nf6')

  await ui.unmount()
})

test('the language select switches the pane to Spanish and asks Claude to speak Spanish', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { requests, titles } = engine(on, [reply('e7e5', '¡Al centro!')])
  const ui = await start($, 'desktop')
  await ui.resize(BOARD)

  expect((await ui.find({ key: 'language' }))?.type).toBe('Select')
  await ui.select({ key: 'language', value: 'es' })

  expect(await texts(ui)).toContain('Te toca: juegas con blancas.')
  expect((await ui.find({ key: 'new' }))?.props.label).toBe('Nueva partida')
  expect(titles.at(-1)).toBe('Ajedrez')

  await ui.pointer({ type: 'down', button: 'left', ...at('e2'), in: 'board' })
  await ui.pointer({ type: 'down', button: 'left', ...at('e4'), in: 'board' })
  await clock.settle()

  expect(requests.at(-1)?.system).toContain('in Spanish')
  expect(await texts(ui)).toContain('Claude: ¡Al centro!')

  await ui.unmount()
})

test('the board grows with the pane', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const small = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const smallBoard = await small.find({ type: 'Client', key: 'board' })
  await small.unmount()

  const large = await $.ui.mount({
    ...PANE,
    surface: 'desktop',
    props: { ...PANE.props, bodyColumns: 120, scroll: { offset: 0, bodyRows: 60 } },
  })
  const largeBoard = await large.find({ type: 'Client', key: 'board' })
  await large.unmount()

  expect(smallBoard?.props).toMatchObject({ width: boardColumnsFor(2), height: 17 })
  expect(largeBoard?.props).toMatchObject({ width: boardColumnsFor(4), height: 33 })
})

test('an illegal move typed in VS Code is refused without asking Claude', async ($, on) => {
  const { requests } = engine(on, [])
  const ui = await start($, 'vscode')

  await ui.input({ key: 'move', text: 'e5' })

  expect(await texts(ui)).toContain('“e5” is not a legal move.')
  expect(requests).toHaveLength(0)

  await ui.unmount()
})

test('a reply with no legal move gets a second try, then a button to ask again', async ($, on) => {
  const replies = ['I think I will resign', 'hmm']
  const { requests } = engine(on, replies)
  const ui = await start($, 'vscode')

  await ui.input({ key: 'move', text: 'd4' })

  expect(requests).toHaveLength(2)
  expect(await texts(ui)).toContain('Claude did not give a valid move.')
  expect(await texts(ui)).toContain("Claude's move.")

  replies.push(reply('g8f6'))
  await ui.press({ key: 'retry' })

  expect(await texts(ui)).toContain('1. d4 Nf6')
  expect(await ui.find({ key: 'retry' })).toBeUndefined()

  await ui.unmount()
})

test('undo takes back your move and Claude reply, and a new game clears the board', async ($, on) => {
  engine(on, [reply('e7e5'), reply('c7c5')])
  const ui = await start($, 'vscode')

  await ui.input({ key: 'move', text: 'e4' })
  expect(await texts(ui)).toContain('1. e4 e5')

  await ui.press({ key: 'undo' })
  expect(await texts(ui)).toContain('You open.')

  await ui.input({ key: 'move', text: 'e2e4' })
  expect(await texts(ui)).toContain('1. e4 c5')

  await ui.press({ key: 'new' })
  expect(await texts(ui)).toContain('You open.')

  await ui.unmount()
})

test('/chess only opens the board, whatever follows it', async ($, on) => {
  const { requests, titles } = engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ran = await runChess($, 'e4')

  expect(ran.text).toBe('Board open.')
  expect(titles).toEqual(['Chess'])
  expect(requests).toHaveLength(0)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await texts(ui)).toContain('You open.')
  await ui.unmount()
})

test('on the phone app the board shows with a note, and a button switches the language', async ($, on) => {
  engine(on, [])
  const ui = await start($, 'mobile')

  expect(await texts(ui)).toContain('Open the board on a computer to play.')
  expect((await texts(ui)).filter(text => text === `♙${String.fromCodePoint(0xfe0e)}`)).toHaveLength(8)

  await ui.press({ key: 'language' })
  expect(await texts(ui)).toContain('Abre el tablero en un ordenador para jugar.')

  await ui.unmount()
})
