import type { EngineInterface, ToolSpec } from 'claude-code'

import type { LoopMode, Track } from '../types'
import {
  addSongs,
  back,
  clearList,
  cycleLoop,
  enqueueFrom,
  moveInQueue,
  playFrom,
  refreshShared,
  removeFrom,
  seekTo,
  setLoop,
  setVolume,
  skip,
  stop,
  toggleAutoplay,
  toggleFavorite,
  togglePause,
  toggleShuffle,
} from './playback'
import type { Placement, Reply } from './playback'
import { isShared } from './shelf'
import type { ListName } from './shelf'
import { get, snapshot } from './state'
import { clockOf, lengthOf, modesOf, noticeTextOf, say, switchOf, titleOf } from './text'
import { openPane } from './view'

type Input = Record<string, unknown>

const LIST_NAMES: Record<string, ListName> = { queue: 'queue', history: 'played', favorites: 'favorites' }
const LIST_TABS: Record<ListName, 'tabQueue' | 'tabHistory' | 'tabFavorites'> = { queue: 'tabQueue', played: 'tabHistory', favorites: 'tabFavorites' }
const PLACEMENTS: readonly Placement[] = ['end', 'next', 'now']
const LOOP_MODES: readonly LoopMode[] = ['off', 'track', 'queue']
const DEFAULT_LIMIT = 20
const STATUS_NEXT = 5
const ON = 'on'

export const TOOL_SPECS: readonly ToolSpec[] = [
  {
    name: 'play',
    description:
      'Play music in Meowzik, the music player beside the chat. Takes a song to search for, or a YouTube, SoundCloud, Spotify or Suno link, or a whole YouTube playlist, SoundCloud set, Spotify album or playlist. Songs join the queue and start at once when nothing is playing.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A song name (artist and title work best) or a link.' },
        placement: {
          type: 'string',
          enum: PLACEMENTS,
          description: 'end: after the queue (the default); next: right after the current song; now: play it at once.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'control',
    description:
      'Control Meowzik playback: pause, resume, skip, back (the previous song), stop (also clears the queue), loop (off, track or queue), shuffle, autoplay (related songs when the queue runs out), favorite the current song, volume (0 to 100), seek (seconds), or open the player pane.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['pause', 'resume', 'skip', 'back', 'stop', 'loop', 'shuffle', 'autoplay', 'favorite', 'volume', 'seek', 'open'],
        },
        value: {
          type: ['string', 'number'],
          description:
            'loop: off, track or queue (absent: the next mode); shuffle and autoplay: on or off (absent: toggle); volume: 0 to 100; seek: seconds from the start.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'status',
    description: 'What Meowzik is playing now, where it is in the song, the loop, shuffle, autoplay and volume settings, and the next songs in the queue.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list',
    description:
      'Read or change a Meowzik list: the queue, the history (most recent first) or the favorites (most recent first). show lists songs with their numbers; play plays one now; queue adds one to the end of the queue; remove takes one out; move moves a queued song to another number; clear empties the queue or the history.',
    inputSchema: {
      type: 'object',
      properties: {
        list: { type: 'string', enum: Object.keys(LIST_NAMES) },
        action: { type: 'string', enum: ['show', 'play', 'queue', 'remove', 'move', 'clear'] },
        number: { type: 'number', description: 'The song number, as show lists it (1 is the first).' },
        to: { type: 'number', description: 'move: the number the song should end up at.' },
        offset: { type: 'number', description: 'show: how many songs to skip from the start (default 0).' },
        limit: { type: 'number', description: `show: how many songs to list (default ${DEFAULT_LIMIT}).` },
      },
      required: ['list', 'action'],
    },
  },
]

const spoken = (reply: Reply) => say(reply.key, reply.params)

