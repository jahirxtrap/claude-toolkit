import { expect, test } from 'claude-code/testing'

import {
  isBotCheck,
  pickRelated,
  queryOf,
  reasonOf,
  relatedFeedOf,
  searchOf,
  spotifyTracksOf,
  streamOf,
  sunoTrackOf,
  trackOf,
  tracksOf,
} from './sources'

const UUID = '0f3e2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b'

const nextData = (entity: unknown) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script></html>`

test('a query is told apart by what it links to', () => {
  expect(queryOf('  daft punk one more time ')).toEqual({ kind: 'search', text: 'daft punk one more time' })
  expect(queryOf('https://www.youtube.com/watch?v=abc&list=PLxyz_1')).toEqual({
    kind: 'playlist',
    url: 'https://www.youtube.com/playlist?list=PLxyz_1',
    isFlat: true,
  })
  expect(queryOf('https://www.youtube.com/watch?v=abc&list=RDabc')).toEqual({
    kind: 'playlist',
    url: 'https://www.youtube.com/watch?v=abc&list=RDabc',
    isFlat: true,
  })
  expect(queryOf('https://soundcloud.com/artist/sets/album')).toEqual({ kind: 'playlist', url: 'https://soundcloud.com/artist/sets/album', isFlat: false })
  expect(queryOf('https://open.spotify.com/intl-es/album/4m2880jivSbbyEGAKfITCa?si=1')).toEqual({
    kind: 'spotify',
    type: 'album',
    id: '4m2880jivSbbyEGAKfITCa',
  })
  expect(queryOf(`https://suno.com/song/${UUID}`)).toEqual({ kind: 'suno', url: `https://suno.com/song/${UUID}` })
  expect(queryOf('https://youtu.be/A2VpR8HahKc')).toEqual({ kind: 'link', url: 'https://youtu.be/A2VpR8HahKc' })
  expect(queryOf('https://soundcloud.com/artist/track')).toEqual({ kind: 'link', url: 'https://soundcloud.com/artist/track' })
})

test('a search asks one YouTube result with audio in mind then without, or five from SoundCloud', () => {
  expect(searchOf('one more time', 'youtube')).toEqual({
    targets: ['ytsearch1:one more time audio', 'ytsearch1:one more time'],
    args: ['--flat-playlist'],
  })
  expect(searchOf('one more time', 'soundcloud')).toEqual({ targets: ['scsearch5:one more time'], args: ['--ignore-errors'] })
})

test('a yt-dlp entry becomes a track, and previews and broken lines are dropped', () => {
  const youtube = {
    id: 'A2VpR8HahKc',
    title: 'One More Time',
    duration: 320.6,
    channel: 'Daft Punk',
    url: 'https://www.youtube.com/watch?v=A2VpR8HahKc',
    ie_key: 'Youtube',
  }
  const soundcloud = {
    id: '199428706',
    title: 'One More Time',
    duration: 322.606,
    uploader: 'Daft Punk',
    url: 'https://playback.media-streaming.soundcloud.cloud/x/playlist.m3u8',
    webpage_url: 'https://soundcloud.com/daft-punk-id/daft-punk-one-more-time',
    thumbnail: 'https://i1.sndcdn.com/artworks-t500x500.jpg',
  }
  const preview = { ...soundcloud, id: '2366118086', url: 'https://cf-preview-media.sndcdn.com/preview/0/30/x.128.mp3' }

  expect(trackOf(youtube, 'you')).toEqual({
    id: 'A2VpR8HahKc',
    title: 'One More Time',
    url: 'https://www.youtube.com/watch?v=A2VpR8HahKc',
    duration: 321,
    uploader: 'Daft Punk',
    thumbnail: 'https://i.ytimg.com/vi/A2VpR8HahKc/hqdefault.jpg',
    source: 'youtube',
    requestedBy: 'you',
  })
  expect(trackOf(soundcloud, 'claude')).toMatchObject({
    url: 'https://soundcloud.com/daft-punk-id/daft-punk-one-more-time',
    source: 'soundcloud',
    duration: 323,
  })
  expect(trackOf(preview, 'you')).toBeNull()
  expect(tracksOf([JSON.stringify(preview), 'not json', JSON.stringify(soundcloud)], 'you').map(track => track.id)).toEqual(['199428706'])
})

test('the stream line carries the url, the headers mpv needs and when YouTube serves it', () => {
  expect(streamOf('{"url": "https://x/audio.webm", "http_headers": {"User-Agent": "UA", "Accept": "*/*", "Bad": 3}}')).toEqual({
    url: 'https://x/audio.webm',
    headers: { 'User-Agent': 'UA', Accept: '*/*' },
    availableAt: null,
  })
  expect(streamOf('{"url": "https://x/a.webm", "available_at": 1792619260}')?.availableAt).toBe(1792619260)
  expect(streamOf('{"title": "no url"}')).toBeNull()
})

