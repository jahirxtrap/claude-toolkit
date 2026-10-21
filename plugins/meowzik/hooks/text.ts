import type { LoopMode, Notice, Track } from '../types'

const TEXT = {
  paneTitle: 'Meowzik',
  commandDescription: 'Open the Meowzik music player, or play a song, link or playlist',
  commandHint: '[song, link or playlist]',
  paneOpened: 'Meowzik is open.',
  paneWaiting: 'Meowzik opens when there is room for it: {reason}',

  nowPlaying: 'Now Playing',
  paused: 'Paused',
  loading: 'Loading',
  idleLead: 'Nothing is playing right now.',
  idleHint: 'Add a song below, or ask Claude to play something.',
  idleHintMobile: 'Ask Claude to play something.',
  idleQueued: 'Press {play} to start the queue.',
  untitled: 'Unknown',
  unknownLength: 'Live / Unknown',
  byline: '{uploader} · {length}',
  requestedBy: 'Requested by {name}',
  requesterYou: 'You',
  requesterClaude: 'Claude',
  requesterAutoplay: 'Autoplay',
  progress: '{position} / {length}',
  nextUp: 'Next: {title}',
  nextRandom: 'Next: a random song from the queue',
  nextAutoplay: 'Next: autoplay picks a related song',
  modes: 'Loop: {loop} · Shuffle: {shuffle} · Autoplay: {autoplay} · Volume: {volume}%',
  modeOn: 'On',
  modeOff: 'Off',
  loopOff: 'Off',
  loopTrack: 'Track',
  loopQueue: 'Queue',
  coverAlt: 'Cover of {title}',
  logoAlt: 'Meowzik',

  volumeShort: 'Vol',
  percent: '{value}%',
  rewind: '-10 s',
  forward: '+10 s',

  addLabel: 'Add song',
  addPlaceholder: 'Song name, link or playlist',
  addSubmit: 'add',
  searching: 'Searching',

  tabQueue: 'Queue ({count})',
  tabHistory: 'History ({count})',
  tabFavorites: 'Favorites ({count})',
  tabLyrics: 'Lyrics',
  tabSetup: 'Setup',
  lyricsIdle: 'Play a song to see its lyrics.',
  lyricsLoading: 'Looking for the lyrics',
  lyricsMissing: 'No lyrics found for this song.',
  lyricsInstrumental: 'Instrumental',
  lyricsUnreachable: 'Could not reach the lyrics service.',
  lyricsRetry: 'Try again',
  lyricsUnsynced: 'These lyrics are not synced to the song.',
  lyricsHint: 'Press a line to jump to it.',
  lyricsCredit: 'Lyrics from LRCLIB',
  lyricsSubtitles: "Lyrics from the video's subtitles",
  lyricsCaptions: "Lyrics from YouTube's automatic captions, which may be off",
  emptyQueue: 'The queue is empty.',
  emptyHistory: 'Nothing played yet.',
  emptyFavorites: 'No favorites yet: press {favorite} while a song plays.',
  listHint: 'Press a song to play it now.',
  row: '{number}. {title}',
  rowRemove: 'Remove',
  rowUp: 'Up',
  rowDown: 'Down',
  rowQueue: 'Queue',
  rowFavorite: 'Favorite',
  rowUnfavorite: 'Unfavorite',
  pageLabel: 'Page {page} of {pages}',
  pagePrevious: 'Previous',
  pageNext: 'Next',
  clearQueue: 'Clear queue',
  clearHistory: 'Clear history',

  setupPlayer: 'Player',
  miniPlayerLabel: 'Mini player above the prompt',
  miniPlayerPlaying: 'While music plays',
  miniPlayerAlways: 'Always',
  miniPlayerOff: 'Off',
  statusLineLabel: 'Song in the status line',
  miniTitle: '{note} {title}',
  setupTools: 'Tools',
  toolReady: '{tool} {version}',
  toolPath: '{path}',
  toolMissing: '{tool}: not installed',
  toolChecking: 'Checking the tools',
  installButton: 'Install missing tools',
  installing: 'Installing',
  installWhere: 'Meowzik downloads what is missing into {folder}; nothing else on your system changes.',
  installBrew: 'Meowzik installs what is missing with Homebrew.',
  manualMpv: 'Install mpv yourself, then press Check again: {command}',
  recheck: 'Check again',
  setupYoutube: 'YouTube',
  cookiesNone: 'No cookies set. If YouTube asks to confirm you are not a bot, set a cookies file in /config under meowzik.',
  cookiesReady: 'Cookies ready: {count} youtube.com cookies.',
  cookiesBrowser: 'Cookies read from {browser}.',
  cookiesUnreadable: 'Cannot read the cookies file {path}.',
  cookiesNoYoutube: '{path} holds no youtube.com cookies: export them from a tab logged into YouTube.',
  cookiesNoSession: '{path} is not a logged-in export (missing {names}): export it again with a session open.',
  cookiesExpired: 'The session in {path} expired ({names}): export it again.',
  setupSearch: 'Search source: {source}',
  sourceYoutube: 'YouTube',
  sourceSoundcloud: 'SoundCloud',
  setupConfig: 'Change the search source, cookies and tool paths in /config, under meowzik.',
  setupData: 'Queue, history and favorites are kept in {folder}.',

  addedOne: 'Added to queue: {title}',
  addedMany_one: 'Added {count} song to the queue.',
  addedMany_other: 'Added {count} songs to the queue.',
  readingList_one: 'Reading the playlist: {count} song so far.',
  readingList_other: 'Reading the playlist: {count} songs so far.',
  playingNow: 'Now playing: {title}',
  noResults: 'No results found.',
  failure: '{reason}',
  couldNotAdd: 'Could not play that: {reason}',
  couldNotPlay: 'Could not play {title}: {reason}',
  tooManyFailures: '{count} songs failed in a row, so playback stopped.',
  botCheck: 'YouTube asked to confirm you are not a bot. Set a cookies file in /config under meowzik, or switch the search source to SoundCloud.',
  botCheckCookies: 'YouTube refused the cookies too: export them again from a logged-in tab.',
  spotifyUnreadable: 'Could not read that Spotify link.',
  sunoUnreadable: 'Could not read that Suno link (only public songs play).',
  noStream: 'no audio stream was found.',
  nothingPlaying: 'Nothing is playing.',
  noPrevious: 'No previous song.',
  pausedReply: 'Paused {title}.',
  resumedReply: 'Playing {title} again.',
  skipped: 'Skipped {title}.',
  noSuchSong: 'There is no song number {number} in that list.',
  removed: 'Removed {title}.',
  moved: 'Moved {title} to number {number}.',
  favoriteAdded: 'Added to favorites: {title}',
  favoriteRemoved: 'Removed from favorites: {title}',
  stopped: 'Stopped, and the queue is clear.',
  queueCleared: 'The queue is clear.',
  historyCleared: 'The history is clear.',
  loopIs: 'Loop: {mode}',
  shuffleIs: 'Shuffle: {state}',
  autoplayIs: 'Autoplay: {state}',
  volumeIs: 'Volume: {volume}%',
  seekedTo: 'Jumped to {position}.',
  needsTools: 'Installing {tools}, which Meowzik needs to play music.',
  stillMissing: 'it is still not found after installing.',
  playerMissing: 'Could not start mpv: {reason}',
  autoplaySearching: 'Autoplay is picking a related song',
  installDone: 'Installed {tools}.',
  installFailed: 'Could not install {tool}: {reason}',
  installStep: '{tool}: {step}',
  stepDownload: 'downloading',
  stepExtract: 'unpacking',
  stepBrew: 'installing with Homebrew',
  homeMissing: 'Could not find your home folder, so Meowzik cannot keep its files.',

  unknownAction: 'Meowzik has no {action} action here.',
  toolNowLine: '{state}: {title} {url} ({progress})',
  toolListLine: '{number}. {title} ({length}) {url}',

  statusPlaying: 'Playing: {title}',
  statusPaused: 'Paused: {title}',
  statusLoading: 'Loading: {title}',
} as const

