import type { Requester, Source, Track } from '../types'

export type SearchSource = 'youtube' | 'soundcloud'

export type SpotifyType = 'track' | 'album' | 'playlist'

export type Query =
  | { kind: 'search'; text: string }
  | { kind: 'playlist'; url: string; isFlat: boolean }
  | { kind: 'spotify'; type: SpotifyType; id: string }
  | { kind: 'suno'; url: string }
  | { kind: 'link'; url: string }

export type Stream = { url: string; headers: Record<string, string>; availableAt: number | null }

type Entry = {
  id?: string
  title?: string
  duration?: number
  uploader?: string
  channel?: string
  url?: string
  webpage_url?: string
  thumbnail?: string
  ie_key?: string
  extractor_key?: string
}

type SpotifyItem = { uri?: string; title?: string; subtitle?: string; duration?: number }

type SpotifyEntity = SpotifyItem & {
  type?: string
  name?: string
  artists?: { name?: string }[]
  trackList?: SpotifyItem[]
  coverArt?: { sources?: { url?: string; width?: number }[] }
}

export const ENTRY_TEMPLATE = '%(.{id,title,duration,uploader,channel,url,webpage_url,thumbnail,ie_key,extractor_key})j'
export const STREAM_TEMPLATE = '%(.{url,http_headers,available_at})j'
export const STREAM_FORMAT = 'bestaudio[ext=webm]/bestaudio/best'
export const FEED_SIZE = 25
export const PICK_POOL = 12

const BOT_CHECK = /Sign in to confirm|not a bot|--cookies/i
const LINK = /^https?:\/\/([^/?#]+)([^?#]*)/i
const YOUTUBE_HOST = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)$/i
const SOUNDCLOUD_HOST = /^(?:www\.|m\.)?soundcloud\.com$/i
const SUNO_LINK = /^https?:\/\/(?:www\.)?suno\.(?:com|ai)\/(?:song|s)\//i
const SPOTIFY_LINK = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/i
const PLAYLIST_ID = /[?&]list=([A-Za-z0-9_-]+)/
const MIX_PREFIX = 'RD'
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const PREVIEW = /cf-preview-media\.sndcdn\.com|\/preview\//i
const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
const ERROR_PREFIX = /^ERROR:\s*(?:\[[^\]]+\]\s*(?:[^:\s]+:\s*)?)?/
const SUNO_UPLOADER = 'Suno'
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&#x27;': "'" }

const hostOf = (url: string) => url.match(LINK)?.[1]?.toLowerCase() ?? ''

const pathOf = (url: string) => url.match(LINK)?.[2] ?? ''

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isBotCheck = (text: string) => BOT_CHECK.test(text)

export const youtubeUrlOf = (id: string) => `https://www.youtube.com/watch?v=${id}`

export const youtubeThumbnailOf = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

export const spotifyEmbedOf = (type: SpotifyType, id: string) => `https://open.spotify.com/embed/${type}/${id}`

export const queryOf = (raw: string): Query => {
  const text = raw.trim()
  if (!LINK.test(text)) {
    return { kind: 'search', text }
  }

  const spotify = text.match(SPOTIFY_LINK)
  if (spotify?.[1] && spotify[2]) {
    return { kind: 'spotify', type: spotify[1].toLowerCase() as SpotifyType, id: spotify[2] }
  }
  if (SUNO_LINK.test(text)) {
    return { kind: 'suno', url: text }
  }

  const host = hostOf(text)
  const list = text.match(PLAYLIST_ID)?.[1]
  if (YOUTUBE_HOST.test(host) && list) {
    return {
      kind: 'playlist',
      url: list.startsWith(MIX_PREFIX) ? text : `https://www.youtube.com/playlist?list=${list}`,
      isFlat: true,
    }
  }
  if (SOUNDCLOUD_HOST.test(host) && /\/sets\//i.test(pathOf(text))) {
    return { kind: 'playlist', url: text, isFlat: false }
  }

  return { kind: 'link', url: text }
}

export const searchOf = (text: string, source: SearchSource) =>
  source === 'soundcloud'
    ? { target: `scsearch5:${text}`, args: ['--ignore-errors'] }
    : { target: `ytsearch1:${text} audio`, args: ['--flat-playlist'] }

const sourceOf = (entry: Entry, link: string): Source => {
  const key = (entry.ie_key ?? entry.extractor_key ?? '').toLowerCase()
  const host = hostOf(link)

  if (key.startsWith('youtube') || YOUTUBE_HOST.test(host)) {
    return 'youtube'
  }

  return key.startsWith('soundcloud') || SOUNDCLOUD_HOST.test(host) ? 'soundcloud' : 'web'
}

export const trackOf = (value: unknown, requestedBy: Requester): Track | null => {
  if (!isRecord(value)) {
    return null
  }

  const entry = value as Entry
  if (typeof entry.id !== 'string' || entry.id === '' || PREVIEW.test(entry.url ?? '')) {
    return null
  }

  const link = entry.webpage_url ?? entry.url ?? ''
  const source = sourceOf(entry, link)

  return {
    id: entry.id,
    title: entry.title ?? '',
    url: source === 'youtube' ? youtubeUrlOf(entry.id) : link,
    duration: Math.round(entry.duration ?? 0),
    uploader: entry.uploader ?? entry.channel ?? '',
    thumbnail: entry.thumbnail ?? (source === 'youtube' ? youtubeThumbnailOf(entry.id) : null),
    source,
    requestedBy,
  }
}

