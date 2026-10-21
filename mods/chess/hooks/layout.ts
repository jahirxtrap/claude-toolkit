export const RANK_LABEL_COLUMNS = 2
export const FILE_LABEL_ROWS = 1
export const MAX_SQUARE_ROWS = 5
export const RANKS = [7, 6, 5, 4, 3, 2, 1, 0]
export const FILE_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7]
export const FILE_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

export const squareColumnsFor = (squareRows: number) => 2 * squareRows + 1

export const boardColumnsFor = (squareRows: number) => RANK_LABEL_COLUMNS + 8 * squareColumnsFor(squareRows)

export const squareRowsFor = (columns: number, rows: number) => {
  const byRows = Math.floor((rows - FILE_LABEL_ROWS) / 8)
  const byColumns = Math.floor(((columns - RANK_LABEL_COLUMNS) / 8 - 1) / 2)

  return Math.max(1, Math.min(byRows, byColumns, MAX_SQUARE_ROWS))
}
