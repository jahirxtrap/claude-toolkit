import type { EngineInterface, Timer } from 'claude-code'

import type { LoopMode, Requester, Track } from '../types'
import { findTracks, relatedTo, resolvedTrack, searchTracks, streamFor } from './catalog'
import type { Session } from './config'
import { coverOf } from './cover'
import { VOLUME_MAX } from './layout'
import { playerArgv, readReports } from './mpv'
import type { Control } from './mpv'
import {
  candidatesOf,
  finished,
  LOOP_CYCLE,
  movedTo,
  removedAt,
  requestedAs,
  shuffled,
  takeNext,
  toggledFavorite,
  withPlayed,
  withSeed,
} from './queue'
import { readyTools, runtimeArgsOf } from './setup'
import { loadList, saveList } from './shelf'
import type { ListName } from './shelf'
import { get, put, set, tell } from './state'
import { clockOf, countKey, LOOP_NAMES, Problem, problemText, say, switchOf, titleOf } from './text'
import type { Params, TextKey } from './text'
import type { Ytdlp } from './ytdlp'

export type Placement = 'end' | 'next' | 'now'

export type Reply = { key: TextKey; params: Params; isError: boolean }

type Outcome = { reason: string; error: string }

type Pending = { run: number; seed: Track | null }

const MAX_FAILURES = 5
const BACKOFF_MS = 2000
const PROGRESS_STEP = 25
const MS_PER_SECOND = 1000
const AVAILABLE_MARGIN_MS = 500
const FATAL: ReadonlySet<TextKey> = new Set<TextKey>(['botCheck', 'botCheckCookies', 'installFailed', 'manualMpv', 'playerMissing', 'homeMissing'])
const CURRENT_KEY = 'current'
const LOOP_KEY = 'loop'
const SHUFFLE_KEY = 'isShuffled'
const AUTOPLAY_KEY = 'isAutoplay'
const VOLUME_KEY = 'volume'

let session: Session | null = null
let run = 0
let seek = { id: 0, to: 0 }
let failures = 0
let seeds: Track[] = []
let retry: Timer | null = null
let chain: Promise<unknown> = Promise.resolve()
const seen = new Set<string>()
const waiters = new Map<number, (failure: Reply | null) => void>()

const replyOf = (key: TextKey, params: Params = {}, isError = false): Reply => ({ key, params, isError })

const sessionOf = () => {
  if (!session) {
    throw new Problem('homeMissing')
  }

  return session
}

const serially = <T>(work: () => Promise<T>): Promise<T> => {
  const next = chain.then(work, work)
  chain = next.catch(() => undefined)

  return next
}

const detach = (work: Promise<unknown>) => void work.catch(() => undefined)

const settle = (mine: number, failure: Reply | null) => {
  waiters.get(mine)?.(failure)
  waiters.delete(mine)
}

const nextRun = () => {
  run += 1
  for (const mine of [...waiters.keys()]) {
    settle(mine, null)
  }

  return run
}

const cancelRetry = () => {
  retry?.cancel()
  retry = null
}

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

const isLoopMode = (value: unknown): value is LoopMode => value === 'off' || value === 'track' || value === 'queue'

const isLevel = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= VOLUME_MAX

const isStoredTrack = (value: unknown): value is Track =>
  typeof value === 'object' && value !== null && typeof (value as Track).id === 'string' && typeof (value as Track).url === 'string'

async function told($: EngineInterface, reply: Reply) {
  await tell($, reply.key, reply.params, reply.isError)

  return reply
}

async function setList($: EngineInterface, name: ListName, change: (list: Track[]) => Track[]) {
  const next = await put($, name, change)
  await saveList($, sessionOf().places, name, next)

  return next
}

async function toolsFor($: EngineInterface) {
  const active = sessionOf()
  const tools = await readyTools($, active)
  const ytdlp: Ytdlp = { settings: active.settings, places: active.places, path: tools.ytdlp.path, runtime: runtimeArgsOf(tools.runtime) }

  return { ytdlp, mpv: tools.mpv.path }
}

