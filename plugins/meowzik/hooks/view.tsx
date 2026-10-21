import type { EngineInterface, RenderInput } from 'claude-code'

import type { Phase, Setup, Tab, Track } from '../types'
import type { Session } from './config'
import { pictureSvgOf } from './cover'
import { ICONS } from './icons'
import {
  barOf,
  COVER_COLUMNS,
  COVER_ROWS,
  COVER_SVG_SIZE,
  GAP,
  PAGE_SIZE,
  PANE_ROWS,
  SEEK_BUTTON_SECONDS,
  SEEK_ROWS,
  SIDE_GAP,
  TEXT_BAR_COLUMNS,
  VOLUME_COLUMNS,
  VOLUME_MAX,
  VOLUME_STEP,
} from './layout'
import { PALETTE } from './palette'
import {
  addSongs,
  back,
  changeVolume,
  clearList,
  cycleLoop,
  enqueueFrom,
  moveInQueue,
  playFrom,
  removeFrom,
  seekBy,
  skip,
  stop,
  toggleAutoplay,
  toggleFavorite,
  togglePause,
  toggleShuffle,
} from './playback'
import { isFavorite, pageOf } from './queue'
import { checkTools, installMissing, missingOf, toolLabelOf, TOOLS } from './setup'
import type { ListName } from './shelf'
import type { SliderProps } from './slider'
import { set, snapshot } from './state'
import type { Values } from './state'
import { clockOf, lengthOf, noticeTextOf, say, titleOf } from './text'
import type { TextKey } from './text'

export const PANE = 'meowzik'
export const SEEKBAR = 'seekbar'
export const VOLUME = 'volume'

type Pane = RenderInput<'Pane'>

const REQUESTERS: Record<Track['requestedBy'], TextKey> = { you: 'requesterYou', claude: 'requesterClaude', autoplay: 'requesterAutoplay' }
const HEADINGS: Record<Exclude<Phase, 'idle'>, TextKey> = { playing: 'nowPlaying', paused: 'paused', loading: 'loading' }
const TABS: readonly Tab[] = ['queue', 'history', 'favorites', 'setup']
const TAB_KEYS: Record<Tab, string> = { queue: '1', history: '2', favorites: '3', setup: '4' }
const TAB_LISTS: Record<Exclude<Tab, 'setup'>, ListName> = { queue: 'queue', history: 'played', favorites: 'favorites' }
const EMPTY: Record<ListName, TextKey> = { queue: 'emptyQueue', played: 'emptyHistory', favorites: 'emptyFavorites' }
const logos = new Map<string, string>()

const toneOf = (isError: boolean) => (isError ? { color: PALETTE.error } : { dimColor: true })

const variantOf = (isOn: boolean) => (isOn ? 'primary' : 'secondary')

const nextLine = (view: Values) => {
  const [next] = view.queue

  if (view.isShuffled && view.queue.length > 1) {
    return say('nextRandom')
  }
  if (next) {
    return say('nextUp', { title: titleOf(next) })
  }

  return view.isAutoplay ? say('nextAutoplay') : null
}

export async function openPane($: EngineInterface) {
  const opened = await $.ui.open({ id: PANE, title: say('paneTitle'), rows: PANE_ROWS })

  return opened.isPlaced ? say('paneOpened') : say('paneWaiting', { reason: opened.reason })
}

async function logoOf($: EngineInterface, path: string) {
  const cached = logos.get(path)
  if (cached !== undefined || !path) {
    return cached ?? null
  }

  const { base64 } = await $.fs.read(path, { as: 'bytes' })
  logos.set(path, base64)

  return base64
}

async function openTab($: EngineInterface, tab: Tab) {
  await set($, 'tab', tab)
  await set($, 'page', 0)
}

async function turnPage($: EngineInterface, page: number) {
  await set($, 'page', page)
}

async function artwork($: EngineInterface, e: Pane, view: Values) {
  const alt = view.current ? say('coverAlt', { title: titleOf(view.current) }) : say('logoAlt')
  const art = view.current && view.cover?.id === view.current.id ? view.cover : null

  if (e.surface === 'terminal') {
    const { Image } = $.ui.resolve(e)
    const file = art?.png ?? view.setup.logo

    return file ? (
      <Image key="cover" source={{ file, format: 'png', generation: art?.generation ?? 0 }} columns={COVER_COLUMNS} rows={COVER_ROWS} alt={alt} />
    ) : null
  }

  const { Svg } = $.ui.resolve(e)
  const logo = art?.jpeg ? null : await logoOf($, view.setup.logo).catch(() => null)
  const source = art?.jpeg ? pictureSvgOf(art.jpeg, 'image/jpeg') : logo ? pictureSvgOf(logo, 'image/png') : null

  return source ? <Svg source={source} alt={alt} width={COVER_SVG_SIZE} height={COVER_SVG_SIZE} /> : null
}