export type TextKey = keyof typeof TEXT

export type Params = Record<string, string | number>

type CountedKey = { [K in TextKey]: K extends `${infer Base}_other` ? Base : never }[TextKey]

const PLURALS = new Intl.PluralRules('en')
const ELLIPSIS = '…'

export class Problem extends Error {
  constructor(
    readonly key: TextKey,
    readonly params: Params = {},
  ) {
    super(key)
  }
}

export const say = (key: TextKey, params: Params = {}) =>
  TEXT[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))

export const countKey = (key: CountedKey, count: number) => {
  const exact = `${key}_${PLURALS.select(count)}`

  return (exact in TEXT ? exact : `${key}_other`) as TextKey
}

export const isTextKey = (key: string): key is TextKey => key in TEXT

export const noticeTextOf = (notice: Notice) => (isTextKey(notice.key) ? say(notice.key, notice.params) : notice.key)

export const problemText = (error: unknown) =>
  error instanceof Problem ? say(error.key, error.params) : error instanceof Error ? error.message : String(error)

export const clockOf = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, '0')

  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

export const clipped = (text: string, columns: number) => {
  const characters = [...text]

  return characters.length > columns ? `${characters.slice(0, Math.max(1, columns - 1)).join('')}${ELLIPSIS}` : text
}

export const lengthOf = (seconds: number) => (seconds > 0 ? clockOf(seconds) : say('unknownLength'))

export const LOOP_NAMES: Record<LoopMode, TextKey> = { off: 'loopOff', track: 'loopTrack', queue: 'loopQueue' }

export const titleOf = (track: Track) => track.title || say('untitled')

export const switchOf = (isOn: boolean) => say(isOn ? 'modeOn' : 'modeOff')

export const modesOf = (modes: { loop: LoopMode; isShuffled: boolean; isAutoplay: boolean; volume: number }) =>
  say('modes', {
    loop: say(LOOP_NAMES[modes.loop]),
    shuffle: switchOf(modes.isShuffled),
    autoplay: switchOf(modes.isAutoplay),
    volume: modes.volume,
  })