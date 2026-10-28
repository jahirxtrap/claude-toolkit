import type { EngineInterface } from 'claude-code'

import type { Setup, Tool } from '../types'
import type { Places, Platform, Session, Settings } from './config'
import { isArm, joined, ytdlpBuildOf } from './config'
import { get, put, tell } from './state'
import { Problem, say } from './text'

export type ToolName = 'mpv' | 'ytdlp' | 'runtime'

export type Asset = { name: string; url: string }

type Step = 'stepDownload' | 'stepExtract' | 'stepBrew'

type Release = { assets?: { name?: string; browser_download_url?: string }[] }

const YTDLP_RELEASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'
const DENO_RELEASE = 'https://github.com/denoland/deno/releases/latest/download'
const MPV_RELEASE = 'https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest'
const BREW_BINS = ['/opt/homebrew/bin', '/usr/local/bin']
const RUNTIMES = ['deno', 'node', 'bun']
const RUNTIME_NAME = /(deno|node|bun)(?:\.exe)?$/i
const VERSION = /v?\d+(?:\.\d+)+[\w.+-]*/
const DOWNLOAD_MS = 600_000
const VERSION_MS = 60_000
const ARCHIVE = 'download.tmp'
const BUILD_FILE = 'meowzik-build.json'
const LIST = new Intl.ListFormat('en', { type: 'conjunction' })

export const TOOLS: readonly ToolName[] = ['mpv', 'ytdlp', 'runtime']

export const TOOL_NAMES: Record<ToolName, string> = { mpv: 'mpv', ytdlp: 'yt-dlp', runtime: 'deno' }

export const MANUAL_MPV: Record<Exclude<Platform, 'windows'>, string> = {
  mac: 'brew install mpv',
  linux: 'sudo apt install mpv (or dnf, pacman, zypper: the package is mpv)',
}

let installing: Promise<Setup> | null = null

export const denoAssetOf = (platform: Platform, arch: string) => {
  const cpu = isArm(arch) ? 'aarch64' : 'x86_64'
  const system = platform === 'windows' ? 'pc-windows-msvc' : platform === 'mac' ? 'apple-darwin' : 'unknown-linux-gnu'

  return `deno-${cpu}-${system}.zip`
}

export const mpvAssetOf = (assets: readonly Asset[], arch: string) => {
  const build = arch === 'arm64' ? 'aarch64' : arch === 'x86' ? 'i686' : 'x86_64'
  const pattern = new RegExp(`^mpv-${build}-\\d{8}-git-[0-9a-f]+\\.7z$`)

  return assets.find(asset => pattern.test(asset.name)) ?? null
}

const zipOf = (tool: Exclude<ToolName, 'mpv'>, places: Places) => {
  if (tool === 'ytdlp') {
    const { archive } = ytdlpBuildOf(places.platform, places.arch)
    return { asset: { name: archive, url: `${YTDLP_RELEASE}/${archive}` }, folder: places.ytdlpFolder, executable: places.ytdlp }
  }

  const name = denoAssetOf(places.platform, places.arch)

  return { asset: { name, url: `${DENO_RELEASE}/${name}` }, folder: places.denoFolder, executable: places.deno }
}

export const versionOf = (stdout: string) => {
  const first = stdout.trim().split(/\r?\n/)[0] ?? ''

  return first.match(VERSION)?.[0] ?? first
}

export const runtimeNameOf = (path: string) => RUNTIME_NAME.exec(path)?.[1]?.toLowerCase() ?? TOOL_NAMES.runtime

export const runtimeArgsOf = (runtime: Tool) => {
  const name = runtimeNameOf(runtime.path)

  return ['--js-runtimes', /[\\/]/.test(runtime.path) ? `${name}:${runtime.path}` : name]
}

export const toolLabelOf = (tool: ToolName, found: Tool | null) => (tool === 'runtime' && found ? runtimeNameOf(found.path) : TOOL_NAMES[tool])

export const missingOf = (found: Setup): ToolName[] => TOOLS.filter(tool => found[tool] === null)

export const toolListOf = (tools: readonly ToolName[]) => LIST.format(tools.map(tool => TOOL_NAMES[tool]))

const candidatesOf = (tool: ToolName, settings: Settings, places: Places) => {
  const brewed = (name: string) => (places.platform === 'mac' ? BREW_BINS.map(folder => `${folder}/${name}`) : [])

  if (tool === 'ytdlp') {
    return [settings.ytdlp || places.ytdlp]
  }
  if (tool === 'runtime') {
    return [places.deno, ...RUNTIMES, ...brewed(TOOL_NAMES.runtime)]
  }

  return settings.mpv ? [settings.mpv] : [places.mpv, TOOL_NAMES.mpv, ...brewed(TOOL_NAMES.mpv)]
}

async function probe($: EngineInterface, path: string): Promise<Tool | null> {
  try {
    const { exitCode, stdout } = await $.process.run([path, '--version'], { timeoutMs: VERSION_MS })
    return exitCode === 0 ? { path, version: versionOf(stdout) } : null
  } catch {
    return null
  }
}

async function detectTool($: EngineInterface, tool: ToolName, settings: Settings, places: Places) {
  for (const path of candidatesOf(tool, settings, places)) {
    const found = await probe($, path)
    if (found) {
      return found
    }
  }

  return null
}