function heading($: EngineInterface, e: Pane, view: Values) {
  const { Box, Link, Text } = $.ui.resolve(e)

  if (!view.current) {
    const lead: TextKey = view.phase === 'loading' ? 'autoplaySearching' : 'idleLead'
    const hint: TextKey = view.queue.length > 0 ? 'idleQueued' : e.surface === 'mobile' ? 'idleHintMobile' : 'idleHint'

    return (
      <Box flexDirection="column">
        <Text weight="bold" size="heading">
          {say('paneTitle')}
        </Text>
        <Text>{say(lead)}</Text>
        {view.phase === 'idle' && <Text dimColor>{say(hint, { play: ICONS.play })}</Text>}
      </Box>
    )
  }

  const track = view.current
  const total = lengthOf(view.length || track.duration)

  return (
    <Box flexDirection="column">
      <Text weight="bold" color={PALETTE.accent}>
        {say(HEADINGS[view.phase === 'idle' ? 'loading' : view.phase])}
      </Text>
      {track.url ? <Link href={track.url} label={titleOf(track)} /> : <Text weight="bold">{titleOf(track)}</Text>}
      <Text dimColor>{track.uploader ? say('byline', { uploader: track.uploader, length: total }) : total}</Text>
      <Text dimColor>{say('requestedBy', { name: say(REQUESTERS[track.requestedBy]) })}</Text>
    </Box>
  )
}

const isLive = (view: Values) => view.phase === 'playing' || view.phase === 'paused'

function progress($: EngineInterface, e: Pane, view: Values) {
  const { Box, Button, Text } = $.ui.resolve(e)

  if (e.surface === 'terminal' || e.surface === 'desktop') {
    const { Client } = $.ui.resolve(e)
    const props: SliderProps = {
      mode: 'seek',
      fraction: view.length > 0 ? view.position / view.length : 0,
      total: view.length,
      label: '',
      endLabel: lengthOf(view.length),
      isEnabled: isLive(view) && view.length > 0,
    }

    return <Client key={SEEKBAR} module="./slider.tsx" props={props} width={e.props.bodyColumns} height={SEEK_ROWS} />
  }

  const bar = barOf(TEXT_BAR_COLUMNS, view.position, view.length)
  const times = say('progress', { position: clockOf(view.position), length: lengthOf(view.length) })

  return (
    <Box flexWrap="wrap" columnGap={GAP} alignItems="center">
      <Text>
        <Text color={PALETTE.barDone}>{bar.done}</Text>
        <Text color={PALETTE.barLeft}>{bar.left}</Text>
      </Text>
      <Text tabular dimColor>
        {times}
      </Text>
      {isLive(view) && <Button key="rewind" dimColor label={say('rewind')} onPress={() => void seekBy($, -SEEK_BUTTON_SECONDS)} />}
      {isLive(view) && <Button key="forward" dimColor label={say('forward')} onPress={() => void seekBy($, SEEK_BUTTON_SECONDS)} />}
    </Box>
  )
}

function controls($: EngineInterface, e: Pane, view: Values) {
  const { Box, Button } = $.ui.resolve(e)
  const isLiked = view.current !== null && isFavorite(view.favorites, view.current.id)
  const isSounding = view.phase === 'playing' || view.phase === 'loading'
  const toggle = (key: string, hotkey: string, icon: string, isOn: boolean, onPress: () => void) => (
    <Button key={key} hotkey={hotkey} variant={variantOf(isOn)} dimColor={!isOn} label={icon} onPress={onPress} />
  )

  return (
    <Box flexWrap="wrap" columnGap={SIDE_GAP} rowGap={GAP} alignItems="center">
      <Box columnGap={GAP}>
        <Button key="back" hotkey="b" label={ICONS.back} onPress={() => void back($)} />
        <Button key="pause" hotkey="p" variant="primary" label={isSounding ? ICONS.pause : ICONS.play} onPress={() => void togglePause($)} />
        <Button key="skip" hotkey="n" label={ICONS.next} onPress={() => void skip($)} />
        <Button key="stop" hotkey="x" label={ICONS.stop} onPress={() => void stop($)} />
      </Box>
      <Box columnGap={GAP}>
        {toggle('shuffle', 's', ICONS.shuffle, view.isShuffled, () => void toggleShuffle($))}
        {toggle('loop', 'l', view.loop === 'track' ? ICONS.loopTrack : ICONS.loop, view.loop !== 'off', () => void cycleLoop($))}
        {toggle('autoplay', 'a', ICONS.autoplay, view.isAutoplay, () => void toggleAutoplay($))}
        {toggle('favorite', 'f', isLiked ? ICONS.favorited : ICONS.favorite, isLiked, () => void toggleFavorite($))}
      </Box>
    </Box>
  )
}

