import type { EngineInterface } from 'claude-code'

import { addSongs, togglePause } from './playback'
import { controlled, spoken } from './tools'
import { openPane } from './view'

export type Subcommand = { name: string; rest: string }

const BARE = /^$/
const SWITCH = /^(on|off)?$/i
const ANYTHING = /^/
const SUBCOMMANDS: Readonly<Record<string, RegExp>> = {
  play: ANYTHING,
  pause: BARE,
  skip: BARE,
  next: BARE,
  back: BARE,
  stop: BARE,
  favorite: BARE,
  shuffle: SWITCH,
  autoplay: SWITCH,
  repeat: /^(off|track|queue)?$/i,
  volume: /^(\d{1,3}%?)?$/,
}
const FIRST_WORD = /^(\S+)\s*([\s\S]*)$/
const PERCENT = /%$/

export const subcommandOf = (args: string): Subcommand | null => {
  const [, word = '', rest = ''] = args.trim().match(FIRST_WORD) ?? []
  const name = word.toLowerCase()
  const fits = Object.hasOwn(SUBCOMMANDS, name) ? SUBCOMMANDS[name] : undefined

  return fits?.test(rest) ? { name, rest } : null
}

export async function answerSubcommand($: EngineInterface, { name, rest }: Subcommand) {
  switch (name) {
    case 'play':
      await openPane($)
      return rest ? spoken(await addSongs($, rest, 'you', 'end')) : controlled($, { action: 'resume' })
    case 'pause':
      return spoken(await togglePause($))
    case 'next':
      return controlled($, { action: 'skip' })
    case 'repeat':
      return controlled($, { action: 'loop', value: rest })
    case 'volume':
      return controlled($, { action: 'volume', value: rest.replace(PERCENT, '') })
    default:
      return controlled($, { action: name, value: rest })
  }
}