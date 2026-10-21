import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginState } from 'claude-code'

import type { Cover, LoopMode, Lyrics, MiniPlayer, Notice, Phase, Setup, Tab, Track } from '../types'
import type { Params, TextKey } from './text'

export type Values = PluginState['meowzik']

export type Key = keyof Values

export const DEFAULT_VOLUME = 80
const NOTICE_MS = 6000

const current = atom({ plugin: 'meowzik', key: 'current' } as const, null as Track | null)
const phase = atom({ plugin: 'meowzik', key: 'phase' } as const, 'idle' as Phase)
const position = atom({ plugin: 'meowzik', key: 'position' } as const, 0)
const length = atom({ plugin: 'meowzik', key: 'length' } as const, 0)
const queue = atom({ plugin: 'meowzik', key: 'queue' } as const, [] as Track[])
const played = atom({ plugin: 'meowzik', key: 'played' } as const, [] as Track[])
const favorites = atom({ plugin: 'meowzik', key: 'favorites' } as const, [] as Track[])
const loop = atom({ plugin: 'meowzik', key: 'loop' } as const, 'off' as LoopMode)
const isShuffled = atom({ plugin: 'meowzik', key: 'isShuffled' } as const, false)
const isAutoplay = atom({ plugin: 'meowzik', key: 'isAutoplay' } as const, false)
const volume = atom({ plugin: 'meowzik', key: 'volume' } as const, DEFAULT_VOLUME)
const miniPlayer = atom({ plugin: 'meowzik', key: 'miniPlayer' } as const, 'playing' as MiniPlayer)
const showsStatus = atom({ plugin: 'meowzik', key: 'showsStatus' } as const, true)
const tab = atom({ plugin: 'meowzik', key: 'tab' } as const, 'queue' as Tab)
const page = atom({ plugin: 'meowzik', key: 'page' } as const, 0)
const notice = atom({ plugin: 'meowzik', key: 'notice' } as const, null as Notice | null)
const isSearching = atom({ plugin: 'meowzik', key: 'isSearching' } as const, false)
const setup = atom(
  { plugin: 'meowzik', key: 'setup' } as const,
  {
    isChecked: false,
    isInstalling: false,
    mpv: null,
    ytdlp: null,
    runtime: null,
    folder: '',
    logo: '',
    manualMpv: null,
    canBrew: false,
    cookies: null,
    searchSource: 'youtube',
  } as Setup,
)
const cover = atom({ plugin: 'meowzik', key: 'cover' } as const, null as Cover | null)
const lyrics = atom({ plugin: 'meowzik', key: 'lyrics' } as const, null as Lyrics | null)

type Change<K extends Key> = (value: Values[K]) => Values[K]

export async function get<K extends Key>($: EngineInterface, key: K): Promise<Values[K]> {
  switch (key) {
    case 'current':
      return (await read($, current)) as Values[K]
    case 'phase':
      return (await read($, phase)) as Values[K]
    case 'position':
      return (await read($, position)) as Values[K]
    case 'length':
      return (await read($, length)) as Values[K]
    case 'queue':
      return (await read($, queue)) as Values[K]
    case 'played':
      return (await read($, played)) as Values[K]
    case 'favorites':
      return (await read($, favorites)) as Values[K]
    case 'loop':
      return (await read($, loop)) as Values[K]
    case 'isShuffled':
      return (await read($, isShuffled)) as Values[K]
    case 'isAutoplay':
      return (await read($, isAutoplay)) as Values[K]
    case 'volume':
      return (await read($, volume)) as Values[K]
    case 'miniPlayer':
      return (await read($, miniPlayer)) as Values[K]
    case 'showsStatus':
      return (await read($, showsStatus)) as Values[K]
    case 'tab':
      return (await read($, tab)) as Values[K]
    case 'page':
      return (await read($, page)) as Values[K]
    case 'notice':
      return (await read($, notice)) as Values[K]
    case 'isSearching':
      return (await read($, isSearching)) as Values[K]
    case 'setup':
      return (await read($, setup)) as Values[K]
    case 'lyrics':
      return (await read($, lyrics)) as Values[K]
    default:
      return (await read($, cover)) as Values[K]
  }
}