function volumeControl($: EngineInterface, e: Pane, view: Values) {
  const { Box, Button, Text } = $.ui.resolve(e)

  if (e.surface === 'terminal' || e.surface === 'desktop') {
    const { Client } = $.ui.resolve(e)
    const props: SliderProps = {
      mode: 'volume',
      fraction: view.volume / VOLUME_MAX,
      total: VOLUME_MAX,
      label: say('volumeShort'),
      endLabel: '',
      isEnabled: true,
    }

    return <Client key={VOLUME} module="./slider.tsx" props={props} width={Math.min(VOLUME_COLUMNS, e.props.bodyColumns)} height={1} />
  }

  return (
    <Box columnGap={GAP} alignItems="center">
      <Button key="volumeDown" hotkey="j" dimColor label={ICONS.quieter} onPress={() => void changeVolume($, -VOLUME_STEP)} />
      <Text tabular dimColor>
        {say('volumeIs', { volume: view.volume })}
      </Text>
      <Button key="volumeUp" hotkey="k" dimColor label={ICONS.louder} onPress={() => void changeVolume($, VOLUME_STEP)} />
    </Box>
  )
}

function addField($: EngineInterface, e: Pane, view: Values) {
  if (e.surface === 'mobile') {
    return null
  }

  const { Input, Text } = $.ui.resolve(e)

  return view.isSearching ? (
    <Text dimColor>{say('searching')}</Text>
  ) : (
    <Input
      key="add"
      label={say('addLabel')}
      value=""
      placeholder={say('addPlaceholder')}
      submitLabel={say('addSubmit')}
      onSubmit={value => {
        if (value.trim()) {
          void addSongs($, value, 'you', 'end')
        }
      }}
    />
  )
}

function tabs($: EngineInterface, e: Pane, view: Values) {
  const { Box, Button } = $.ui.resolve(e)
  const labels: Record<Tab, string> = {
    queue: say('tabQueue', { count: view.queue.length }),
    history: say('tabHistory', { count: view.played.length }),
    favorites: say('tabFavorites', { count: view.favorites.length }),
    setup: say('tabSetup'),
  }

  return (
    <Box flexWrap="wrap" columnGap={GAP} rowGap={GAP}>
      {TABS.map(tab => (
        <Button
          key={`tab:${tab}`}
          hotkey={TAB_KEYS[tab]}
          variant={variantOf(view.tab === tab)}
          dimColor={view.tab !== tab}
          label={labels[tab]}
          onPress={() => void openTab($, tab)}
        />
      ))}
    </Box>
  )
}

function rowActions($: EngineInterface, e: Pane, view: Values, list: ListName, index: number, track: Track) {
  const { Button } = $.ui.resolve(e)
  const action = (name: string, label: TextKey, onPress: () => void) => (
    <Button key={`${list}:${name}:${index}`} plain dimColor label={say(label)} onPress={onPress} />
  )

  if (list === 'queue') {
    return [
      index > 0 && action('up', 'rowUp', () => void moveInQueue($, index, index - 1)),
      index < view.queue.length - 1 && action('down', 'rowDown', () => void moveInQueue($, index, index + 1)),
      action('remove', 'rowRemove', () => void removeFrom($, 'queue', index)),
    ]
  }

  return [
    action('queue', 'rowQueue', () => void enqueueFrom($, list, index)),
    list === 'played'
      ? action('favorite', isFavorite(view.favorites, track.id) ? 'rowUnfavorite' : 'rowFavorite', () => void toggleFavorite($, track))
      : action('remove', 'rowRemove', () => void removeFrom($, 'favorites', index)),
  ]
}

