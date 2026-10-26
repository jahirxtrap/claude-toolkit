import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On, ProcessRunResult, ProcessSpawnChunk, ProcessSpawnResult } from 'claude-code'

import { ICONS } from './icons'
import type { SliderProps } from './slider'

const HOME = 'C:\\Users\\me'
const DATA = `${HOME}\\.claude\\meowzik`
const MPV = `${DATA}\\bin\\mpv\\mpv.exe`
const YTDLP = `${DATA}\\bin\\yt-dlp.exe`
const DENO = `${DATA}\\bin\\deno\\deno.exe`
const NODE = 'node'
const VERSIONS: Record<string, string> = { [MPV]: 'mpv v0.41.0 Copyright', [YTDLP]: '2026.08.19', [DENO]: 'deno 2.9.8 (stable)', [NODE]: 'v24.8.0' }
const TEMP = `${HOME}\\AppData\\Local\\Temp`
const SESSION = '7c0e5a52-1b2f-4f0a-9d3e-3a6f1b2c4d5e'
const RUN = `${TEMP}\\meowzik\\${SESSION}`
const CONTROL = `${RUN}\\control.json`
const LOGO = 'logo.png'
const SYSTEM = 'C:\\WINDOWS'
const TAR = `${SYSTEM}\\System32\\tar.exe`
const CURL = `${SYSTEM}\\System32\\curl.exe`
const SONG_SECONDS = 3
const TICK_MS = 250
const BOT_CHECK = "ERROR: [youtube] abc: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies"
const LRCLIB = 'https://lrclib.net/api'