async function ran($: EngineInterface, tool: ToolName, argv: string[]) {
  const result = await $.process.run(argv, { timeoutMs: DOWNLOAD_MS }).catch((error: unknown) => {
    throw new Problem('installFailed', { tool: TOOL_NAMES[tool], reason: error instanceof Error ? error.message : String(error) })
  })
  if (result.exitCode !== 0) {
    throw new Problem('installFailed', {
      tool: TOOL_NAMES[tool],
      reason: result.stderr.trim().split(/\r?\n/).at(-1) || String(result.exitCode),
    })
  }
}

async function download($: EngineInterface, tool: ToolName, places: Places, url: string, target: string) {
  await ran($, tool, [places.curl, '-fsSL', '--create-dirs', '-o', target, url])
}

async function brewOf($: EngineInterface) {
  for (const folder of BREW_BINS) {
    if (await $.fs.exists(`${folder}/brew`)) {
      return `${folder}/brew`
    }
  }

  return null
}

async function announce($: EngineInterface, tool: ToolName, step: Step) {
  await tell($, 'installStep', { tool: TOOL_NAMES[tool], step: say(step) })
}

async function unpack($: EngineInterface, tool: ToolName, places: Places, asset: Asset, folder: string) {
  const archive = joined(places.platform, places.data, 'run', ARCHIVE)
  const isUnzip = places.platform === 'linux' && asset.name.endsWith('.zip')

  try {
    await announce($, tool, 'stepDownload')
    await download($, tool, places, asset.url, archive)
    await announce($, tool, 'stepExtract')
    await $.fs.write(joined(places.platform, folder, BUILD_FILE), JSON.stringify({ build: asset.name }))
    await ran($, tool, isUnzip ? ['unzip', '-o', archive, '-d', folder] : [places.tar, '-xf', archive, '-C', folder])
  } finally {
    await $.fs.write(archive, '')
  }
}

async function mpvAssetFromGitHub($: EngineInterface, arch: string) {
  const response = await $.http.fetch(MPV_RELEASE, { headers: { Accept: 'application/vnd.github+json' } })
  const release = (response.ok ? JSON.parse(response.text) : {}) as Release
  const assets = (release.assets ?? []).flatMap(asset =>
    asset.name && asset.browser_download_url ? [{ name: asset.name, url: asset.browser_download_url }] : [],
  )
  const asset = mpvAssetOf(assets, arch)
  if (!asset) {
    throw new Problem('installFailed', { tool: TOOL_NAMES.mpv, reason: `HTTP ${response.status}` })
  }

  return asset
}

async function installTool($: EngineInterface, tool: ToolName, places: Places) {
  const brew = places.platform === 'mac' && tool !== 'ytdlp' ? await brewOf($) : null
  const isUnix = places.platform !== 'windows'

  if (brew) {
    await announce($, tool, 'stepBrew')
    await ran($, tool, [brew, 'install', TOOL_NAMES[tool]])
    return
  }
  if (tool !== 'mpv') {
    const zip = zipOf(tool, places)
    await unpack($, tool, places, zip.asset, zip.folder)
    if (isUnix) {
      await ran($, tool, ['chmod', '+x', zip.executable])
    }
    return
  }
  if (isUnix) {
    throw new Problem('manualMpv', { command: MANUAL_MPV[places.platform as Exclude<Platform, 'windows'>] })
  }

  await unpack($, tool, places, await mpvAssetFromGitHub($, places.arch), places.mpvFolder)
}

export async function factsOf($: EngineInterface, session: Session) {
  const { places, settings } = session
  const brew = places.platform === 'mac' ? await brewOf($) : null

  return {
    folder: places.data,
    logo: places.logo,
    manualMpv: places.platform === 'windows' || brew ? null : MANUAL_MPV[places.platform],
    canBrew: brew !== null,
    searchSource: settings.searchSource,
  } satisfies Partial<Setup>
}

export async function checkTools($: EngineInterface, session: Session) {
  const [mpv, ytdlp, runtime] = await Promise.all(TOOLS.map(tool => detectTool($, tool, session.settings, session.places)))

  return put($, 'setup', now => ({ ...now, isChecked: true, mpv: mpv ?? null, ytdlp: ytdlp ?? null, runtime: runtime ?? null }))
}

async function installed($: EngineInterface, session: Session) {
  const missing = missingOf(await get($, 'setup'))
  await put($, 'setup', now => ({ ...now, isInstalling: true }))

  try {
    for (const tool of missing) {
      await installTool($, tool, session.places)
    }

    const found = await checkTools($, session)
    const still = missingOf(found)
    if (still.length > 0) {
      throw new Problem('installFailed', { tool: toolListOf(still), reason: say('stillMissing') })
    }
    await tell($, 'installDone', { tools: toolListOf(missing) })

    return found
  } catch (error) {
    await tell($, error instanceof Problem ? error.key : 'failure', error instanceof Problem ? error.params : { reason: String(error) }, true)
    throw error
  } finally {
    await put($, 'setup', now => ({ ...now, isInstalling: false }))
  }
}

export function installMissing($: EngineInterface, session: Session) {
  installing ??= installed($, session).finally(() => {
    installing = null
  })

  return installing
}

export async function readyTools($: EngineInterface, session: Session) {
  let found = await get($, 'setup')
  if (!found.isChecked) {
    found = await checkTools($, session)
  }
  if (missingOf(found).length > 0) {
    await tell($, 'needsTools', { tools: toolListOf(missingOf(found)) })
    found = await installMissing($, session)
  }

  const { mpv, ytdlp, runtime } = found
  if (!mpv || !ytdlp || !runtime) {
    throw new Problem('installFailed', { tool: toolListOf(missingOf(found)), reason: say('stillMissing') })
  }

  return { mpv, ytdlp, runtime }
}