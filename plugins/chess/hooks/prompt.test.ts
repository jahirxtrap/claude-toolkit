import { expect, test } from 'claude-code/testing'

import { legalMoves, replay, uciOf } from './chess'
import { diagramOf, promptFor, readReply, systemPromptFor } from './prompt'

const BACK_RANK = replay([
  'a2a4', 'e7e5', 'b1c3', 'g8f6', 'c3d5', 'f6d5', 'c2c4', 'd5f6', 'h2h3', 'd7d5', 'g2g4', 'd5c4', 'f1g2', 'c7c6',
  'd2d3', 'c4d3', 'e2d3', 'f8b4', 'c1d2', 'b4d2', 'd1d2', 'e8g8', 'd3d4', 'e5d4', 'a1d1', 'f8e8', 'g1e2', 'f6e4',
  'd2d4', 'd8d4', 'd1d4', 'e4c5', 'g2e4', 'c5e4', 'd4e4', 'e8e4', 'f2f3', 'e4a4', 'e1f2', 'b8d7', 'b2b3', 'a4a2',
  'h1e1', 'a2b2', 'e1d1',
])

test('the board is drawn rank 8 first, White in uppercase', () => {
  const lines = diagramOf(replay([]).position).split('\n')

  expect(lines[0]).toBe('8 r n b q k b n r')
  expect(lines[7]).toBe('1 R N B Q K B N R')
  expect(lines[8]).toBe('  a b c d e f g h')
})

test('the prompt carries the board, both piece lists, the FEN, the history and every legal move', () => {
  const legal = legalMoves(BACK_RANK.position)
  const prompt = promptFor(BACK_RANK.position, '1. a4 e5', legal)

  expect(prompt).toContain('8 r . b . . . k .')
  expect(prompt).toContain('Black pieces (yours): Kg8 Rb2 Ra8 Bc8 Nd7 Pc6 Pa7 Pb7 Pf7 Pg7 Ph7')
  expect(prompt).toContain('White pieces: Kf2 Rd1 Ne2 Pb3 Pf3 Ph3 Pg4')
  expect(prompt).toContain('FEN: r1b3k1/pp1n1ppp/2p5/8/6P1/1P3P1P/1r2NK2/3R4 b - - 4 23')
  expect(prompt).toContain('Moves so far: 1. a4 e5')
  expect(prompt).toContain(legal.map(uciOf).join(' '))
})

test('the system prompt asks for short thinking, a MOVE line and a SAY line in the chosen language', () => {
  const system = systemPromptFor('Spanish')

  expect(system).toContain('back rank')
  expect(system).toContain('MOVE:')
  expect(system).toContain('SAY: <one short, friendly sentence to the user about your move, in Spanish>')
})

test('the MOVE line wins over the moves named while thinking, and SAY becomes the remark', () => {
  const reply = [
    'White threatens Rd8 if my knight leaves d7, so d7c5 loses at once.',
    'h7h6 gives my king air. g7g6 also works.',
    'MOVE: h7h6',
    'SAY: Giving my king some air before anything else.',
  ].join('\n')
  const read = readReply(BACK_RANK.position, reply)

  expect(read.move && uciOf(read.move)).toBe('h7h6')
  expect(read.remark).toBe('Giving my king some air before anything else.')
})

test('without a MOVE line the last legal move named is taken, and a missing SAY gives no remark', () => {
  const read = readReply(replay(['e2e4']).position, 'Maybe d7d5, but e7e5 is simpler.')

  expect(read.move && uciOf(read.move)).toBe('e7e5')
  expect(read.remark).toBeNull()
  expect(readReply(replay(['e2e4']).position, 'I resign').move).toBeNull()
})