function listView($: EngineInterface, e: Pane, view: Values, list: ListName) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const stored = view[list]
  const items = list === 'queue' ? stored : [...stored].reverse()
  const storedIndexOf = (shown: number) => (list === 'queue' ? shown : stored.length - 1 - shown)

  if (items.length === 0) {
    return <Text dimColor>{say(EMPTY[list], { favorite: ICONS.favorite })}</Text>
  }

  const { page, pages, rows } = pageOf(items, view.page, PAGE_SIZE)

  return (
    <Box flexDirection="column">
      <Text dimColor>{say('listHint')}</Text>
      {rows.map(({ item, index }) => (
        <Box key={`row:${list}:${index}`} columnGap={SIDE_GAP} alignItems="center">
          <Button key={`${list}:play:${index}`} plain onPress={() => void playFrom($, list, storedIndexOf(index))}>
            {say('row', { number: index + 1, title: titleOf(item) })} <Text dimColor>{lengthOf(item.duration)}</Text>
          </Button>
          {rowActions($, e, view, list, storedIndexOf(index), item)}
        </Box>
      ))}
      {pages > 1 && (
        <Box columnGap={GAP} alignItems="center">
          {page > 0 && <Button key="page:previous" dimColor label={say('pagePrevious')} onPress={() => void turnPage($, page - 1)} />}
          <Text dimColor>{say('pageLabel', { page: page + 1, pages })}</Text>
          {page < pages - 1 && <Button key="page:next" dimColor label={say('pageNext')} onPress={() => void turnPage($, page + 1)} />}
        </Box>
      )}
      {list !== 'favorites' && (
        <Box>
          <Button
            key={`clear:${list}`}
            dimColor
            label={say(list === 'queue' ? 'clearQueue' : 'clearHistory')}
            onPress={() => void clearList($, list)}
          />
        </Box>
      )}
    </Box>
  )
}

function toolRows($: EngineInterface, e: Pane, tools: Setup) {
  const { Box, Text } = $.ui.resolve(e)

  if (!tools.isChecked) {
    return <Text dimColor>{say('toolChecking')}</Text>
  }

  return (
    <Box flexDirection="column">
      {TOOLS.map(tool => {
        const found = tools[tool]

        return found ? (
          <Box key={`tool:${tool}`} columnGap={GAP} flexWrap="wrap">
            <Text>{say('toolReady', { tool: toolLabelOf(tool, found), version: found.version })}</Text>
            <Text dimColor>{say('toolPath', { path: found.path })}</Text>
          </Box>
        ) : (
          <Text key={`tool:${tool}`} color={PALETTE.error}>
            {say('toolMissing', { tool: toolLabelOf(tool, null) })}
          </Text>
        )
      })}
    </Box>
  )
}

function setupView($: EngineInterface, e: Pane, view: Values, session: Session | null) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const tools = view.setup
  const isMissing = tools.isChecked && missingOf(tools).length > 0

  return (
    <Box flexDirection="column" rowGap={GAP}>
      <Text weight="bold">{say('setupTools')}</Text>
      {toolRows($, e, tools)}
      {isMissing && <Text dimColor>{tools.canBrew ? say('installBrew') : say('installWhere', { folder: tools.folder })}</Text>}
      {isMissing && tools.mpv === null && tools.manualMpv !== null && <Text dimColor>{say('manualMpv', { command: tools.manualMpv })}</Text>}
      {session && (
        <Box columnGap={GAP} flexWrap="wrap">
          {tools.isInstalling ? (
            <Text dimColor>{say('installing')}</Text>
          ) : (
            isMissing && (
              <Button key="install" variant="primary" label={say('installButton')} onPress={() => void installMissing($, session).catch(() => null)} />
            )
          )}
          <Button key="recheck" dimColor label={say('recheck')} onPress={() => void checkTools($, session)} />
        </Box>
      )}
      <Text weight="bold">{say('setupYoutube')}</Text>
      {tools.cookies && <Text {...toneOf(tools.cookies.isError)}>{noticeTextOf(tools.cookies)}</Text>}
      <Text>{say('setupSearch', { source: say(tools.searchSource === 'soundcloud' ? 'sourceSoundcloud' : 'sourceYoutube') })}</Text>
      <Text dimColor>{say('setupConfig')}</Text>
      {tools.folder && <Text dimColor>{say('setupData', { folder: tools.folder })}</Text>}
    </Box>
  )
}

export async function drawPane($: EngineInterface, e: Pane, session: Session | null) {
  const { Box, Text } = $.ui.resolve(e)
  const view = await snapshot($)
  const next = view.current ? nextLine(view) : null

  return (
    <Box flexDirection="column" rowGap={GAP}>
      <Box columnGap={SIDE_GAP} alignItems="flex-start">
        {await artwork($, e, view)}
        {heading($, e, view)}
      </Box>
      {view.current && progress($, e, view)}
      {controls($, e, view)}
      {volumeControl($, e, view)}
      {next && <Text dimColor>{next}</Text>}
      {addField($, e, view)}
      {view.notice && <Text {...toneOf(view.notice.isError)}>{noticeTextOf(view.notice)}</Text>}
      {tabs($, e, view)}
      {view.tab === 'setup' ? setupView($, e, view, session) : listView($, e, view, TAB_LISTS[view.tab])}
    </Box>
  )
}