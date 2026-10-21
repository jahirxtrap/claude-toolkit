import type { EngineInterface } from 'claude-code'

import type { Requester, Track } from '../types'
import {
  ENTRY_TEMPLATE,
  FEED_SIZE,
  pickRelated,
  queryOf,
  relatedFeedOf,
  searchOf,
  spotifyEmbedOf,
  spotifyTracksOf,
  STREAM_FORMAT,
  STREAM_TEMPLATE,
  streamOf,
  sunoTrackOf,
  tracksOf,
} from './sources'
import type { Query, Stream } from './sources'
import { Problem } from './text'
import { ytdlpLines } from './ytdlp'
import type { Ytdlp } from './ytdlp'

const PAGE_HEADERS = { 'User-Agent': 'Mozilla/5.0' }

async function pageOf($: EngineInterface, url: string, problem: 'spotifyUnreadable' | 'sunoUnreadable') {
  const response = await $.http.fetch(url, { headers: PAGE_HEADERS }).catch(() => null)
  if (!response?.ok) {
    throw new Problem(problem)
  }

  return response.text
}

export async function searchTracks($: EngineInterface, ytdlp: Ytdlp, text: string, requestedBy: Requester) {
  const search = searchOf(text, ytdlp.settings.searchSource)
  const found = tracksOf(await ytdlpLines($, ytdlp, [...search.args, '--print', ENTRY_TEMPLATE, search.target]), requestedBy)

  return found.slice(0, 1)
}

async function tracksFor($: EngineInterface, ytdlp: Ytdlp, query: Query, requestedBy: Requester, onLine: () => void): Promise<Track[]> {
  switch (query.kind) {
    case 'search':
      return searchTracks($, ytdlp, query.text, requestedBy)
    case 'playlist': {
      const flat = query.isFlat ? ['--flat-playlist'] : []
      const lines = await ytdlpLines($, ytdlp, [...flat, '--yes-playlist', '--ignore-errors', '--print', ENTRY_TEMPLATE, query.url], onLine)
      return tracksOf(lines, requestedBy)
    }
    case 'spotify':
      return spotifyTracksOf(await pageOf($, spotifyEmbedOf(query.type, query.id), 'spotifyUnreadable'), requestedBy)
    case 'suno': {
      const track = sunoTrackOf(await pageOf($, query.url, 'sunoUnreadable'), query.url, requestedBy)
      if (!track) {
        throw new Problem('sunoUnreadable')
      }
      return [track]
    }
    case 'link':
      return tracksOf(await ytdlpLines($, ytdlp, ['--no-playlist', '--print', ENTRY_TEMPLATE, query.url]), requestedBy).slice(0, 1)
  }
}

export async function findTracks($: EngineInterface, ytdlp: Ytdlp, raw: string, requestedBy: Requester, onCount?: (count: number) => void) {
  const query = queryOf(raw)
  let count = 0
  const found = await tracksFor($, ytdlp, query, requestedBy, () => onCount?.((count += 1)))

  if (found.length === 0) {
    throw new Problem(query.kind === 'spotify' ? 'spotifyUnreadable' : 'noResults')
  }

  return found
}

export async function resolvedTrack($: EngineInterface, ytdlp: Ytdlp, track: Track): Promise<Track> {
  if (!track.query) {
    return track
  }

  const [found] = await searchTracks($, ytdlp, track.query, track.requestedBy)
  if (!found) {
    throw new Problem('noResults')
  }

  return { ...found, requestedBy: track.requestedBy, ...(track.isAutoplay ? { isAutoplay: true } : {}) }
}

export async function streamFor($: EngineInterface, ytdlp: Ytdlp, track: Track): Promise<Stream> {
  if (track.streamUrl) {
    return { url: track.streamUrl, headers: {}, availableAt: null }
  }

  const [line] = await ytdlpLines($, ytdlp, ['--no-playlist', '-f', STREAM_FORMAT, '--print', STREAM_TEMPLATE, track.url])
  const stream = line ? streamOf(line) : null
  if (!stream) {
    throw new Problem('noStream')
  }

  return stream
}

export async function relatedTo($: EngineInterface, ytdlp: Ytdlp, seed: Track, seen: ReadonlySet<string>, random: () => number) {
  const feed = relatedFeedOf(seed)
  if (!feed) {
    return null
  }

  const lines = await ytdlpLines($, ytdlp, ['--flat-playlist', '--yes-playlist', '--playlist-end', String(FEED_SIZE), '--print', ENTRY_TEMPLATE, feed])

  return pickRelated(tracksOf(lines, 'autoplay'), seed.id, seen, random)
}