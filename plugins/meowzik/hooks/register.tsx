import type { EngineInterface, Register } from 'claude-code'

import { answerSubcommand, subcommandOf } from './commands'
import type { Subcommand } from './commands'
import { placesOf, settingsOf } from './config'
import type { Session } from './config'
import { SEEK_KEY_SECONDS, VOLUME_KEY_STEP, VOLUME_MAX } from './layout'
import { changeVolume, leave, restore, seekBy, seekTo, setVolume } from './playback'
import { checkTools, factsOf } from './setup'
import { get, put, tell } from './state'
import { problemText, say } from './text'
import { answerTool, TOOL_SPECS } from './tools'
import { drawBand, drawPane, MINI_SEEKBAR, openPane, PANE, SEEKBAR, VOLUME } from './view'
import { cookieNoticeOf, cookieStateOf } from './ytdlp'

const STAYING: ReadonlySet<string> = new Set(['clear', 'resume'])

const isFraction = (data: unknown): data is { fraction: number } => typeof (data as { fraction?: unknown } | null)?.fraction === 'number'

const isStep = (data: unknown): data is { step: number } => typeof (data as { step?: unknown } | null)?.step === 'number'

const inputOf = (e: object) => Object.fromEntries(Object.entries(e).filter(([key]) => key !== 'tool' && key !== 'tool_use_id'))

const served = async ($: EngineInterface, name: string, e: object) => {
  try {
    return { result: await answerTool($, name, inputOf(e)) }
  } catch (error) {
    return { result: problemText(error) }
  }
}

const commanded = async ($: EngineInterface, subcommand: Subcommand) => {
  try {
    return { text: await answerSubcommand($, subcommand) }
  } catch (error) {
    return { text: problemText(error) }
  }
}

const prepare = async ($: EngineInterface, session: Session) => {
  const [cookies, facts] = await Promise.all([cookieStateOf($, session.settings, session.places), factsOf($, session)])
  await put($, 'setup', now => ({ ...now, ...facts, cookies: cookieNoticeOf(cookies) }))
  await checkTools($, session)
}

export const register: Register = (on, options) => {
  const settings = settingsOf(options)
  let session: Session | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'meowzik',
      description: say('commandDescription'),
      argumentHint: say('commandHint'),
      immediate: true,
    })
    for (const spec of TOOL_SPECS) {
      await $.tool.register(spec)
    }

    try {
      const active: Session = { settings, places: await placesOf($) }
      session = active
      await restore($, active)
      void prepare($, active)
    } catch (error) {
      await tell($, 'failure', { reason: problemText(error) }, true)
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (!STAYING.has(e.reason)) {
      await leave($).catch(() => undefined)
    }

    return next(e)
  })

  on('command.run', { command: 'meowzik' }, async ($, e) => {
    const typed = e.args.trim()
    if (!typed) {
      return { text: await openPane($) }
    }

    const subcommand = subcommandOf(typed)

    return subcommand ? commanded($, subcommand) : { text: say('commandUnknown', { typed }) }
  })

  on('tool.call', { tool: 'mcp__meowzik__play' }, ($, e) => served($, 'play', e))
  on('tool.call', { tool: 'mcp__meowzik__control' }, ($, e) => served($, 'control', e))
  on('tool.call', { tool: 'mcp__meowzik__status' }, ($, e) => served($, 'status', e))
  on('tool.call', { tool: 'mcp__meowzik__list' }, ($, e) => served($, 'list', e))

  on('ui.message', async ($, e) => {
    const isSeekbar = e.element === SEEKBAR || e.element === MINI_SEEKBAR

    if (isSeekbar && isFraction(e.data)) {
      await seekTo($, e.data.fraction * (await get($, 'length')))
    } else if (isSeekbar && isStep(e.data)) {
      await seekBy($, e.data.step * SEEK_KEY_SECONDS)
    } else if (e.element === VOLUME && isFraction(e.data)) {
      await setVolume($, e.data.fraction * VOLUME_MAX)
    } else if (e.element === VOLUME && isStep(e.data)) {
      await changeVolume($, e.data.step * VOLUME_KEY_STEP)
    }

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => drawPane($, e, session))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const band = await drawBand($, e, settings.miniPlayer)
    if (!band) {
      return next(e)
    }

    const { Box } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {band}
        {await next(e)}
      </Box>
    )
  })
}