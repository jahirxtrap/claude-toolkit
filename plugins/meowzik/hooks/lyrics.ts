import type { EngineInterface } from 'claude-code'

import type { LyricLine, Lyrics, LyricsSource, Track } from '../types'

type LyricsRecord = {
  trackName?: string
  artistName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

type SubtitleEvent = { tStartMs?: number; segs?: { utf8?: string }[] }

const API = 'https://lrclib.net/api'
const USER_AGENT = 'meowzik (https://github.com/jahirxtrap/claude-toolkit)'
const TIMESTAMP = /\[(\d+):(\d+(?:\.\d+)?)\]/g
const NOISE = /[([][^)\]]*?(?:official|video|audio|lyric|lyrics|letra|visuali[sz]er|music|hd|4k|remaster|live|en vivo|videoclip)[^)\]]*[)\]]/gi
const FEATURING = /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i
const UPLOADER_NOISE = /\s*(?:-\s*topic|vevo|official)\s*$/i
const SEPARATOR = /\s+[-–—]\s+/
const CAPTION_NOISE = /^\[[^\]]*\]$/
const SUBTITLE_FILE = /^subs\.(.+)\.json3$/
const ORIGINAL = '-orig'
const FALLBACK_LANGUAGE = 'en'
const NOT_FOUND = 404
const MS_PER_SECOND = 1000

export const SUBTITLE_NAME = 'subs'
export const MANUAL_LANGUAGES = 'all,-live_chat'

const isRecord = (value: unknown): value is LyricsRecord => typeof value === 'object' && value !== null && !Array.isArray(value)

const isUsable = (record: LyricsRecord) => Boolean(record.instrumental || record.syncedLyrics || record.plainLyrics)

export const emptyLyrics = (trackId: string, status: Lyrics['status']): Lyrics => ({ trackId, status, isSynced: false, lines: [], source: null })

export const lyricsQueryOf = (track: Track) => {
  const cleaned = track.title.replace(NOISE, '').replace(FEATURING, '').replace(/\s{2,}/g, ' ').trim()
  const [left = '', ...right] = cleaned.split(SEPARATOR)
  const hasArtist = right.length > 0 && left.trim() !== ''

  return {
    artist: hasArtist ? left.trim() : track.uploader.replace(UPLOADER_NOISE, '').trim(),
    title: hasArtist ? right.join(' - ').trim() : cleaned,
    duration: Math.round(track.duration),
  }
}

export const syncedLinesOf = (synced: string): LyricLine[] =>
  synced
    .split(/\r?\n/)
    .flatMap(line => {
      const text = line.replace(TIMESTAMP, '').trim()
      return [...line.matchAll(TIMESTAMP)].map(stamp => ({ at: Number(stamp[1]) * 60 + Number(stamp[2]), text }))
    })
    .sort((a, b) => a.at - b.at)

export const plainLinesOf = (plain: string): LyricLine[] => plain.split(/\r?\n/).map(text => ({ at: -1, text: text.trim() }))

export const subtitleLinesOf = (json3: string): LyricLine[] => {
  const parsed: unknown = JSON.parse(json3)
  const events = (parsed as { events?: SubtitleEvent[] } | null)?.events ?? []

  return events
    .flatMap(event => {
      const text = (event.segs ?? [])
        .map(segment => segment.utf8 ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
      return typeof event.tStartMs === 'number' && text && !CAPTION_NOISE.test(text) ? [{ at: event.tStartMs / MS_PER_SECOND, text }] : []
    })
    .sort((a, b) => a.at - b.at)
}

export const captionLanguagesOf = (language: string) => (language ? `${language}${ORIGINAL},${language}` : `.*${ORIGINAL}`)

export const subtitleChoiceOf = (names: readonly string[], language: string) => {
  const languages = names.flatMap(name => SUBTITLE_FILE.exec(name)?.[1] ?? [])
  const base = language.toLowerCase()
  const chosen =
    languages.find(code => code.toLowerCase() === base) ??
    languages.find(code => base !== '' && code.toLowerCase().startsWith(base)) ??
    (languages.length === 1 ? languages[0] : undefined) ??
    languages.find(code => code.toLowerCase().startsWith(FALLBACK_LANGUAGE)) ??
    [...languages].sort()[0]

  return chosen === undefined ? null : `${SUBTITLE_NAME}.${chosen}.json3`
}

export const pickRecord = (records: readonly LyricsRecord[], duration: number) => {
  const distanceOf = (record: LyricsRecord) => (duration > 0 && record.duration ? Math.abs(record.duration - duration) : 0)

  return (
    records
      .filter(isUsable)
      .map(record => ({ record, score: (record.syncedLyrics ? 0 : 1000) + distanceOf(record) }))
      .sort((a, b) => a.score - b.score)[0]?.record ?? null
  )
}

export const lyricsOf = (trackId: string, record: LyricsRecord | null): Lyrics => {
  if (record?.instrumental) {
    return { ...emptyLyrics(trackId, 'instrumental'), source: 'lrclib' }
  }
  if (record?.syncedLyrics) {
    return { trackId, status: 'found', isSynced: true, lines: syncedLinesOf(record.syncedLyrics), source: 'lrclib' }
  }
  if (record?.plainLyrics) {
    return { trackId, status: 'found', isSynced: false, lines: plainLinesOf(record.plainLyrics), source: 'lrclib' }
  }

  return emptyLyrics(trackId, 'missing')
}

export const subtitleLyricsOf = (trackId: string, lines: LyricLine[], source: LyricsSource): Lyrics | null =>
  lines.length > 0 ? { trackId, status: 'found', isSynced: true, lines, source } : null

export const lineAt = (lines: readonly LyricLine[], seconds: number) => lines.findLastIndex(line => line.at <= seconds)

async function fetched($: EngineInterface, path: string, query: Record<string, string>): Promise<unknown> {
  const response = await $.http.fetch(`${API}/${path}?${new URLSearchParams(query).toString()}`, { headers: { 'User-Agent': USER_AGENT } })
  if (response.status === NOT_FOUND) {
    return null
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return JSON.parse(response.text)
}

async function searched($: EngineInterface, query: Record<string, string>) {
  const found = await fetched($, 'search', query)

  return Array.isArray(found) ? found.filter(isRecord) : []
}

export async function lyricsFor($: EngineInterface, track: Track): Promise<Lyrics> {
  const query = lyricsQueryOf(track)

  if (query.artist && query.duration > 0) {
    const exact = await fetched($, 'get', { artist_name: query.artist, track_name: query.title, duration: String(query.duration) }).catch(
      () => null,
    )
    if (isRecord(exact) && isUsable(exact)) {
      return lyricsOf(track.id, exact)
    }
  }

  const byFields = query.artist ? await searched($, { artist_name: query.artist, track_name: query.title }) : []
  const records = byFields.length > 0 ? byFields : await searched($, { q: `${query.artist} ${query.title}`.trim() })

  return lyricsOf(track.id, pickRecord(records, query.duration))
}