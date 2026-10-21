import { expect, test } from 'claude-code/testing'

import type { Track } from '../types'
import {
  captionLanguagesOf,
  lineAt,
  lyricsOf,
  lyricsQueryOf,
  pickRecord,
  plainLinesOf,
  subtitleChoiceOf,
  subtitleLinesOf,
  subtitleLyricsOf,
  syncedLinesOf,
} from './lyrics'

const track = (title: string, uploader = '', duration = 225): Track => ({
  id: 'x',
  title,
  url: 'https://www.youtube.com/watch?v=x',
  duration,
  uploader,
  thumbnail: null,
  source: 'youtube',
  requestedBy: 'you',
})

test('a video title becomes the artist and the song LRCLIB knows', () => {
  expect(lyricsQueryOf(track('Romeo Santos - Odio Feat. Drake (Lyric Video)', 'Romeo Santos'))).toEqual({
    artist: 'Romeo Santos',
    title: 'Odio',
    duration: 225,
  })
  expect(lyricsQueryOf(track('Xynitra - Este Cuerpo Ya No Es Mío (Official Lyric Video)'))).toMatchObject({
    artist: 'Xynitra',
    title: 'Este Cuerpo Ya No Es Mío',
  })
  expect(lyricsQueryOf(track('One More Time [Official Audio]', 'Daft Punk - Topic', 320.6))).toEqual({
    artist: 'Daft Punk',
    title: 'One More Time',
    duration: 321,
  })
})

test('synced lyrics are read by their time stamps, several per line included', () => {
  const lines = syncedLinesOf('[00:00.84] - Yeah, yeah!\n[01:02.50][00:30.00] Chorus\nno stamp\n[00:10.19]')

  expect(lines).toEqual([
    { at: 0.84, text: '- Yeah, yeah!' },
    { at: 10.19, text: '' },
    { at: 30, text: 'Chorus' },
    { at: 62.5, text: 'Chorus' },
  ])
  expect(lineAt(lines, 0.5)).toBe(-1)
  expect(lineAt(lines, 31)).toBe(2)
  expect(plainLinesOf('One\n\nTwo')).toEqual([
    { at: -1, text: 'One' },
    { at: -1, text: '' },
    { at: -1, text: 'Two' },
  ])
})

test('synced lyrics win, then the closest length', () => {
  const records = [
    { trackName: 'Odio', duration: 300, plainLyrics: 'plain far' },
    { trackName: 'Odio', duration: 229, syncedLyrics: '[00:01.00] near' },
    { trackName: 'Odio', duration: 225, plainLyrics: 'plain exact' },
    { trackName: 'Odio', duration: 225 },
  ]

  expect(pickRecord(records, 225)?.syncedLyrics).toBe('[00:01.00] near')
  expect(pickRecord(records.filter(record => !record.syncedLyrics), 225)?.plainLyrics).toBe('plain exact')
  expect(pickRecord([], 225)).toBeNull()
  expect(lyricsOf('x', { instrumental: true }).status).toBe('instrumental')
  expect(lyricsOf('x', null)).toEqual({ trackId: 'x', status: 'missing', isSynced: false, lines: [], source: null })
  expect(lyricsOf('x', { plainLyrics: 'a\nb' })).toMatchObject({ status: 'found', isSynced: false, source: 'lrclib' })
})

test("a video's subtitles become synced lines, without the [Music] cues", () => {
  const json3 = JSON.stringify({
    events: [
      { tStartMs: 18640, segs: [{ utf8: 'Never gonna ' }, { utf8: 'give you up' }] },
      { tStartMs: 1000, segs: [{ utf8: '[Music]' }] },
      { tStartMs: 22000, segs: [{ utf8: '\n' }] },
      { tStartMs: 22640, segs: [{ utf8: 'Never gonna\nlet you down' }] },
      { segs: [{ utf8: 'no time' }] },
    ],
  })

  expect(subtitleLinesOf(json3)).toEqual([
    { at: 18.64, text: 'Never gonna give you up' },
    { at: 22.64, text: 'Never gonna let you down' },
  ])
  expect(subtitleLyricsOf('x', [], 'subtitles')).toBeNull()
})

test("the subtitles in the video's own language are chosen", () => {
  const names = ['subs.de-DE.json3', 'subs.en.json3', 'subs.es-419.json3', 'control.json', 'cover.png']

  expect(subtitleChoiceOf(names, 'es')).toBe('subs.es-419.json3')
  expect(subtitleChoiceOf(names, 'en')).toBe('subs.en.json3')
  expect(subtitleChoiceOf(names, '')).toBe('subs.en.json3')
  expect(subtitleChoiceOf(['subs.ja.json3'], 'es')).toBe('subs.ja.json3')
  expect(subtitleChoiceOf(['cover.png'], 'es')).toBeNull()
  expect(captionLanguagesOf('es')).toBe('es-orig,es')
  expect(captionLanguagesOf('')).toBe('.*-orig')
})