export const tracksOf = (lines: readonly string[], requestedBy: Requester) =>
  lines.flatMap(line => {
    try {
      const track = trackOf(JSON.parse(line), requestedBy)
      return track ? [track] : []
    } catch {
      return []
    }
  })

export const streamOf = (line: string): Stream | null => {
  try {
    const value: unknown = JSON.parse(line)
    if (!isRecord(value) || typeof value.url !== 'string') {
      return null
    }

    const headers = isRecord(value.http_headers)
      ? Object.fromEntries(Object.entries(value.http_headers).filter((pair): pair is [string, string] => typeof pair[1] === 'string'))
      : {}

    return { url: value.url, headers, availableAt: typeof value.available_at === 'number' ? value.available_at : null }
  } catch {
    return null
  }
}

export const reasonOf = (stderr: string) => {
  const lines = stderr.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const error = lines.filter(line => line.startsWith('ERROR:')).at(-1) ?? lines.at(-1) ?? ''

  return error.replace(ERROR_PREFIX, '').trim()
}

const spotifyEntityOf = (html: string): SpotifyEntity | null => {
  const data = html.match(NEXT_DATA)?.[1]
  if (!data) {
    return null
  }

  try {
    const entity: unknown = JSON.parse(data)?.props?.pageProps?.state?.data?.entity
    return isRecord(entity) ? (entity as SpotifyEntity) : null
  } catch {
    return null
  }
}

const pendingOf = (item: SpotifyItem, thumbnail: string | null, requestedBy: Requester): Track | null => {
  const id = item.uri?.split(':').at(-1)
  const title = item.title?.trim()
  if (!id || !title) {
    return null
  }

  const uploader = item.subtitle?.trim() ?? ''

  return {
    id: `spotify:${id}`,
    title,
    url: `https://open.spotify.com/track/${id}`,
    duration: Math.round((item.duration ?? 0) / 1000),
    uploader,
    thumbnail,
    source: 'spotify',
    requestedBy,
    query: `${uploader} ${title}`.trim(),
  }
}

export const spotifyTracksOf = (html: string, requestedBy: Requester): Track[] => {
  const entity = spotifyEntityOf(html)
  if (!entity) {
    return []
  }

  const cover = [...(entity.coverArt?.sources ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null
  const items: SpotifyItem[] =
    entity.type === 'track'
      ? [
          {
            uri: entity.uri,
            title: entity.name ?? entity.title,
            subtitle: (entity.artists ?? []).map(artist => artist.name).filter(Boolean).join(', ') || entity.subtitle,
            duration: entity.duration,
          },
        ]
      : (entity.trackList ?? [])

  return items.flatMap(item => pendingOf(item, cover, requestedBy) ?? [])
}

const metaOf = (html: string, property: string) =>
  html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, 'i'))?.[1] ??
  null

const decoded = (text: string) => text.replace(/&(?:amp|lt|gt|quot|#0?39|#x27);/gi, entity => ENTITIES[entity.toLowerCase()] ?? entity)

const sunoMediaOf = (html: string, field: 'audio_url' | 'video_url', id: string) =>
  [...html.matchAll(new RegExp(field + String.raw`\\?"\s*:\s*\\?"(https://[^"\\]+)`, 'g'))]
    .map(match => match[1] ?? '')
    .find(url => url.includes(id)) ?? null

export const sunoTrackOf = (html: string, link: string, requestedBy: Requester): Track | null => {
  const id = [link, metaOf(html, 'og:url') ?? '', metaOf(html, 'og:audio') ?? '', html]
    .map(text => text.match(UUID)?.[0])
    .find(Boolean)
  if (!id) {
    return null
  }

  return {
    id,
    title: decoded(metaOf(html, 'og:title') ?? ''),
    url: `https://suno.com/song/${id}`,
    duration: 0,
    uploader: SUNO_UPLOADER,
    thumbnail: metaOf(html, 'og:image'),
    source: 'suno',
    requestedBy,
    streamUrl: sunoMediaOf(html, 'audio_url', id) ?? sunoMediaOf(html, 'video_url', id) ?? `https://cdn1.suno.ai/${id}.mp3`,
  }
}

export const relatedFeedOf = (seed: Track) => {
  if (seed.source === 'soundcloud') {
    return `${seed.url.replace(/\/+$/, '')}/recommended`
  }

  return seed.source === 'youtube' ? `https://www.youtube.com/watch?v=${seed.id}&list=${MIX_PREFIX}${seed.id}` : null
}

export const pickRelated = (tracks: readonly Track[], seedId: string, seen: ReadonlySet<string>, random: () => number) => {
  const pool = tracks.filter(track => track.id !== seedId && !seen.has(track.id)).slice(0, PICK_POOL)

  return pool.length === 0 ? null : (pool[Math.floor(random() * pool.length)] ?? null)
}