const textOf = (input: Input, key: string) => {
  const value = input[key]

  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

const numberOf = (input: Input, key: string) => {
  const value = Number(input[key])

  return input[key] === undefined || input[key] === '' || !Number.isFinite(value) ? null : value
}

const lineOf = (track: Track, number: number) =>
  say('toolListLine', { number, title: titleOf(track), length: lengthOf(track.duration), url: track.url }).trim()

const unknown = (action: string) => say('unknownAction', { action })

const ordered = (items: readonly Track[], list: ListName) => (list === 'queue' ? [...items] : [...items].reverse())

const indexIn = (count: number, list: ListName, number: number) => (list === 'queue' ? number - 1 : count - number)

const wantsToggle = (value: string, isOn: boolean) => value === '' || (value === ON) !== isOn

export async function statusText($: EngineInterface) {
  const view = await snapshot($)
  const track = view.current
  const playing = track
    ? say('toolNowLine', {
        state: say(view.phase === 'paused' ? 'paused' : view.phase === 'loading' ? 'loading' : 'nowPlaying'),
        title: titleOf(track),
        url: track.url,
        progress: say('progress', { position: clockOf(view.position), length: lengthOf(view.length) }),
      })
    : say('nothingPlaying')
  const next = view.queue.slice(0, STATUS_NEXT).map((item, index) => lineOf(item, index + 1))
  const problem = view.notice?.isError ? [noticeTextOf(view.notice)] : []

  return [playing, ...problem, modesOf(view), say('tabQueue', { count: view.queue.length }), ...next].join('\n')
}

async function shuffleTo($: EngineInterface, value: string) {
  const isOn = await get($, 'isShuffled')

  return wantsToggle(value, isOn) ? spoken(await toggleShuffle($)) : say('shuffleIs', { state: switchOf(isOn) })
}

async function autoplayTo($: EngineInterface, value: string) {
  const isOn = await get($, 'isAutoplay')

  return wantsToggle(value, isOn) ? spoken(await toggleAutoplay($)) : say('autoplayIs', { state: switchOf(isOn) })
}

async function controlled($: EngineInterface, input: Input) {
  const action = textOf(input, 'action')
  const value = textOf(input, 'value').toLowerCase()
  const shown = await get($, 'phase')

  switch (action) {
    case 'pause':
      return shown === 'playing' ? spoken(await togglePause($)) : statusText($)
    case 'resume':
      return shown === 'paused' || shown === 'idle' ? spoken(await togglePause($)) : statusText($)
    case 'skip':
      return spoken(await skip($))
    case 'back':
      return spoken(await back($))
    case 'stop':
      return spoken(await stop($))
    case 'loop':
      return spoken(LOOP_MODES.includes(value as LoopMode) ? await setLoop($, value as LoopMode) : await cycleLoop($))
    case 'shuffle':
      return shuffleTo($, value)
    case 'autoplay':
      return autoplayTo($, value)
    case 'favorite':
      return spoken(await toggleFavorite($))
    case 'volume':
      return spoken(await setVolume($, numberOf(input, 'value') ?? (await get($, 'volume'))))
    case 'seek':
      return spoken(await seekTo($, numberOf(input, 'value') ?? 0))
    case 'open':
      return openPane($)
    default:
      return unknown(action)
  }
}

async function listed($: EngineInterface, input: Input) {
  const list = LIST_NAMES[textOf(input, 'list')]
  const action = textOf(input, 'action')
  if (!list) {
    return unknown(textOf(input, 'list'))
  }
  if (isShared(list)) {
    await refreshShared($)
  }

  const items = await get($, list)
  const number = numberOf(input, 'number') ?? 0
  const index = indexIn(items.length, list, number)

  switch (action) {
    case 'show': {
      const offset = Math.max(0, numberOf(input, 'offset') ?? 0)
      const limit = Math.max(1, numberOf(input, 'limit') ?? DEFAULT_LIMIT)
      const lines = ordered(items, list)
        .slice(offset, offset + limit)
        .map((track, at) => lineOf(track, offset + at + 1))

      return [say(LIST_TABS[list], { count: items.length }), ...lines].join('\n')
    }
    case 'play':
      return spoken(await playFrom($, list, index))
    case 'queue':
      return spoken(await enqueueFrom($, list, index))
    case 'remove':
      return spoken(await removeFrom($, list, index))
    case 'move':
      return list === 'queue' ? spoken(await moveInQueue($, index, (numberOf(input, 'to') ?? number) - 1)) : unknown(action)
    case 'clear':
      return list === 'favorites' ? unknown(action) : spoken(await clearList($, list))
    default:
      return unknown(action)
  }
}

async function played($: EngineInterface, input: Input) {
  const placement = PLACEMENTS.find(option => option === textOf(input, 'placement')) ?? 'end'
  const reply = await addSongs($, textOf(input, 'query'), 'claude', placement)
  await openPane($)

  return spoken(reply)
}

export async function answerTool($: EngineInterface, name: string, input: Input) {
  switch (name) {
    case 'play':
      return played($, input)
    case 'control':
      return controlled($, input)
    case 'status':
      return statusText($)
    default:
      return listed($, input)
  }
}