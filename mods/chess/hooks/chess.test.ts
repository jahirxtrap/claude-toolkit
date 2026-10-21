import { expect, test } from 'claude-code/testing'

import { applyMove, legalMoves, parseFen, parseMove, replay, START_FEN, statusOf, toFen, toSan } from './chess'
import type { Position } from './chess'

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
const ENDGAME = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'

const perft = (position: Position, depth: number): number =>
  depth === 0
    ? 1
    : legalMoves(position).reduce((count, move) => count + perft(applyMove(position, move), depth - 1), 0)

test('perft from the start matches the reference counts', () => {
  const start = parseFen(START_FEN)

  expect([1, 2, 3].map(depth => perft(start, depth))).toEqual([20, 400, 8902])
})

test('perft on Kiwipete covers castling, en passant and promotions', () => {
  const position = parseFen(KIWIPETE)

  expect([1, 2].map(depth => perft(position, depth))).toEqual([48, 2039])
})

test('perft on a pawn endgame covers en passant into and out of check', () => {
  const position = parseFen(ENDGAME)

  expect([1, 2, 3].map(depth => perft(position, depth))).toEqual([14, 191, 2812])
})

test('the FEN round-trips', () => {
  expect(toFen(parseFen(KIWIPETE))).toBe(KIWIPETE)
  expect(toFen(replay(['e2e4']).position)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')
})

test("scholar's mate ends in checkmate with the SAN a player expects", () => {
  const game = replay(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7'])

  expect(game.sans).toEqual(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'])
  expect(statusOf(game.position)).toBe('checkmate')
})

test('moves are read in SAN, loose SAN, UCI and castling spellings', () => {
  const start = parseFen(START_FEN)
  const castleReady = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')

  expect(parseMove(start, 'e4')?.to).toBe(28)
  expect(parseMove(start, 'e2e4')?.to).toBe(28)
  expect(parseMove(start, 'nf3')?.piece).toBe('n')
  expect(parseMove(start, 'Nf3+')?.piece).toBe('n')
  expect(parseMove(start, 'e5')).toBeNull()
  expect(parseMove(castleReady, 'O-O')?.castle).toBe('k')
  expect(parseMove(castleReady, '0-0-0')?.castle).toBe('q')
  expect(parseMove(castleReady, 'o-o')?.castle).toBe('k')
})

test('SAN disambiguates, promotes and marks checks', () => {
  const rooks = parseFen('4k3/8/8/8/8/8/4K3/R6R w - - 0 1')
  const rookMove = parseMove(rooks, 'a1d1')
  const promotion = parseFen('8/P7/8/8/8/8/8/k6K w - - 0 1')
  const promote = parseMove(promotion, 'a8')

  expect(rookMove && toSan(rooks, rookMove)).toBe('Rad1')
  expect(promote?.promotion).toBe('q')
  expect(promote && toSan(promotion, promote)).toBe('a8=Q+')
})

test('stalemate and bare kings are draws', () => {
  expect(statusOf(parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toBe('stalemate')
  expect(statusOf(parseFen('8/8/8/4k3/8/8/8/4K2N w - - 0 1'))).toBe('insufficient-material')
})