export async function put<K extends Key>($: EngineInterface, key: K, change: Change<K>): Promise<Values[K]> {
  const apply = change as unknown as <T>(value: T) => T

  switch (key) {
    case 'current':
      return (await update($, current, apply)) as Values[K]
    case 'phase':
      return (await update($, phase, apply)) as Values[K]
    case 'position':
      return (await update($, position, apply)) as Values[K]
    case 'length':
      return (await update($, length, apply)) as Values[K]
    case 'queue':
      return (await update($, queue, apply)) as Values[K]
    case 'played':
      return (await update($, played, apply)) as Values[K]
    case 'favorites':
      return (await update($, favorites, apply)) as Values[K]
    case 'loop':
      return (await update($, loop, apply)) as Values[K]
    case 'isShuffled':
      return (await update($, isShuffled, apply)) as Values[K]
    case 'isAutoplay':
      return (await update($, isAutoplay, apply)) as Values[K]
    case 'volume':
      return (await update($, volume, apply)) as Values[K]
    case 'miniPlayer':
      return (await update($, miniPlayer, apply)) as Values[K]
    case 'showsStatus':
      return (await update($, showsStatus, apply)) as Values[K]
    case 'tab':
      return (await update($, tab, apply)) as Values[K]
    case 'page':
      return (await update($, page, apply)) as Values[K]
    case 'notice':
      return (await update($, notice, apply)) as Values[K]
    case 'isSearching':
      return (await update($, isSearching, apply)) as Values[K]
    case 'setup':
      return (await update($, setup, apply)) as Values[K]
    case 'lyrics':
      return (await update($, lyrics, apply)) as Values[K]
    default:
      return (await update($, cover, apply)) as Values[K]
  }
}

export async function set<K extends Key>($: EngineInterface, key: K, value: Values[K]) {
  return put($, key, () => value)
}

export async function snapshot($: EngineInterface): Promise<Values> {
  const [
    shownCurrent,
    shownPhase,
    shownPosition,
    shownLength,
    shownQueue,
    shownPlayed,
    shownFavorites,
    shownLoop,
    shownShuffle,
    shownAutoplay,
    shownVolume,
    shownMiniPlayer,
    shownStatus,
    shownTab,
    shownPage,
    shownNotice,
    shownSearching,
    shownSetup,
    shownCover,
    shownLyrics,
  ] = await Promise.all([
    read($, current),
    read($, phase),
    read($, position),
    read($, length),
    read($, queue),
    read($, played),
    read($, favorites),
    read($, loop),
    read($, isShuffled),
    read($, isAutoplay),
    read($, volume),
    read($, miniPlayer),
    read($, showsStatus),
    read($, tab),
    read($, page),
    read($, notice),
    read($, isSearching),
    read($, setup),
    read($, cover),
    read($, lyrics),
  ])

  return {
    current: shownCurrent,
    phase: shownPhase,
    position: shownPosition,
    length: shownLength,
    queue: shownQueue,
    played: shownPlayed,
    favorites: shownFavorites,
    loop: shownLoop,
    isShuffled: shownShuffle,
    isAutoplay: shownAutoplay,
    volume: shownVolume,
    miniPlayer: shownMiniPlayer,
    showsStatus: shownStatus,
    tab: shownTab,
    page: shownPage,
    notice: shownNotice,
    isSearching: shownSearching,
    setup: shownSetup,
    cover: shownCover,
    lyrics: shownLyrics,
  }
}

async function fade($: EngineInterface, shown: Notice) {
  const now = await read($, notice)
  if (now !== null && JSON.stringify(now) === JSON.stringify(shown)) {
    await update($, notice, () => null)
  }
}

export async function tell($: EngineInterface, key: TextKey, params: Params = {}, isError = false) {
  const shown: Notice = { key, params: Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)])), isError }
  await update($, notice, () => shown)

  if (!isError) {
    $.clock.after(NOTICE_MS, () => void fade($, shown).catch(() => undefined))
  }
}