async function writeControl($: EngineInterface) {
  if (!session) {
    return
  }

  const [shown, level] = await Promise.all([get($, 'phase'), get($, 'volume')])
  const control: Control = { run: String(run), pause: shown === 'paused', volume: level, seek }
  await $.fs.write(session.places.control, JSON.stringify(control))
}

async function showStatus($: EngineInterface) {
  const [track, shown] = await Promise.all([get($, 'current'), get($, 'phase')])

  if (!track || shown === 'idle') {
    $.ui.status(undefined)
    return
  }

  const key: TextKey = shown === 'paused' ? 'statusPaused' : shown === 'loading' ? 'statusLoading' : 'statusPlaying'
  $.ui.status(say(key, { title: titleOf(track) }))
}

async function clearPlayer($: EngineInterface, shown: 'idle' | 'loading') {
  cancelRetry()
  nextRun()
  await set($, 'current', null)
  await set($, 'phase', shown)
  await set($, 'position', 0)
  await set($, 'length', 0)
  await set($, 'cover', null)
  await writeControl($)
  await showStatus($)
}

async function goIdle($: EngineInterface) {
  await clearPlayer($, 'idle')
  await $.store.delete(CURRENT_KEY)
}

async function waitUntil($: EngineInterface, at: number) {
  const wait = at - (await $.clock.now())
  if (wait > 0) {
    await new Promise<void>(resolve => {
      $.clock.after(wait, resolve)
    })
  }
}

async function refreshCover($: EngineInterface, mpv: string, track: Track, mine: number) {
  const made = await coverOf($, mpv, sessionOf().places, track, mine)
  if (mine === run) {
    await set($, 'cover', made)
  }
}

async function listen($: EngineInterface, argv: string[], mine: number): Promise<Outcome> {
  const child = $.process.spawn({ argv })
  let buffer = ''
  let ended: Outcome | null = null
  let second = -1
  let total = -1

  try {
    for await (const { stream, text } of child) {
      if (mine !== run) {
        return { reason: 'stop', error: '' }
      }
      if (stream !== 'stdout') {
        continue
      }

      const { reports, rest } = readReports(buffer + text)
      buffer = rest
      for (const report of reports) {
        if (report.kind === 'start') {
          failures = 0
          settle(mine, null)
          await put($, 'phase', now => (now === 'loading' ? 'playing' : now))
          await showStatus($)
        } else if (report.kind === 'position' && report.seconds !== null && Math.floor(report.seconds) !== second) {
          second = Math.floor(report.seconds)
          await set($, 'position', second)
        } else if (report.kind === 'length' && report.seconds !== null && Math.round(report.seconds) !== total) {
          total = Math.round(report.seconds)
          await set($, 'length', total)
        } else if (report.kind === 'end') {
          ended = { reason: report.reason, error: report.error }
        }
      }
    }
  } catch (error) {
    throw new Problem('playerMissing', { reason: problemText(error) })
  }

  const { code } = await child.result

  return ended ?? (code === 0 ? { reason: 'eof', error: '' } : { reason: 'error', error: `exit ${code}` })
}

async function failed($: EngineInterface, track: Track, error: unknown, mine: number) {
  const reply = replyOf('couldNotPlay', { title: titleOf(track), reason: problemText(error) }, true)
  settle(mine, reply)

  if (error instanceof Problem && FATAL.has(error.key)) {
    await setList($, 'queue', list => (list[0]?.id === track.id ? list : [track, ...list]))
    await goIdle($)
    await told($, reply)
    return
  }

  failures += 1
  await told($, reply)
  await setList($, 'played', list => withPlayed(list, track))
  await set($, 'current', null)

  if (failures >= MAX_FAILURES) {
    const count = failures
    failures = 0
    await goIdle($)
    await tell($, 'tooManyFailures', { count }, true)
    return
  }

  await set($, 'phase', 'loading')
  retry = $.clock.after(BACKOFF_MS * failures, () => {
    retry = null
    detach(advance($, false))
  })
}

