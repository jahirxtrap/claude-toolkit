import type { ClientModule } from 'claude-code'

import { barOf } from './layout'
import { PALETTE } from './palette'

export type SeekbarProps = { position: number; length: number }

const STEPS: Partial<Record<string, number>> = { left: -1, right: 1 }

const Seekbar: ClientModule<SeekbarProps, boolean> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.onPointer(event => {
      if (event.type === 'down' && event.button === 'left' && surface.columns > 0) {
        surface.post({ seek: Math.min(1, Math.max(0, (event.fine?.x ?? event.x + 0.5) / surface.columns)) })
      }
    })
    surface.onKey(event => {
      const step = STEPS[event.key]
      if (step !== undefined) {
        surface.post({ step })
      }
    })
    surface.setState(true)
  }

  const bar = barOf(Math.max(1, surface.columns), props.position, props.length)

  return (
    <Box>
      <Text color={PALETTE.barDone}>{bar.done}</Text>
      <Text color={PALETTE.barLeft}>{bar.left}</Text>
    </Box>
  )
}

export default Seekbar