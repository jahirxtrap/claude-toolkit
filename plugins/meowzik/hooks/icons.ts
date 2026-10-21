const TEXT_PRESENTATION = String.fromCodePoint(0xfe0e)

const icon = (glyph: string) => `${glyph}${TEXT_PRESENTATION}`

export const ICONS = {
  back: icon('⏮'),
  play: icon('▶'),
  pause: icon('⏸'),
  next: icon('⏭'),
  stop: icon('⏹'),
  shuffle: icon('⇄'),
  loop: icon('↻'),
  loopTrack: `${icon('↻')}¹`,
  autoplay: icon('∞'),
  favorite: icon('☆'),
  favorited: icon('★'),
  note: icon('♪'),
  quieter: '−',
  louder: '+',
} as const