async function play($: EngineInterface, track: Track, mine: number, startAt: number) {
  try {
    const { ytdlp, mpv } = await toolsFor($)
    const ready = await resolvedTrack($, ytdlp, track)
    if (mine !== run) {
      return
    }
    if (ready !== track) {
      seen.add(ready.id)
      await set($, 'current', ready)
      await set($, 'length', ready.duration)
      await $.store.set(CURRENT_KEY, ready)
    }

    detach(refreshCover($, mpv, ready, mine))
    const stream = await streamFor($, ytdlp, ready)
    if (stream.availableAt !== null) {
      await waitUntil($, stream.availableAt * MS_PER_SECOND + AVAILABLE_MARGIN_MS)
    }
    if (mine !== run) {
      return
    }

    const places = sessionOf().places
    const [level, shown] = await Promise.all([get($, 'volume'), get($, 'phase')])
    await writeControl($)
    const outcome = await listen(
      $,
      playerArgv({
        mpv,
        script: places.script,
        control: places.control,
        run: String(mine),
        volume: level,
        start: startAt,
        isPaused: shown === 'paused',
        stream,
      }),
      mine,
    )
    if (mine !== run) {
      return
    }
    if (outcome.reason === 'eof') {
      await advance($, false)
      return
    }

    await failed($, ready, new Problem('failure', { reason: outcome.error || outcome.reason }), mine)
  } catch (error) {
    if (mine === run) {
      await failed($, track, error, mine)
    }
  }
}

async function start($: EngineInterface, track: Track, startAt = 0, isPaused = false) {
  cancelRetry()
  const mine = nextRun()
  const started = new Promise<Reply | null>(resolve => waiters.set(mine, resolve))
  seen.add(track.id)
  await set($, 'current', track)
  await set($, 'phase', isPaused ? 'paused' : 'loading')
  await set($, 'position', startAt)
  await set($, 'length', track.duration)
  await put($, 'cover', now => (now?.id === track.id ? now : null))
  await $.store.set(CURRENT_KEY, track)
  await writeControl($)
  await showStatus($)
  detach(play($, track, mine, startAt))

  return { started }
}

async function settleCurrent($: EngineInterface) {
  const now = await get($, 'current')
  if (now) {
    await setList($, 'played', list => withPlayed(list, now))
  }
}

async function proceed($: EngineInterface, wasSkipped: boolean): Promise<Pending | null> {
  const [now, mode, queued, history, isRandom, isAuto] = await Promise.all([
    get($, 'current'),
    get($, 'loop'),
    get($, 'queue'),
    get($, 'played'),
    get($, 'isShuffled'),
    get($, 'isAutoplay'),
  ])
  const lists = now ? finished({ queue: queued, played: history }, now, mode, wasSkipped) : { queue: queued, played: history }
  const picked = takeNext(lists.queue, isRandom, Math.random)

  await setList($, 'queue', () => picked.queue)
  if (now) {
    await setList($, 'played', () => lists.played)
  }
  if (picked.track) {
    await start($, picked.track)
    return null
  }
  if (!isAuto) {
    await goIdle($)
    return null
  }

  await clearPlayer($, 'loading')

  return { run, seed: now ?? lists.played.at(-1) ?? null }
}

async function autoplayPick($: EngineInterface, last: Track | null): Promise<Track | null> {
  const { ytdlp } = await toolsFor($)

  for (const seed of candidatesOf(last, seeds)) {
    const related = await relatedTo($, ytdlp, seed, seen, Math.random).catch(() => null)
    if (!related) {
      continue
    }

    seen.add(related.id)
    const [better] = await searchTracks($, ytdlp, related.title, 'autoplay').catch((): Track[] => [])

    return { ...(better ?? related), requestedBy: 'autoplay', isAutoplay: true }
  }

  return null
}