const BAND = {
  plugin: 'meowzik',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

const PANE = {
  plugin: 'meowzik',
  component: 'Pane',
  requestId: 'meowzik',
  props: {
    title: 'Meowzik',
    isFocused: true,
    bodyColumns: 100,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

type Song = { id: string; title: string; uploader: string }

type WorldOptions = {
  hasTools?: boolean
  isBotChecked?: boolean
  availableAt?: number
  lyrics?: string
  subtitles?: Record<string, string>
  captions?: Record<string, string>
  files?: Record<string, string>
  store?: Record<string, unknown>
}

const SONGS: Record<string, Song> = {
  'daft punk': { id: 'A2VpR8HahKc', title: 'One More Time', uploader: 'Daft Punk' },
  'get lucky': { id: '5NV6Rdv1a3I', title: 'Get Lucky', uploader: 'Daft Punk' },
  'around the world': { id: 'K0HSD_i2DvA', title: 'Around the World', uploader: 'Daft Punk' },
}

const LYRIC_VIDEOS: Record<string, Song> = {
  'xynitra hiperactivo': { id: 'n_f8d4oQOXg', title: 'Xynitra - Hiperactivo (Official Lyric Video)', uploader: 'Xynitra' },
}

const SEARCH = 'ytsearch1:'

const ran = (stdout = '', exitCode = 0): { value: ProcessRunResult } => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

const line = (text: string): ProcessSpawnChunk => ({ stream: 'stdout', text: `${text}\n` })

const keyOf = (path: string) => path.slice(Math.max(0, path.indexOf(HOME)))

const isYtdlp = (argv: readonly string[]) => argv[0] === YTDLP && argv[1] !== '--version'

const isPlayer = (argv: readonly string[]) => argv[0] === MPV && argv.some(arg => arg.startsWith('--script='))

const entryOf = (song: Song) =>
  JSON.stringify({ id: song.id, title: song.title, duration: SONG_SECONDS, channel: song.uploader, url: `https://www.youtube.com/watch?v=${song.id}`, ie_key: 'Youtube' })

const storedOf = (name: string) => {
  const song = SONGS[name] as Song

  return {
    id: song.id,
    title: song.title,
    url: `https://www.youtube.com/watch?v=${song.id}`,
    duration: SONG_SECONDS,
    uploader: song.uploader,
    thumbnail: null,
    source: 'youtube',
    requestedBy: 'you',
  }
}

const listFiles = (list: string, names: readonly string[]) => ({
  [`${DATA}\\lists\\${list}\\index.json`]: '{"chunks":1}',
  [`${DATA}\\lists\\${list}\\0.json`]: JSON.stringify(names.map(storedOf)),
})

const titlesIn = (files: ReadonlyMap<string, string>, list: string) =>
  (JSON.parse(files.get(`${DATA}\\lists\\${list}\\0.json`) ?? '[]') as { title: string }[]).map(track => track.title)

const world = (on: On, clock: MockClock, options: WorldOptions = {}) => {
  const files = new Map<string, string>(Object.entries(options.files ?? {}))
  const times = new Map<string, number>()
  const tools = new Set(options.hasTools === false ? [] : [MPV, YTDLP, NODE])
  const commands: string[][] = []
  const statuses: (string | undefined)[] = []
  const opened: string[] = []
  const fetched: string[] = []

  async function* fakeMpv(argv: readonly string[]): AsyncGenerator<ProcessSpawnChunk, ProcessSpawnResult> {
    const run = argv.find(arg => arg.startsWith('--script-opts='))?.match(/meowzik-run=(\d+)/)?.[1]
    let position = Number(argv.find(arg => arg.startsWith('--start='))?.slice('--start='.length) ?? 0)
    let seek: number | null = null

    yield line(`@start \n@len ${SONG_SECONDS}`)
    for (;;) {
      await clock.sleep(TICK_MS)
      const control = JSON.parse(files.get(CONTROL) ?? '{}') as { run?: string; pause?: boolean; seek?: { id: number; to: number } }
      if (control.run !== run) {
        return { code: 4, signal: null }
      }
      if (seek !== null && control.seek && control.seek.id !== seek) {
        position = control.seek.to
      }
      seek = control.seek?.id ?? null
      position += control.pause ? 0 : TICK_MS / 1000
      if (position >= SONG_SECONDS) {
        yield line('@end eof nil')
        return { code: 0, signal: null }
      }
      yield line(`@pos ${position}`)
    }
  }

  async function* fakeYtdlp(argv: readonly string[]): AsyncGenerator<ProcessSpawnChunk, ProcessSpawnResult> {
    const target = argv.at(-1) ?? ''
    if (argv.includes('--write-subs') || argv.includes('--write-auto-subs')) {
      const written = argv.includes('--write-subs') ? options.subtitles : options.captions
      for (const [language, json3] of Object.entries(written ?? {})) {
        files.set(`${RUN}\\subs.${language}.json3`, json3)
        times.set(`${RUN}\\subs.${language}.json3`, clock.now())
      }
      yield line('en')
      return { code: 0, signal: null }
    }
    if (argv.includes('-f')) {
      if (options.isBotChecked) {
        yield { stream: 'stderr', text: BOT_CHECK }
        return { code: 1, signal: null }
      }
      yield line(
        JSON.stringify({
          url: `https://stream.example/${target.slice(-11)}.webm`,
          http_headers: { 'User-Agent': 'UA' },
          ...(options.availableAt === undefined ? {} : { available_at: options.availableAt }),
        }),
      )
      return { code: 0, signal: null }
    }

    const words = target.startsWith(SEARCH) ? target.slice(SEARCH.length) : target
    const song = SONGS[words.replace(/ audio$/, '')] ?? LYRIC_VIDEOS[words]
    if (!song && target.startsWith(SEARCH)) {
      return { code: 0, signal: null }
    }
    if (!song) {
      yield { stream: 'stderr', text: 'ERROR: no results' }
      return { code: 1, signal: null }
    }
    yield line(entryOf(song))
    return { code: 0, signal: null }
  }

  mock.store(on, options.store)
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: HOME, PROCESSOR_ARCHITECTURE: 'AMD64', SystemRoot: SYSTEM, TEMP })
  on('session.id', () => ({ value: SESSION }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__meowzik__${e.name}` } }))
  on('ui.open', (_, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.status', (_, e) => (statuses.push(e.text), { value: undefined }))
  on('fs.exists', (_, e) => ({ value: files.has(keyOf(e.path)) }))
  on('fs.write', (_, e) => (files.set(keyOf(e.path), e.text), { value: undefined }))
  on('fs.stat', (_, e) => ({ value: { kind: 'file', size: (files.get(keyOf(e.path)) ?? '').length, mtimeMs: 0, isLink: false } }))
  on('fs.list', (_, e) => {
    const folder = `${keyOf(e.path)}\\`
    const names = [...files.keys()].filter(path => path.startsWith(folder) && !path.slice(folder.length).includes('\\'))

    return {
      value: names.map(path => ({
        name: path.slice(folder.length),
        kind: 'file' as const,
        size: (files.get(path) ?? '').length,
        mtimeMs: times.get(path) ?? 0,
        isLink: false,
      })),
    }
  })
  on('fs.read', (_, e) => {
    const text = e.path.endsWith(LOGO) ? 'logo' : files.get(keyOf(e.path))
    if (text === undefined) {
      throw new Error(`ENOENT ${e.path}`)
    }
    return { value: e.as === 'bytes' ? { base64: btoa(text) } : text }
  })
  on('http.fetch', (_, e) => {
    fetched.push(e.url)
    if (e.url.startsWith(LRCLIB)) {
      const isFound = options.lyrics !== undefined && e.url.startsWith(`${LRCLIB}/get`)
      return { value: { status: isFound ? 200 : 404, ok: isFound, headers: {}, text: isFound ? JSON.stringify({ syncedLyrics: options.lyrics }) : '' } }
    }

    return {
      value: {
        status: 200,
        ok: true,
        headers: {},
        text: e.url.includes('api.github.com')
          ? JSON.stringify({ assets: [{ name: 'mpv-x86_64-20261021-git-e471496c56.7z', browser_download_url: 'https://example.com/mpv.7z' }] })
          : '',
      },
    }
  })
  on('process.run', (_, e) => {
    const argv = [...e.argv]
    commands.push(argv)
    const [program] = argv

    if (argv[1] === '--version') {
      return program && tools.has(program) ? ran(VERSIONS[program]) : ran('', 1)
    }
    if (program === CURL) {
      const target = argv[argv.indexOf('-o') + 1] ?? ''
      files.set(target, 'binary')
      if (target === YTDLP) {
        tools.add(YTDLP)
      }
      return ran()
    }
    if (program === TAR) {
      tools.add(argv.includes(`${DATA}\\bin\\deno`) ? DENO : MPV)
      return ran()
    }
    if (program === MPV && argv.includes('--frames=1')) {
      const target = argv.find(arg => arg.startsWith('--o='))?.slice('--o='.length) ?? ''
      files.set(target, target.endsWith('.png') ? 'png' : 'jpg')
      return ran()
    }

    return ran('', 1)
  })
  on('process.spawn', async function* (_, e) {
    commands.push([...e.argv])
    return { value: yield* e.argv[0] === MPV ? fakeMpv(e.argv) : fakeYtdlp(e.argv) }
  })

  return { files, commands, statuses, opened, fetched, control: () => JSON.parse(files.get(CONTROL) ?? '{}') as Record<string, unknown> }
}

const start = async <S extends Surface>($: Engine, surface: S) => {
  await $.session.start({ cwd: '/', surface, isInteractive: true })

  return $.ui.mount({ ...PANE, surface })
}

const texts = async (ui: { findAll: (query: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(found => found.text)

const labelOf = async (ui: { find: (query: { key: string }) => Promise<{ props: Record<string, unknown> } | undefined> }, key: string) =>
  (await ui.find({ key }))?.props.label

const sliderOf = async (ui: { find: (query: { key: string }) => Promise<{ props: Record<string, unknown> } | undefined> }, key: string) =>
  (await ui.find({ key }))?.props.props as SliderProps | undefined

const callTool = async ($: Engine, tool: string, input: Record<string, unknown>) => {
  const answered = await $.tool.call({ tool: `mcp__meowzik__${tool}`, ...input })

  return 'result' in answered ? String(answered.result) : ''
}

test('a song name plays at once, pauses through the control file, and ends in the history', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock)
  const ui = await start($, 'desktop')

  expect(await texts(ui)).toContain('Nothing is playing right now.')

  await ui.input({ key: 'add', text: 'daft punk' })

  expect(await texts(ui)).toContain('Now Playing')
  expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({ label: 'One More Time', href: 'https://www.youtube.com/watch?v=A2VpR8HahKc' })
  expect((await ui.find({ type: 'Svg' }))?.props.source).toContain(`data:image/jpeg;base64,${btoa('jpg')}`)
  expect(machine.commands.find(isPlayer)?.at(-1)).toBe('https://stream.example/A2VpR8HahKc.webm')
  expect(machine.commands.find(isYtdlp)?.slice(1, 3)).toEqual(['--js-runtimes', NODE])
  expect(machine.statuses.at(-1)).toBe('Playing: One More Time')

  await clock.advance(1000)
  expect(await sliderOf(ui, 'seekbar')).toMatchObject({ mode: 'seek', fraction: 1 / 3, total: 3, endLabel: '0:03', isEnabled: true })
  expect(await labelOf(ui, 'pause')).toBe(ICONS.pause)

  await ui.press({ key: 'pause' })
  expect(machine.control()).toMatchObject({ pause: true })
  expect(await labelOf(ui, 'pause')).toBe(ICONS.play)
  await clock.advance(1000)
  expect(await sliderOf(ui, 'seekbar')).toMatchObject({ fraction: 1 / 3 })

  await ui.press({ key: 'pause' })
  await clock.advance(3000)

  expect(await texts(ui)).toContain('Nothing is playing right now.')
  expect(await labelOf(ui, 'tab:history')).toBe('History (1)')
  expect(machine.statuses.at(-1)).toBeUndefined()

  await ui.unmount()
})

test('a search that finds nothing with "audio" tries again without it', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock)
  const ui = await start($, 'desktop')
  const searches = () => machine.commands.filter(isYtdlp).flatMap(argv => argv.filter(arg => arg.startsWith(SEARCH)))

  await ui.input({ key: 'add', text: 'xynitra hiperactivo' })
  expect(searches()).toEqual([`${SEARCH}xynitra hiperactivo audio`, `${SEARCH}xynitra hiperactivo`])
  expect(machine.statuses.at(-1)).toBe('Playing: Xynitra - Hiperactivo (Official Lyric Video)')

  await ui.input({ key: 'add', text: 'nothing like this' })
  expect(searches().slice(-2)).toEqual([`${SEARCH}nothing like this audio`, `${SEARCH}nothing like this`])
  expect(await texts(ui)).toContain('Could not play that: No results found.')

  await ui.unmount()
})

test('songs added while one plays wait in the queue, and the list, Back and Skip move between them', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  world(on, clock)
  const ui = await start($, 'desktop')

  await ui.input({ key: 'add', text: 'daft punk' })
  await ui.input({ key: 'add', text: 'get lucky' })
  await ui.input({ key: 'add', text: 'around the world' })

  expect(await labelOf(ui, 'tab:queue')).toBe('Queue (2)')
  expect(await texts(ui)).toContain('Next: Get Lucky')
  expect((await ui.find({ type: 'Svg' }))?.props.source).toContain('data:image/jpeg;base64,')

  await ui.press({ key: 'queue:play:1' })
  expect((await ui.find({ type: 'Link' }))?.props.label).toBe('Around the World')
  expect(await labelOf(ui, 'tab:queue')).toBe('Queue (1)')
  expect(await labelOf(ui, 'tab:history')).toBe('History (1)')

  await ui.press({ key: 'back' })
  expect((await ui.find({ type: 'Link' }))?.props.label).toBe('One More Time')
  expect(await texts(ui)).toContain('Next: Around the World')

  await ui.press({ key: 'skip' })
  expect((await ui.find({ type: 'Link' }))?.props.label).toBe('Around the World')

  await ui.press({ key: 'stop' })
  expect(await texts(ui)).toContain('Stopped, and the queue is clear.')
  expect(await labelOf(ui, 'tab:queue')).toBe('Queue (0)')

  await ui.unmount()
})

test('loop track plays the song again, and favorites keep it for later sessions', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock)
  const ui = await start($, 'desktop')

  await ui.press({ key: 'loop' })
  expect(await labelOf(ui, 'loop')).toBe(ICONS.loopTrack)
  expect((await ui.find({ key: 'loop' }))?.props.variant).toBe('primary')
  await ui.input({ key: 'add', text: 'get lucky' })
  await ui.press({ key: 'favorite' })
  expect(await texts(ui)).toContain('Added to favorites: Get Lucky')

  await clock.advance(SONG_SECONDS * 1000 + 500)
  expect((await ui.find({ type: 'Link' }))?.props.label).toBe('Get Lucky')
  expect(machine.commands.filter(isPlayer)).toHaveLength(2)

  await ui.press({ key: 'tab:favorites' })
  expect(await labelOf(ui, 'tab:favorites')).toBe('Favorites (1)')
  expect(machine.files.get(`${DATA}\\lists\\favorites\\0.json`)).toContain('"title":"Get Lucky"')
  expect(machine.files.get(`${DATA}\\lists\\favorites\\index.json`)).toBe('{"chunks":1}')

  await ui.unmount()
})

test('a fresh session takes the queue the last one left, and reads the lists and the settings back', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock, {
    files: { ...listFiles('queue', ['daft punk']), ...listFiles('played', ['get lucky']) },
    store: { loop: 'queue', volume: 40 },
  })
  const ui = await start($, 'desktop')

  expect(await labelOf(ui, 'tab:queue')).toBe('Queue (1)')
  expect(await labelOf(ui, 'tab:history')).toBe('History (1)')
  expect(machine.files.get(`${DATA}\\lists\\queue\\index.json`)).toBe('{"chunks":0}')
  expect(await labelOf(ui, 'loop')).toBe(ICONS.loop)
  expect((await ui.find({ key: 'loop' }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'shuffle' }))?.props.variant).toBe('secondary')
  expect(await sliderOf(ui, 'volume')).toMatchObject({ mode: 'volume', fraction: 0.4 })
  expect(await labelOf(ui, 'pause')).toBe(ICONS.play)
  expect(await texts(ui)).toContain(`Press ${ICONS.play} to start the queue.`)

  await ui.press({ key: 'pause' })
  expect((await ui.find({ type: 'Link' }))?.props.label).toBe('One More Time')

  await ui.unmount()
})

test('sessions share the history and the favorites without losing what another saved, and Back stays in this one', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock)
  const ui = await start($, 'desktop')
  const saveElsewhere = (list: string, names: readonly string[]) => {
    for (const [path, text] of Object.entries(listFiles(list, names))) {
      machine.files.set(path, text)
    }
  }

  await ui.input({ key: 'add', text: 'daft punk' })
  expect(machine.commands.find(isPlayer)?.some(arg => arg.includes(CONTROL))).toBe(true)

  saveElsewhere('favorites', ['get lucky'])
  await ui.press({ key: 'favorite' })
  expect(titlesIn(machine.files, 'favorites')).toEqual(['Get Lucky', 'One More Time'])
  expect(await labelOf(ui, 'tab:favorites')).toBe('Favorites (2)')

  await clock.advance(SONG_SECONDS * 1000 + TICK_MS)
  expect(titlesIn(machine.files, 'played')).toEqual(['One More Time'])

  saveElsewhere('played', ['daft punk', 'around the world'])
  await ui.input({ key: 'add', text: 'get lucky' })
  await ui.press({ key: 'back' })
  expect((await ui.find({ type: 'Link' }))?.props.label).toBe('One More Time')
  expect(titlesIn(machine.files, 'played')).toEqual(['Around the World'])

  await ui.unmount()
})

test('a session keeps its queue to itself and leaves it for the next one when it closes', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock)
  const ui = await start($, 'desktop')

  await ui.input({ key: 'add', text: 'daft punk' })
  await ui.input({ key: 'add', text: 'get lucky' })
  expect(titlesIn(machine.files, 'queue')).toEqual([])

  await $.session.end({ reason: 'clear', sessionId: SESSION, resume: { id: SESSION } })
  expect(titlesIn(machine.files, 'queue')).toEqual([])

  await $.session.end({ reason: 'prompt_input_exit', sessionId: SESSION, resume: { id: SESSION } })
  expect(titlesIn(machine.files, 'queue')).toEqual(['One More Time', 'Get Lucky'])
})

test('missing tools are installed on the first song, and the setup tab says what is there', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock, { hasTools: false })
  const ui = await start($, 'desktop')

  await ui.press({ key: 'tab:setup' })
  expect(await texts(ui)).toContain('mpv: not installed')
  expect(await texts(ui)).toContain('deno: not installed')
  expect(await ui.find({ key: 'install' })).toBeDefined()

  await ui.input({ key: 'add', text: 'daft punk' })

  expect(machine.commands.some(argv => argv[0] === CURL && argv.includes(YTDLP))).toBe(true)
  expect(machine.commands.some(argv => argv[0] === TAR && argv.includes(`${DATA}\\bin\\mpv`))).toBe(true)
  expect(machine.commands.some(argv => argv[0] === CURL && argv.at(-1)?.endsWith('/deno-x86_64-pc-windows-msvc.zip'))).toBe(true)
  expect(machine.commands.some(argv => argv[0] === TAR && argv.includes(`${DATA}\\bin\\deno`))).toBe(true)
  expect(machine.files.get(`${DATA}\\run\\download.tmp`)).toBe('')
  expect(await texts(ui)).toContain('mpv v0.41.0')
  expect(await texts(ui)).toContain('deno 2.9.8')
  expect(machine.commands.find(isYtdlp)).toContain(`deno:${DENO}`)
  expect((await ui.find({ type: 'Link' }))?.props.label).toBe('One More Time')
  expect(await ui.find({ key: 'install' })).toBeUndefined()

  await ui.unmount()
})

test('a YouTube bot check keeps the song queued and says how to get past it', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  world(on, clock, { isBotChecked: true })
  const ui = await start($, 'desktop')

  await ui.input({ key: 'add', text: 'daft punk' })

  expect(await texts(ui)).toContain(
    'Could not play One More Time: YouTube asked to confirm you are not a bot. Set a cookies file in /config under meowzik, or switch the search source to SoundCloud.',
  )
  expect(await labelOf(ui, 'tab:queue')).toBe('Queue (1)')
  expect(await texts(ui)).toContain('Nothing is playing right now.')

  expect(await callTool($, 'play', { query: 'daft punk' })).toContain('Could not play One More Time: YouTube asked to confirm')
  expect(await labelOf(ui, 'tab:queue')).toBe('Queue (1)')
  expect(await callTool($, 'status', {})).toContain('Could not play One More Time')

  await ui.unmount()
})

test('the sliders seek by dragging and set the volume live, and the arrows step them', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock)
  const ui = await start($, 'desktop')

  await ui.input({ key: 'add', text: 'daft punk' })
  await ui.resize({ columns: 100, rows: 2, in: 'seekbar' })
  await ui.resize({ columns: 30, rows: 1, in: 'volume' })

  await ui.pointer({ type: 'down', button: 'left', x: 20, y: 0, in: 'seekbar' })
  await ui.pointer({ type: 'move', button: 'left', x: 60, y: 0, in: 'seekbar' })
  expect(machine.control()).toMatchObject({ seek: { id: 0 } })
  expect(await ui.find({ type: 'Text', text: '0:01', in: 'seekbar' })).toBeDefined()
  await ui.pointer({ type: 'up', button: 'left', x: 60, y: 0, in: 'seekbar' })
  expect(machine.control()).toMatchObject({ seek: { id: 1 } })
  expect(Math.round((machine.control().seek as { to: number }).to * 1000)).toBe(1815)

  await ui.pointer({ type: 'down', button: 'left', x: 4, y: 0, in: 'volume' })
  expect(machine.control()).toMatchObject({ volume: 2 })
  await ui.pointer({ type: 'move', button: 'left', x: 25, y: 0, in: 'volume' })
  expect(machine.control()).toMatchObject({ volume: 100 })
  await ui.pointer({ type: 'up', button: 'left', x: 25, y: 0, in: 'volume' })
  await ui.key({ key: 'left', in: 'volume' })
  expect(machine.control()).toMatchObject({ volume: 95 })
  expect(await ui.find({ type: 'Text', text: '95%', in: 'volume' })).toBeDefined()

  await ui.unmount()
})

test('the mini player above the prompt shows while music plays and opens the pane', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock)
  const pane = await start($, 'desktop')
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await band.find({ key: 'mini:pause' })).toBeUndefined()

  await pane.input({ key: 'add', text: 'daft punk' })
  expect(await labelOf(band, 'mini:open')).toBe(`${ICONS.note} One More Time`)
  expect(await sliderOf(band, 'miniSeekbar')).toMatchObject({ mode: 'seek', layout: 'inline' })

  await band.press({ key: 'mini:pause' })
  expect(machine.control()).toMatchObject({ pause: true })
  await band.press({ key: 'mini:open' })
  expect(machine.opened.at(-1)).toBe('meowzik')

  await band.press({ key: 'mini:stop' })
  expect(await band.find({ key: 'mini:pause' })).toBeUndefined()
  expect(await pane.find({ key: 'miniPlayer' })).toBeUndefined()

  await band.unmount()
  await pane.unmount()
})

test('the mini player and the status line turn off from the settings', { options: { miniPlayer: 'off', statusLine: false } }, async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock)
  const pane = await start($, 'desktop')
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await pane.input({ key: 'add', text: 'daft punk' })
  expect(await band.find({ key: 'mini:pause' })).toBeUndefined()
  expect(machine.statuses.filter(status => status !== undefined)).toEqual([])

  await band.unmount()
  await pane.unmount()
})

test('the mini player can stay above the prompt with nothing playing', { options: { miniPlayer: 'always' } }, async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  world(on, clock)
  const pane = await start($, 'desktop')
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await labelOf(band, 'mini:open')).toBe(`${ICONS.note} Meowzik`)
  expect(await band.find({ key: 'miniSeekbar' })).toBeUndefined()

  await band.unmount()
  await pane.unmount()
})

test('the lyrics tab follows the song and a line jumps to it', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock, { lyrics: '[00:00.50] First line\n[00:01.50] Second line\n[00:02.50] Third line' })
  const ui = await start($, 'desktop')

  await ui.input({ key: 'add', text: 'daft punk' })
  await ui.press({ key: 'tab:lyrics' })
  expect(machine.fetched.some(url => url.startsWith(`${LRCLIB}/get?`) && url.includes('track_name=One+More+Time'))).toBe(true)

  await clock.advance(2250)
  const now = (await ui.findAll({ type: 'Text' })).find(found => found.text === 'Second line')
  expect(now?.props).toMatchObject({ weight: 'bold' })

  await ui.press({ key: 'lyric:0' })
  expect(machine.control()).toMatchObject({ seek: { to: 0.5 } })

  await ui.unmount()
})

test('a song without lyrics says so', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  world(on, clock)
  const ui = await start($, 'desktop')

  await ui.press({ key: 'tab:lyrics' })
  expect(await texts(ui)).toContain('Play a song to see its lyrics.')
  await ui.input({ key: 'add', text: 'daft punk' })
  expect(await texts(ui)).toContain('No lyrics found for this song.')

  await ui.unmount()
})

test("without LRCLIB lyrics the video's subtitles stand in, then its automatic captions", async ($, on) => {
  const subtitle = (text: string) => JSON.stringify({ events: [{ tStartMs: 500, segs: [{ utf8: text }] }] })
  const clock = mock.clock(on, { now: 0 })
  world(on, clock, { subtitles: { en: subtitle('One more time'), de: subtitle('Noch einmal') } })
  const ui = await start($, 'desktop')

  await ui.press({ key: 'tab:lyrics' })
  await ui.input({ key: 'add', text: 'daft punk' })
  expect(await texts(ui)).toContain('One more time')
  expect(await texts(ui)).toContain("Lyrics from the video's subtitles")
  await ui.unmount()
})

test('automatic captions are the last resort, and say they may be off', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  world(on, clock, { captions: { 'en-orig': JSON.stringify({ events: [{ tStartMs: 500, segs: [{ utf8: 'one more time' }] }] }) } })
  const ui = await start($, 'desktop')

  await ui.press({ key: 'tab:lyrics' })
  await ui.input({ key: 'add', text: 'daft punk' })
  expect(await texts(ui)).toContain('one more time')
  expect(await texts(ui)).toContain("Lyrics from YouTube's automatic captions, which may be off")
  await ui.unmount()
})

test('mpv waits until YouTube serves the audio', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock, { availableAt: 5 })
  const ui = await start($, 'desktop')

  await ui.input({ key: 'add', text: 'daft punk' })
  expect(await texts(ui)).toContain('Loading')
  expect(machine.statuses.at(-1)).toBe('Loading: One More Time')
  expect(machine.commands.some(isPlayer)).toBe(false)

  await clock.advance(5500)
  expect(machine.commands.some(isPlayer)).toBe(true)
  expect(await texts(ui)).toContain('Now Playing')

  await ui.unmount()
})

test('Claude plays, controls and reads the player through its tools', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const machine = world(on, clock)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(await callTool($, 'play', { query: 'daft punk' })).toBe('Now playing: One More Time')
  expect(await callTool($, 'play', { query: 'get lucky', placement: 'next' })).toBe('Added to queue: Get Lucky')
  expect(await callTool($, 'control', { action: 'volume', value: 30 })).toBe('Volume: 30%')
  expect(machine.control()).toMatchObject({ volume: 30 })
  expect(await callTool($, 'control', { action: 'loop', value: 'queue' })).toBe('Loop: Queue')
  expect(await callTool($, 'control', { action: 'autoplay', value: 'off' })).toBe('Autoplay: Off')

  const status = await callTool($, 'status', {})
  expect(status).toContain('Now Playing: One More Time https://www.youtube.com/watch?v=A2VpR8HahKc (0:00 / 0:03)')
  expect(status).toContain('1. Get Lucky (0:03) https://www.youtube.com/watch?v=5NV6Rdv1a3I')

  expect(await callTool($, 'control', { action: 'skip' })).toBe('Skipped One More Time.')
  expect(await callTool($, 'list', { list: 'history', action: 'show' })).toBe(
    'History (1)\n1. One More Time (0:03) https://www.youtube.com/watch?v=A2VpR8HahKc',
  )
  expect(await callTool($, 'list', { list: 'queue', action: 'play', number: 9 })).toBe('There is no song number 9 in that list.')
})

test('a phone gets no field but a bar and buttons to move through the song', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  world(on, clock)
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })

  expect(await texts(ui)).toContain('Ask Claude to play something.')
  expect(await ui.find({ key: 'add' })).toBeUndefined()

  await $.tool.call({ tool: 'mcp__meowzik__play', query: 'daft punk' })
  expect(await ui.find({ key: 'forward' })).toBeDefined()
  expect(await ui.find({ type: 'Client' })).toBeUndefined()

  await ui.unmount()
})