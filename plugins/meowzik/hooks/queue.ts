import type { LoopMode, Requester, Track } from '../types'

export const LOOP_CYCLE: Record<LoopMode, LoopMode> = { off: 'track', track: 'queue', queue: 'off' }
export const SEED_WINDOW = 12
export const AUTOPLAY_CANDIDATES = 5

export const requestedAs = (track: Track, requestedBy: Requester): Track => {
  const { isAutoplay: _, ...rest } = track

  return { ...rest, requestedBy }
}

export const takeNext = (queue: readonly Track[], isShuffled: boolean, random: () => number) => {
  if (queue.length === 0) {
    return { track: null, queue: [] }
  }

  const index = isShuffled ? Math.floor(random() * queue.length) : 0

  return { track: queue[index] ?? null, queue: queue.filter((_, at) => at !== index) }
}

export const withPlayed = (played: readonly Track[], track: Track) => [...played.filter(item => item.id !== track.id), track]

export const finished = (
  lists: { queue: readonly Track[]; played: readonly Track[] },
  current: Track,
  loop: LoopMode,
  wasSkipped: boolean,
) => {
  const isLooped = !wasSkipped && !current.isAutoplay
  const queue =
    isLooped && loop === 'track'
      ? [current, ...lists.queue]
      : isLooped && loop === 'queue'
        ? [...lists.queue, current]
        : [...lists.queue]

  return { played: withPlayed(lists.played, current), queue }
}

export const shuffled = <T>(list: readonly T[], random: () => number) => {
  const copy = [...list]

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    const held = copy[index] as T
    copy[index] = copy[other] as T
    copy[other] = held
  }

  return copy
}

export const removedAt = <T>(list: readonly T[], index: number) => list.filter((_, at) => at !== index)

export const movedTo = <T>(list: readonly T[], from: number, to: number) => {
  const item = list[from]
  if (item === undefined || to < 0 || to >= list.length) {
    return [...list]
  }

  const rest = removedAt(list, from)

  return [...rest.slice(0, to), item, ...rest.slice(to)]
}

export const isFavorite = (favorites: readonly Track[], id: string) => favorites.some(track => track.id === id)

export const toggledFavorite = (favorites: readonly Track[], track: Track) =>
  isFavorite(favorites, track.id)
    ? { favorites: favorites.filter(item => item.id !== track.id), isAdded: false }
    : { favorites: [...favorites, requestedAs(track, 'you')], isAdded: true }

export const withSeed = (seeds: readonly Track[], track: Track) =>
  [...seeds.filter(seed => seed.id !== track.id), track].slice(-SEED_WINDOW)

export const candidatesOf = (last: Track | null, seeds: readonly Track[]) =>
  [...(last ? [last] : []), ...[...seeds].reverse()]
    .filter((track, index, all) => all.findIndex(other => other.id === track.id) === index)
    .slice(0, AUTOPLAY_CANDIDATES)

export const pageOf = <T>(list: readonly T[], page: number, size: number) => {
  const pages = Math.max(1, Math.ceil(list.length / size))
  const current = Math.min(Math.max(0, page), pages - 1)

  return {
    page: current,
    pages,
    rows: list.slice(current * size, (current + 1) * size).map((item, offset) => ({ item, index: current * size + offset })),
  }
}