async function afterAutoplay($: EngineInterface, pending: Pending, found: Track | null) {
  if (pending.run !== run) {
    return
  }

  const next = takeNext(await get($, 'queue'), await get($, 'isShuffled'), Math.random)
  if (next.track) {
    await setList($, 'queue', () => next.queue)
    await start($, next.track)
  } else if (found) {
    await start($, found)
  } else {
    await goIdle($)
  }
}

export async function advance($: EngineInterface, wasSkipped: boolean) {
  const pending = await serially(() => proceed($, wasSkipped))
  if (!pending) {
    return
  }

  const found = await autoplayPick($, pending.seed).catch(() => null)
  await serially(() => afterAutoplay($, pending, found))
}

async function placed($: EngineInterface, tracks: Track[], placement: Placement) {
  const [first, ...rest] = tracks
  const isIdle = (await get($, 'phase')) === 'idle'

  if (first && (placement === 'now' || isIdle)) {
    await setList($, 'queue', list => [...rest, ...list])
    await settleCurrent($)
    return start($, first)
  }

  await setList($, 'queue', list => (placement === 'next' ? [...tracks, ...list] : [...list, ...tracks]))

  return null
}

export async function addSongs($: EngineInterface, raw: string, requestedBy: Requester, placement: Placement): Promise<Reply> {
  await set($, 'isSearching', true)

  try {
    const { ytdlp } = await toolsFor($)
    const tracks = await findTracks($, ytdlp, raw, requestedBy, count => {
      if (count % PROGRESS_STEP === 0) {
        detach(tell($, countKey('readingList', count), { count }))
      }
    })
    seeds = tracks.reduce(withSeed, seeds)

    const playing = await serially(() => placed($, tracks, placement))
    await set($, 'isSearching', false)
    const failure = playing ? await playing.started : null
    const [first] = tracks

    if (failure) {
      return failure
    }

    return await told(
      $,
      tracks.length === 1 && first
        ? replyOf(playing ? 'playingNow' : 'addedOne', { title: titleOf(first) })
        : replyOf(countKey('addedMany', tracks.length), { count: tracks.length }),
    )
  } catch (error) {
    return told($, replyOf('couldNotAdd', { reason: problemText(error) }, true))
  } finally {
    await set($, 'isSearching', false)
  }
}

async function pauseOrPlay($: EngineInterface): Promise<Reply> {
  const [shown, track] = await Promise.all([get($, 'phase'), get($, 'current')])

  if (shown === 'idle') {
    if ((await get($, 'queue')).length === 0) {
      return told($, replyOf('nothingPlaying', {}, true))
    }

    await proceed($, false)
    const next = await get($, 'current')
    return replyOf('playingNow', { title: next ? titleOf(next) : '' })
  }
  if (!track || shown === 'loading') {
    return replyOf('loading')
  }

  const isPausing = shown === 'playing'
  await set($, 'phase', isPausing ? 'paused' : 'playing')
  await writeControl($)
  await showStatus($)

  return replyOf(isPausing ? 'pausedReply' : 'resumedReply', { title: titleOf(track) })
}

export function togglePause($: EngineInterface) {
  return serially(() => pauseOrPlay($))
}

export async function skip($: EngineInterface): Promise<Reply> {
  const track = await get($, 'current')
  if (!track) {
    return told($, replyOf('nothingPlaying', {}, true))
  }

  await advance($, true)

  return replyOf('skipped', { title: titleOf(track) })
}

