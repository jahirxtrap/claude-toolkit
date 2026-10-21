export const COVER_PIXELS = 240
export const COVER_SVG_SIZE = 120
export const COVER_CORNER = 12
export const COVER_COLUMNS = 16
export const COVER_ROWS = 8
export const PANE_ROWS = 34
export const PAGE_SIZE = 50
export const GAP = 1
export const SIDE_GAP = 2
export const TEXT_BAR_COLUMNS = 30
export const SEEK_ROWS = 2
export const VOLUME_COLUMNS = 30
export const SLIDER_VALUE_COLUMNS = 5
export const BAND_SEEK_COLUMNS = 34
export const BAND_CONTROLS_COLUMNS = 14
export const BAND_TITLE_MIN_COLUMNS = 12
export const LYRICS_BEFORE = 2
export const LYRICS_AFTER = 8
export const LYRICS_LEAD_SECONDS = 0.3
export const SEEK_KEY_SECONDS = 5
export const SEEK_BUTTON_SECONDS = 10
export const VOLUME_STEP = 10
export const VOLUME_KEY_STEP = 5
export const VOLUME_MAX = 100

const BAR_DONE = '━'
const BAR_LEFT = '─'

export const barOf = (columns: number, position: number, length: number) => {
  const done = length > 0 ? Math.round(columns * Math.min(1, Math.max(0, position / length))) : 0

  return { done: BAR_DONE.repeat(done), left: BAR_LEFT.repeat(Math.max(0, columns - done)) }
}