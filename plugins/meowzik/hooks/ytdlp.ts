import type { EngineInterface } from 'claude-code'

import type { Notice } from '../types'
import type { Places, Settings } from './config'
import { joined } from './config'
import { checkCookies, holdsSession, netscapeOf, youtubeCookiesOf } from './cookies'
import type { CookieCheck } from './cookies'
import { isBotCheck, reasonOf } from './sources'
import { Problem } from './text'
import type { TextKey } from './text'

export type Ytdlp = { settings: Settings; places: Places; path: string; runtime: string[] }

export type CookieState =
  | { kind: 'none' }
  | { kind: 'browser'; browser: string }
  | { kind: 'file'; path: string; count: number; check: CookieCheck }
  | { kind: 'unreadable'; path: string }

type Attempt = { lines: string[]; stderr: string; code: number | null; usedCookies: boolean }

const SECONDS = 1000
const YOUTUBE_CLIENTS = ['--extractor-args', 'youtube:player_client=default,mweb']
const COOKIE_PROBLEMS: Record<Exclude<CookieCheck, { isUsable: true }>['reason'], TextKey> = {
  noYoutube: 'cookiesNoYoutube',
  noSession: 'cookiesNoSession',
  expired: 'cookiesExpired',
}
const busyCopies = new Set<number>()

let mustUseCookies = false

export async function cookieStateOf($: EngineInterface, settings: Settings, places: Places): Promise<CookieState> {
  if (settings.cookiesFromBrowser) {
    return { kind: 'browser', browser: settings.cookiesFromBrowser }
  }
  if (!settings.cookies) {
    return { kind: 'none' }
  }

  try {
    const exported = await $.fs.read(settings.cookies)
    const cookies = youtubeCookiesOf(exported)
    const check = checkCookies(cookies, Math.floor((await $.clock.now()) / SECONDS))

    if (check.isUsable) {
      const source = await $.fs.stat(settings.cookies)
      const jar = (await $.fs.exists(places.cookieJar)) ? await $.fs.stat(places.cookieJar) : null
      if (!jar || source.mtimeMs > jar.mtimeMs) {
        await $.fs.write(places.cookieJar, netscapeOf(cookies))
      }
    }

    return { kind: 'file', path: settings.cookies, count: cookies.length, check }
  } catch {
    return { kind: 'unreadable', path: settings.cookies }
  }
}

export const cookieNoticeOf = (cookies: CookieState): Notice => {
  const notice = (key: TextKey, params: Record<string, string> = {}, isError = false): Notice => ({ key, params, isError })

  switch (cookies.kind) {
    case 'none':
      return notice('cookiesNone')
    case 'browser':
      return notice('cookiesBrowser', { browser: cookies.browser })
    case 'unreadable':
      return notice('cookiesUnreadable', { path: cookies.path }, true)
    case 'file':
      return cookies.check.isUsable
        ? notice('cookiesReady', { count: String(cookies.count) })
        : notice(COOKIE_PROBLEMS[cookies.check.reason], { path: cookies.path, names: cookies.check.names.join(', ') }, true)
  }
}

const copyPathOf = (places: Places, slot: number) => joined(places.platform, places.data, 'run', `cookies-${slot}.txt`)

async function hasCookies($: EngineInterface, ytdlp: Ytdlp) {
  return Boolean(ytdlp.settings.cookiesFromBrowser) || (Boolean(ytdlp.settings.cookies) && (await $.fs.exists(ytdlp.places.cookieJar)))
}

async function attempt($: EngineInterface, ytdlp: Ytdlp, args: readonly string[], cookieArgs: string[], onLine?: (line: string) => void) {
  const child = $.process.spawn({
    argv: [ytdlp.path, ...ytdlp.runtime, ...YOUTUBE_CLIENTS, ...cookieArgs, ...ytdlp.settings.ytdlpArgs, '--no-warnings', ...args],
  })
  const lines: string[] = []
  const take = (line: string) => {
    lines.push(line)
    onLine?.(line)
  }
  let pending = ''
  let stderr = ''

  for await (const { stream, text } of child) {
    if (stream === 'stderr') {
      stderr += text
      continue
    }

    const parts = (pending + text).split(/\r?\n/)
    pending = parts.pop() ?? ''
    parts
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(take)
  }
  if (pending.trim()) {
    take(pending.trim())
  }

  const { code } = await child.result

  return { lines, stderr, code, usedCookies: cookieArgs.length > 0 } satisfies Attempt
}

async function attemptWithJar($: EngineInterface, ytdlp: Ytdlp, args: readonly string[], onLine?: (line: string) => void) {
  let slot = 0
  while (busyCopies.has(slot)) {
    slot += 1
  }
  busyCopies.add(slot)

  const copy = copyPathOf(ytdlp.places, slot)
  try {
    await $.fs.write(copy, await $.fs.read(ytdlp.places.cookieJar))
    const result = await attempt($, ytdlp, args, ['--cookies', copy], onLine)
    const answered = await $.fs.read(copy)
    if (holdsSession(answered)) {
      await $.fs.write(ytdlp.places.cookieJar, answered)
    }

    return result
  } finally {
    await $.fs.write(copy, '')
    busyCopies.delete(slot)
  }
}

async function tried($: EngineInterface, ytdlp: Ytdlp, args: readonly string[], useCookies: boolean, onLine?: (line: string) => void) {
  if (!useCookies) {
    return attempt($, ytdlp, args, [], onLine)
  }

  return ytdlp.settings.cookiesFromBrowser
    ? attempt($, ytdlp, args, ['--cookies-from-browser', ytdlp.settings.cookiesFromBrowser], onLine)
    : attemptWithJar($, ytdlp, args, onLine)
}

export async function ytdlpLines($: EngineInterface, ytdlp: Ytdlp, args: readonly string[], onLine?: (line: string) => void) {
  const canUseCookies = await hasCookies($, ytdlp)
  let result = await tried($, ytdlp, args, mustUseCookies && canUseCookies, onLine)

  if (result.lines.length === 0 && result.code !== 0 && isBotCheck(result.stderr) && !result.usedCookies && canUseCookies) {
    mustUseCookies = true
    result = await tried($, ytdlp, args, true, onLine)
  }
  if (result.lines.length === 0 && result.code !== 0) {
    if (isBotCheck(result.stderr)) {
      throw new Problem(result.usedCookies ? 'botCheckCookies' : 'botCheck')
    }

    throw new Problem('failure', { reason: reasonOf(result.stderr) })
  }

  return result.lines
}