async function stepBack($: EngineInterface): Promise<Reply> {
  const previous = (await get($, 'played')).at(-1)
  if (!previous) {
    return told($, replyOf('noPrevious', {}, true))
  }

  const now = await get($, 'current')
  await setList($, 'played', list => list.slice(0, -1))
  if (now) {
    await setList($, 'queue', list => [now, ...list])
  }
  await start($, previous)

  return replyOf('playingNow', { title: titleOf(previous) })
}

export function back($: EngineInterface) {
  return serially(() => stepBack($))
}

async function stopAll($: EngineInterface) {
  await settleCurrent($)
  await setList($, 'queue', () => [])
  await goIdle($)

  return told($, replyOf('stopped'))
}

export function stop($: EngineInterface) {
  return serially(() => stopAll($))
}

export async function setLoop($: EngineInterface, mode: LoopMode) {
  await set($, 'loop', mode)
  await $.store.set(LOOP_KEY, mode)

  return replyOf('loopIs', { mode: say(LOOP_NAMES[mode]) })
}

export async function cycleLoop($: EngineInterface) {
  return setLoop($, LOOP_CYCLE[await get($, 'loop')])
}

export async function toggleShuffle($: EngineInterface) {
  const isOn = await put($, 'isShuffled', now => !now)
  await $.store.set(SHUFFLE_KEY, isOn)
  if (isOn) {
    await serially(() => setList($, 'queue', list => shuffled(list, Math.random)))
  }

  return replyOf('shuffleIs', { state: switchOf(isOn) })
}

export async function toggleAutoplay($: EngineInterface) {
  const isOn = await put($, 'isAutoplay', now => !now)
  await $.store.set(AUTOPLAY_KEY, isOn)

  const isIdle = (await get($, 'phase')) === 'idle'
  if (isOn && isIdle && (seeds.length > 0 || (await get($, 'played')).length > 0)) {
    detach(advance($, false))
  }

  return replyOf('autoplayIs', { state: switchOf(isOn) })
}

export async function setVolume($: EngineInterface, level: number) {
  const next = await set($, 'volume', Math.round(Math.min(VOLUME_MAX, Math.max(0, level))))
  await $.store.set(VOLUME_KEY, next)
  await writeControl($)

  return replyOf('volumeIs', { volume: next })
}

export async function changeVolume($: EngineInterface, step: number) {
  return setVolume($, (await get($, 'volume')) + step)
}

export async function seekTo($: EngineInterface, seconds: number): Promise<Reply> {
  const [shown, total] = await Promise.all([get($, 'phase'), get($, 'length')])
  if (shown !== 'playing' && shown !== 'paused') {
    return told($, replyOf('nothingPlaying', {}, true))
  }

  const to = Math.max(0, total > 0 ? Math.min(seconds, total - 1) : seconds)
  seek = { id: seek.id + 1, to }
  await set($, 'position', Math.floor(to))
  await writeControl($)

  return replyOf('seekedTo', { position: clockOf(to) })
}

export async function seekBy($: EngineInterface, seconds: number) {
  return seekTo($, (await get($, 'position')) + seconds)
}

export async function toggleFavorite($: EngineInterface, track?: Track): Promise<Reply> {
  const chosen = track ?? (await get($, 'current'))
  if (!chosen) {
    return told($, replyOf('nothingPlaying', {}, true))
  }

  let isAdded = false
  await setList($, 'favorites', list => {
    const toggled = toggledFavorite(list, chosen)
    isAdded = toggled.isAdded
    return toggled.favorites
  })

  return told($, replyOf(isAdded ? 'favoriteAdded' : 'favoriteRemoved', { title: titleOf(chosen) }))
}

async function entryOf($: EngineInterface, list: ListName, index: number) {
  return (await get($, list))[index] ?? null
}

async function playEntry($: EngineInterface, list: ListName, index: number): Promise<Reply> {
  const track = await entryOf($, list, index)
  if (!track) {
    return told($, replyOf('noSuchSong', { number: index + 1 }, true))
  }

  if (list === 'queue') {
    await setList($, 'queue', items => removedAt(items, index))
  }
  await settleCurrent($)
  await start($, list === 'queue' ? track : requestedAs(track, 'you'))

  return replyOf('playingNow', { title: titleOf(track) })
}

