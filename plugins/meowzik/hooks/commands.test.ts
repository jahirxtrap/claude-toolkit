import { expect, test } from 'claude-code/testing'

import { subcommandOf } from './commands'

test('a first word that names a control is a subcommand only when what follows fits it', () => {
  expect(subcommandOf('play daft punk')).toEqual({ name: 'play', rest: 'daft punk' })
  expect(subcommandOf('  Volume 40% ')).toEqual({ name: 'volume', rest: '40%' })
  expect(subcommandOf('next')).toEqual({ name: 'next', rest: '' })
  expect(subcommandOf('repeat queue')).toEqual({ name: 'repeat', rest: 'queue' })
  expect(subcommandOf('shuffle OFF')).toEqual({ name: 'shuffle', rest: 'OFF' })
  expect(subcommandOf('back in black')).toBeNull()
  expect(subcommandOf('repeat after me')).toBeNull()
  expect(subcommandOf('volume up')).toBeNull()
  expect(subcommandOf('daft punk')).toBeNull()
  expect(subcommandOf('constructor')).toBeNull()
  expect(subcommandOf('')).toBeNull()
})