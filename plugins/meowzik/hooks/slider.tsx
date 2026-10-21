import type { ClientModule, ClientSurface } from 'claude-code'

import { SLIDER_VALUE_COLUMNS } from './layout'
import { PALETTE } from './palette'
import { clockOf, say } from './text'

export type SliderProps = {
  mode: 'seek' | 'volume'
  fraction: number
  total: number
  label: string
  endLabel: string
  isEnabled: boolean
}

type Live = { props: SliderProps; barStart: number; barColumns: number }

type SliderState = { drag: number | null; live: Live }

const STEPS: Partial<Record<string, number>> = { left: -1, right: 1 }

const clamped = (value: number) => Math.min(1, Math.max(0, value))

const geometryOf = (props: SliderProps, columns: number) => {
  const barStart = props.label ? props.label.length + 1 : 0
  const valueColumns = props.mode === 'volume' ? SLIDER_VALUE_COLUMNS : 0

  return { barStart, barColumns: Math.max(1, columns - barStart - valueColumns) }
}

const fractionAt = (live: Live, x: number) => clamped((x - live.barStart) / live.barColumns)

const listen = (surface: ClientSurface<SliderState>) => {
  surface.onPointer(event => {
    const now = surface.state
    if (!now || !now.live.props.isEnabled) {
      return
    }

    const x = event.fine?.x ?? event.x + 0.5
    const isVolume = now.live.props.mode === 'volume'

    if (event.type === 'down' && event.button === 'left') {
      const drag = fractionAt(now.live, x)
      surface.setState({ ...now, drag })
      if (isVolume) {
        surface.post({ fraction: drag })
      }
    } else if (event.type === 'move' && event.button === 'left' && now.drag !== null) {
      const drag = fractionAt(now.live, x)
      surface.setState({ ...now, drag })
      if (isVolume) {
        surface.post({ fraction: drag })
      }
    } else if (event.type === 'up' && now.drag !== null) {
      surface.post({ fraction: now.drag })
      surface.setState({ ...now, drag: null })
    }
  })
  surface.onKey(event => {
    const step = STEPS[event.key]
    if (step !== undefined && surface.state?.live.props.isEnabled) {
      surface.post({ step })
    }
  })
}

const Slider: ClientModule<SliderProps, SliderState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const live: Live = { props, ...geometryOf(props, surface.columns) }

  if (surface.state === undefined) {
    listen(surface)
    surface.setState({ drag: null, live })
  }

  const state = surface.state ?? { drag: null, live }
  state.live.props = live.props
  state.live.barStart = live.barStart
  state.live.barColumns = live.barColumns

  const shown = clamped(state.drag ?? props.fraction)
  const done = Math.round(live.barColumns * shown)
  const knob = props.isEnabled && done > 0 ? 1 : 0
  const bar = (
    <Box flexDirection="row" width={live.barColumns} height={1}>
      {done - knob > 0 && <Box width={done - knob} height={1} backgroundColor={PALETTE.barDone} />}
      {knob > 0 && <Box width={knob} height={1} backgroundColor={PALETTE.knob} />}
      {live.barColumns - done > 0 && <Box width={live.barColumns - done} height={1} backgroundColor={PALETTE.barLeft} />}
    </Box>
  )

  if (props.mode === 'volume') {
    return (
      <Box flexDirection="row" alignItems="center">
        {props.label && (
          <Box width={live.barStart} height={1}>
            <Text dimColor>{props.label}</Text>
          </Box>
        )}
        {bar}
        <Box width={SLIDER_VALUE_COLUMNS} height={1} justifyContent="flex-end">
          <Text tabular dimColor>
            {say('percent', { value: Math.round(shown * props.total) })}
          </Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {bar}
      <Box flexDirection="row" justifyContent="space-between" width={live.barColumns}>
        <Text tabular dimColor>
          {clockOf(shown * props.total)}
        </Text>
        <Text tabular dimColor>
          {props.endLabel}
        </Text>
      </Box>
    </Box>
  )
}

export default Slider