export function playFrom($: EngineInterface, list: ListName, index: number) {
  return serially(() => playEntry($, list, index))
}

async function queueEntry($: EngineInterface, list: ListName, index: number): Promise<Reply> {
  const track = await entryOf($, list, index)
  if (!track) {
    return told($, replyOf('noSuchSong', { number: index + 1 }, true))
  }

  const queued = requestedAs(track, 'you')
  if ((await get($, 'phase')) === 'idle') {
    await start($, queued)
    return replyOf('playingNow', { title: titleOf(track) })
  }

  await setList($, 'queue', items => [...items, queued])

  return told($, replyOf('addedOne', { title: titleOf(track) }))
}

export function enqueueFrom($: EngineInterface, list: ListName, index: number) {
  return serially(() => queueEntry($, list, index))
}

async function removeEntry($: EngineInterface, list: ListName, index: number): Promise<Reply> {
  const track = await entryOf($, list, index)
  if (!track) {
    return told($, replyOf('noSuchSong', { number: index + 1 }, true))
  }

  await setList($, list, items => removedAt(items, index))

  return replyOf('removed', { title: titleOf(track) })
}

export function removeFrom($: EngineInterface, list: ListName, index: number) {
  return serially(() => removeEntry($, list, index))
}

async function moveEntry($: EngineInterface, index: number, target: number): Promise<Reply> {
  const track = await entryOf($, 'queue', index)
  if (!track) {
    return told($, replyOf('noSuchSong', { number: index + 1 }, true))
  }

  const moved = await setList($, 'queue', items => movedTo(items, index, target))

  return replyOf('moved', { title: titleOf(track), number: moved.indexOf(track) + 1 })
}

export function moveInQueue($: EngineInterface, index: number, target: number) {
  return serially(() => moveEntry($, index, target))
}

async function emptyList($: EngineInterface, list: 'queue' | 'played') {
  await setList($, list, () => [])

  return told($, replyOf(list === 'queue' ? 'queueCleared' : 'historyCleared'))
}

export function clearList($: EngineInterface, list: 'queue' | 'played') {
  return serially(() => emptyList($, list))
}

async function storedOf<T>($: EngineInterface, key: string, isValid: (value: unknown) => value is T) {
  const value = await $.store.get(key)

  return isValid(value) ? value : null
}

export async function restore($: EngineInterface, active: Session) {
  session = active

  const [queued, history, liked] = await Promise.all([
    loadList($, active.places, 'queue'),
    loadList($, active.places, 'played'),
    loadList($, active.places, 'favorites'),
  ])
  const [mode, isRandom, isAuto, level, saved] = await Promise.all([
    storedOf($, LOOP_KEY, isLoopMode),
    storedOf($, SHUFFLE_KEY, isBoolean),
    storedOf($, AUTOPLAY_KEY, isBoolean),
    storedOf($, VOLUME_KEY, isLevel),
    storedOf($, CURRENT_KEY, isStoredTrack),
  ])

  await set($, 'favorites', liked)
  await set($, 'played', history)
  await put($, 'loop', now => mode ?? now)
  await put($, 'isShuffled', now => isRandom ?? now)
  await put($, 'isAutoplay', now => isAuto ?? now)
  await put($, 'volume', now => level ?? now)

  const [now, shown, at] = await Promise.all([get($, 'current'), get($, 'phase'), get($, 'position')])
  if (now && shown !== 'idle') {
    await set($, 'queue', queued)
    await start($, now, at, shown === 'paused')
    return
  }

  await setList($, 'queue', () => (saved && !queued.some(track => track.id === saved.id) ? [saved, ...queued] : queued))
  await $.store.delete(CURRENT_KEY)
}