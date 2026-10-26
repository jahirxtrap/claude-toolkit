import type { EngineInterface } from 'claude-code'

import type { Track } from '../types'
import type { Places } from './config'
import { joined } from './config'

export type ListName = 'queue' | 'played' | 'favorites'

type Index = { chunks: number }

const CHUNK = 500
const INDEX = 'index.json'
const SHARED: ReadonlySet<ListName> = new Set<ListName>(['played', 'favorites'])
const written = new Map<string, string>()
const saving = new Map<ListName, Promise<void>>()

export const isShared = (name: ListName) => SHARED.has(name)

const isTrack = (value: unknown): value is Track => {
  const track = value as Partial<Track> | null

  return (
    typeof track === 'object' &&
    track !== null &&
    typeof track.id === 'string' &&
    typeof track.title === 'string' &&
    typeof track.url === 'string' &&
    typeof track.source === 'string'
  )
}

const fileOf = (places: Places, name: ListName, file: string) => joined(places.platform, places.lists, name, file)

export const chunksOf = <T>(items: readonly T[]) =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, index) => items.slice(index * CHUNK, (index + 1) * CHUNK))

async function writeIfChanged($: EngineInterface, path: string, text: string) {
  if (written.get(path) !== text) {
    await $.fs.write(path, text)
    written.set(path, text)
  }
}

async function readChunk($: EngineInterface, path: string) {
  const text = await $.fs.read(path)
  written.set(path, text)
  const items: unknown = JSON.parse(text)

  return Array.isArray(items) ? items.filter(isTrack) : []
}

async function writeList($: EngineInterface, places: Places, name: ListName, items: readonly Track[]) {
  if (items.length === 0 && !written.has(fileOf(places, name, INDEX))) {
    return
  }

  const chunks = chunksOf(items)
  for (const [index, chunk] of chunks.entries()) {
    await writeIfChanged($, fileOf(places, name, `${index}.json`), JSON.stringify(chunk))
  }
  await writeIfChanged($, fileOf(places, name, INDEX), JSON.stringify({ chunks: chunks.length } satisfies Index))
}

export async function loadList($: EngineInterface, places: Places, name: ListName): Promise<Track[]> {
  const indexPath = fileOf(places, name, INDEX)
  if (!(await $.fs.exists(indexPath))) {
    return []
  }

  const indexText = await $.fs.read(indexPath)
  written.set(indexPath, indexText)
  const { chunks } = JSON.parse(indexText) as Index
  const lists = await Promise.all(Array.from({ length: chunks }, (_, index) => readChunk($, fileOf(places, name, `${index}.json`))))

  return lists.flat()
}

export function saveList($: EngineInterface, places: Places, name: ListName, items: readonly Track[]) {
  const next = (saving.get(name) ?? Promise.resolve()).then(() => writeList($, places, name, items))
  saving.set(
    name,
    next.catch(() => undefined),
  )

  return next
}