import { expect, test } from 'claude-code/testing'

import type { Track } from '../types'
import {
  candidatesOf,
  finished,
  LOOP_CYCLE,
  movedTo,
  pageOf,
  requestedAs,
  shuffled,
  takeNext,
  toggledFavorite,
  withPlayed,
  withSeed,
} from './queue'
import { chunksOf } from './shelf'

const track = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  title: id,
  url: `https://www.youtube.com/watch?v=${id}`,
  duration: 200,
  uploader: '',
  thumbnail: null,
  source: 'youtube',
  requestedBy: 'you',
  ...extra,
})

const ids = (tracks: readonly Track[]) => tracks.map(item => item.id)

test('loop cycles off, track, queue and back', () => {
  expect([LOOP_CYCLE.off, LOOP_CYCLE.track, LOOP_CYCLE.queue]).toEqual(['track', 'queue', 'off'])
})

test('the next song is the head of the queue, or a random one while shuffled', () => {
  const queue = [track('a'), track('b'), track('c')]

  expect(takeNext(queue, false, () => 0.9)).toEqual({ track: queue[0], queue: [queue[1], queue[2]] })
  expect(ids([takeNext(queue, true, () => 0.9).track as Track])).toEqual(['c'])
  expect(takeNext([], false, () => 0)).toEqual({ track: null, queue: [] })
})

test('a finished song goes to the history once, and loops put it back', () => {
  const lists = { queue: [track('b')], played: [track('x'), track('a')] }
  const current = track('a')

  expect(ids(finished(lists, current, 'off', false).played)).toEqual(['x', 'a'])
  expect(ids(finished(lists, current, 'track', false).queue)).toEqual(['a', 'b'])
  expect(ids(finished(lists, current, 'queue', false).queue)).toEqual(['b', 'a'])
  expect(ids(finished(lists, current, 'track', true).queue)).toEqual(['b'])
  expect(ids(finished(lists, track('a', { isAutoplay: true }), 'queue', false).queue)).toEqual(['b'])
  expect(ids(withPlayed([track('a'), track('b')], track('a')))).toEqual(['b', 'a'])
})

test('shuffling keeps every song and moving puts one where asked', () => {
  const queue = ['a', 'b', 'c', 'd'].map(id => track(id))

  expect(ids(shuffled(queue, () => 0)).sort()).toEqual(['a', 'b', 'c', 'd'])
  expect(ids(shuffled(queue, () => 0))).toEqual(['b', 'c', 'd', 'a'])
  expect(ids(movedTo(queue, 3, 0))).toEqual(['d', 'a', 'b', 'c'])
  expect(ids(movedTo(queue, 0, 9))).toEqual(['a', 'b', 'c', 'd'])
})

test('a favorite toggles, and it never keeps the autoplay mark', () => {
  const added = toggledFavorite([], track('a', { isAutoplay: true, requestedBy: 'autoplay' }))

  expect(added.isAdded).toBe(true)
  expect(added.favorites[0]).toEqual(track('a'))
  expect(toggledFavorite(added.favorites, track('a'))).toEqual({ favorites: [], isAdded: false })
  expect(requestedAs(track('a', { isAutoplay: true }), 'claude')).toEqual(track('a', { requestedBy: 'claude' }))
})

test('autoplay seeds from the last song first, then the newest requests', () => {
  const seeds = ['a', 'b', 'c'].reduce<Track[]>((list, id) => withSeed(list, track(id)), [])

  expect(ids(withSeed(seeds, track('a')))).toEqual(['b', 'c', 'a'])
  expect(ids(candidatesOf(track('z'), seeds))).toEqual(['z', 'c', 'b', 'a'])
  expect(ids(candidatesOf(track('c'), seeds))).toEqual(['c', 'b', 'a'])
})

test('lists page without a cap and the files chunk the same way', () => {
  const many = Array.from({ length: 1234 }, (_, index) => index)

  expect(pageOf(many, 99, 50)).toMatchObject({ page: 24, pages: 25 })
  expect(pageOf(many, 24, 50).rows.at(-1)).toEqual({ item: 1233, index: 1233 })
  expect(pageOf([], 3, 50)).toEqual({ page: 0, pages: 1, rows: [] })
  expect(chunksOf(many).map(chunk => chunk.length)).toEqual([500, 500, 234])
})