test('the bot check and the last error line are read off stderr', () => {
  const stderr = "WARNING: something\nERROR: [youtube] A2VpR8HahKc: Sign in to confirm you're not a bot. Use --cookies"

  expect(isBotCheck(stderr)).toBe(true)
  expect(reasonOf(stderr)).toBe("Sign in to confirm you're not a bot. Use --cookies")
  expect(reasonOf('ERROR: Unsupported URL: https://example.com')).toBe('Unsupported URL: https://example.com')
})

test('a Spotify album becomes songs to look up when they play', () => {
  const html = nextData({
    type: 'album',
    name: 'Random Access Memories',
    coverArt: { sources: [{ url: 'small.jpg', width: 64 }, { url: 'large.jpg', width: 640 }] },
    trackList: [
      { uri: 'spotify:track:0dEIca2nhcxDUV8C5QkPYb', title: 'Give Life Back to Music', subtitle: 'Daft Punk', duration: 275386 },
      { uri: 'spotify:track:broken' },
    ],
  })

  expect(spotifyTracksOf(html, 'you')).toEqual([
    {
      id: 'spotify:0dEIca2nhcxDUV8C5QkPYb',
      title: 'Give Life Back to Music',
      url: 'https://open.spotify.com/track/0dEIca2nhcxDUV8C5QkPYb',
      duration: 275,
      uploader: 'Daft Punk',
      thumbnail: 'large.jpg',
      source: 'spotify',
      requestedBy: 'you',
      query: 'Daft Punk Give Life Back to Music',
    },
  ])
})

test('a Spotify track names its artists', () => {
  const html = nextData({
    type: 'track',
    uri: 'spotify:track:abc',
    name: 'Get Lucky',
    artists: [{ name: 'Daft Punk' }, { name: 'Pharrell Williams' }],
    duration: 369000,
  })

  expect(spotifyTracksOf(html, 'claude')[0]).toMatchObject({ title: 'Get Lucky', query: 'Daft Punk, Pharrell Williams Get Lucky' })
  expect(spotifyTracksOf('<html></html>', 'you')).toEqual([])
})

test('a Suno page gives the song, its cover and the mp3', () => {
  const html = `<meta property="og:title" content="Neon &amp; Rain"><meta property="og:image" content="https://cdn2.suno.ai/image_${UUID}.jpeg">`

  expect(sunoTrackOf(html, `https://suno.com/song/${UUID}`, 'you')).toMatchObject({
    id: UUID,
    title: 'Neon & Rain',
    streamUrl: `https://cdn1.suno.ai/${UUID}.mp3`,
    thumbnail: `https://cdn2.suno.ai/image_${UUID}.jpeg`,
    source: 'suno',
  })
  expect(sunoTrackOf('<html></html>', 'https://suno.com/s/short', 'you')).toBeNull()
})

test('a Suno page that hides the mp3 plays the public video of the same song', () => {
  const other = '9a8b7c6d-1e2f-4a3b-8c9d-0e1f2a3b4c5d'
  const html = [
    `<meta property="og:url" content="https://suno.com/song/${UUID}">`,
    `self.__next_f.push([1,"{\\"video_url\\":\\"https://cdn1.suno.ai/${other}.mp4\\"}"])`,
    `self.__next_f.push([1,"{\\"audio_url\\":\\"https://studio-api.prod.suno.com/api/forbidden\\",\\"video_url\\":\\"https://cdn1.suno.ai/${UUID}.mp4\\"}"])`,
  ].join('\n')

  expect(sunoTrackOf(html, 'https://suno.com/s/abc', 'you')?.streamUrl).toBe(`https://cdn1.suno.ai/${UUID}.mp4`)
  expect(sunoTrackOf(`{"audio_url": "https://cdn1.suno.ai/${UUID}.mp3"}`, `https://suno.com/song/${UUID}`, 'you')?.streamUrl).toBe(
    `https://cdn1.suno.ai/${UUID}.mp3`,
  )
})

test('autoplay follows the mix or the recommendations and skips what was heard', () => {
  const seed = { id: 'A2VpR8HahKc', title: '', url: 'https://www.youtube.com/watch?v=A2VpR8HahKc', duration: 0, uploader: '', thumbnail: null, source: 'youtube', requestedBy: 'you' } as const
  const related = ['A2VpR8HahKc', 'one', 'two', 'three'].map(id => ({ ...seed, id }))

  expect(relatedFeedOf(seed)).toBe('https://www.youtube.com/watch?v=A2VpR8HahKc&list=RDA2VpR8HahKc')
  expect(relatedFeedOf({ ...seed, source: 'soundcloud', url: 'https://soundcloud.com/a/b/' })).toBe('https://soundcloud.com/a/b/recommended')
  expect(relatedFeedOf({ ...seed, source: 'suno' })).toBeNull()
  expect(pickRelated(related, seed.id, new Set(['one']), () => 0.99)?.id).toBe('three')
  expect(pickRelated(related, seed.id, new Set(['one', 'two', 'three']), () => 0)).toBeNull()
})