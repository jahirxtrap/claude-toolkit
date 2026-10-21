import type { ClientElements } from 'claude-code'

import { FILE_INDEXES, FILE_LABEL_ROWS, FILE_LETTERS, RANK_LABEL_COLUMNS, RANKS, squareColumnsFor } from './layout'
import { BOARD_COLORS } from './palette'

export type GlyphSize = 'body' | 'heading' | 'title'

export type BoardGrid = {
  squareRows: number
  glyphSize: GlyphSize
  glyphOf: (square: number) => string
  colorOf: (square: number, rank: number, file: number) => string
}

export const drawBoard = ({ Box, Text }: Pick<ClientElements, 'Box' | 'Text'>, grid: BoardGrid) => {
  const squareColumns = squareColumnsFor(grid.squareRows)

  return (
    <Box flexDirection="column">
      {RANKS.map(rank => (
        <Box flexDirection="row">
          <Box width={RANK_LABEL_COLUMNS} height={grid.squareRows} alignItems="center">
            <Text dimColor>{String(rank + 1)}</Text>
          </Box>
          {FILE_INDEXES.map(file => {
            const square = rank * 8 + file

            return (
              <Box
                width={squareColumns}
                height={grid.squareRows}
                justifyContent="center"
                alignItems="center"
                backgroundColor={grid.colorOf(square, rank, file)}
              >
                <Text size={grid.glyphSize} color={BOARD_COLORS.piece}>
                  {grid.glyphOf(square) || ' '}
                </Text>
              </Box>
            )
          })}
        </Box>
      ))}
      <Box flexDirection="row">
        <Box width={RANK_LABEL_COLUMNS} height={FILE_LABEL_ROWS} />
        {FILE_LETTERS.map(letter => (
          <Box width={squareColumns} height={FILE_LABEL_ROWS} justifyContent="center">
            <Text dimColor>{letter}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
