import type { EngineInterface } from 'claude-code'

import type { Cover, Track } from '../types'
import type { Places } from './config'
import { COVER_CORNER, COVER_PIXELS, COVER_SVG_SIZE } from './layout'
import { coverArgv } from './mpv'
import { PALETTE } from './palette'

const COVER_MS = 20_000
const SVG = 'http://www.w3.org/2000/svg'

async function converted($: EngineInterface, mpv: string, source: string, target: string) {
  try {
    const { exitCode } = await $.process.run(coverArgv(mpv, source, target, COVER_PIXELS), { timeoutMs: COVER_MS })
    return exitCode === 0 && (await $.fs.exists(target))
  } catch {
    return false
  }
}

export async function coverOf($: EngineInterface, mpv: string, places: Places, track: Track, generation: number): Promise<Cover | null> {
  if (!track.thumbnail) {
    return null
  }

  const [hasPng, hasJpeg] = await Promise.all([
    converted($, mpv, track.thumbnail, places.coverPng),
    converted($, mpv, track.thumbnail, places.coverJpeg),
  ])
  const jpeg = hasJpeg ? (await $.fs.read(places.coverJpeg, { as: 'bytes' })).base64 : null

  return hasPng || jpeg ? { id: track.id, png: hasPng ? places.coverPng : null, jpeg, generation } : null
}

export const pictureSvgOf = (base64: string, mime: 'image/jpeg' | 'image/png') => {
  const size = COVER_SVG_SIZE

  return `<svg xmlns="${SVG}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><clipPath id="c"><rect width="${size}" height="${size}" rx="${COVER_CORNER}"/></clipPath><rect width="${size}" height="${size}" rx="${COVER_CORNER}" fill="${PALETTE.coverBackground}"/><image href="data:${mime};base64,${base64}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#c)"/></svg>`
}