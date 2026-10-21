export const BOARD_COLORS = {
  light: '#f0d9b5',
  dark: '#b58863',
  lightLast: '#cdd26a',
  darkLast: '#aaa23a',
  selected: '#f7ec74',
  target: '#a9c26b',
  cursor: '#86a666',
  piece: '#111111',
} as const

export const squareColor = (isLight: boolean, isLast: boolean) =>
  isLast
    ? isLight
      ? BOARD_COLORS.lightLast
      : BOARD_COLORS.darkLast
    : isLight
      ? BOARD_COLORS.light
      : BOARD_COLORS.dark
