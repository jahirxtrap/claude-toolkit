import type { Stream } from './sources'

export type Control = { run: string; pause: boolean; volume: number; seek: { id: number; to: number } }

export type Report =
  | { kind: 'start' }
  | { kind: 'position'; seconds: number | null }
  | { kind: 'length'; seconds: number | null }
  | { kind: 'end'; reason: string; error: string }

export type PlayRequest = {
  mpv: string
  script: string
  control: string
  run: string
  volume: number
  start: number
  isPaused: boolean
  stream: Stream
}

const SCRIPT = 'meowzik'
const USER_AGENT = 'user-agent'
const REPORT = /^@(\w+)(?:\s+(.*))?$/
const NO_ERROR = 'nil'

const escaped = (value: string) => `%${new TextEncoder().encode(value).length}%${value}`

export const playerArgv = (request: PlayRequest) => {
  const headers = Object.entries(request.stream.headers)
  const agent = headers.find(([name]) => name.toLowerCase() === USER_AGENT)?.[1]

  return [
    request.mpv,
    '--no-config',
    '--no-video',
    '--no-terminal',
    '--idle=no',
    '--force-window=no',
    '--ytdl=no',
    `--volume=${request.volume}`,
    ...(request.start > 0 ? [`--start=${request.start}`] : []),
    ...(request.isPaused ? ['--pause'] : []),
    `--script=${request.script}`,
    `--script-opts=${SCRIPT}-control=${escaped(request.control)},${SCRIPT}-run=${request.run}`,
    ...(agent ? [`--user-agent=${agent}`] : []),
    ...headers
      .filter(([name]) => name.toLowerCase() !== USER_AGENT)
      .map(([name, value]) => `--http-header-fields-append=${name}: ${value}`),
    '--',
    request.stream.url,
  ]
}

export const coverArgv = (mpv: string, source: string, target: string, pixels: number, pixelFormat: string | null) => [
  mpv,
  '--no-config',
  '--no-terminal',
  '--frames=1',
  `--vf=lavfi=[scale=${pixels}:${pixels}:force_original_aspect_ratio=increase,crop=${pixels}:${pixels}${pixelFormat ? `,format=${pixelFormat}` : ''}]`,
  `--o=${target}`,
  '--',
  source,
]

const secondsOf = (text: string | undefined) => {
  const value = Number(text)

  return text === undefined || text === '-' || !Number.isFinite(value) ? null : value
}

const reportOf = (line: string): Report | null => {
  const [, kind, value] = line.match(REPORT) ?? []

  if (kind === 'start') {
    return { kind: 'start' }
  }
  if (kind === 'pos') {
    return { kind: 'position', seconds: secondsOf(value) }
  }
  if (kind === 'len') {
    return { kind: 'length', seconds: secondsOf(value) }
  }
  if (kind === 'end') {
    const [reason = '', ...error] = (value ?? '').split(' ')
    const text = error.join(' ')

    return { kind: 'end', reason, error: text === NO_ERROR ? '' : text }
  }

  return null
}

export const readReports = (buffer: string) => {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''

  return { reports: lines.flatMap(line => reportOf(line.trim()) ?? []), rest }
}