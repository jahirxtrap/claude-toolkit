import type { EngineInterface, PluginOptions } from 'claude-code'

import type { SearchSource } from './sources'
import { Problem } from './text'

export type Platform = 'windows' | 'mac' | 'linux'

export type Settings = {
  searchSource: SearchSource
  cookies: string
  cookiesFromBrowser: string
  ytdlpArgs: string[]
  ytdlp: string
  mpv: string
}

export type Session = { settings: Settings; places: Places }

export type Places = {
  platform: Platform
  arch: string
  data: string
  ytdlp: string
  mpvFolder: string
  mpv: string
  denoFolder: string
  deno: string
  tar: string
  curl: string
  run: string
  control: string
  cookieJar: string
  coverPng: string
  coverJpeg: string
  lists: string
  script: string
  logo: string
}

const DATA_FOLDER = 'meowzik'
const CONFIG_FOLDER = '.claude'
const WINDOWS = 'Windows_NT'
const DARWIN = 'Darwin'
const ARGUMENT = /"([^"]*)"|'([^']*)'|(\S+)/g

const textOf = (options: PluginOptions, key: string) => {
  const value = options[key]

  return typeof value === 'string' ? value.trim() : ''
}

export const argumentsOf = (raw: string) => [...raw.matchAll(ARGUMENT)].map(match => match[1] ?? match[2] ?? match[3] ?? '')

export const settingsOf = (options: PluginOptions): Settings => ({
  searchSource: textOf(options, 'searchSource') === 'soundcloud' ? 'soundcloud' : 'youtube',
  cookies: textOf(options, 'cookies'),
  cookiesFromBrowser: textOf(options, 'cookiesFromBrowser'),
  ytdlpArgs: argumentsOf(textOf(options, 'ytdlpArgs')),
  ytdlp: textOf(options, 'ytdlp'),
  mpv: textOf(options, 'mpv'),
})

export const joined = (platform: Platform, ...parts: string[]) => {
  const separator = platform === 'windows' ? '\\' : '/'

  return parts.map((part, index) => (index === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, ''))).join(separator)
}

export const placesFor = (platform: Platform, arch: string, configFolder: string, root: string, systemFolder: string): Places => {
  const at = (...parts: string[]) => joined(platform, ...parts)
  const exe = platform === 'windows' ? '.exe' : ''
  const system = (name: string) => (platform === 'windows' && systemFolder ? at(systemFolder, 'System32', `${name}.exe`) : name)
  const data = at(configFolder, DATA_FOLDER)

  return {
    platform,
    arch,
    data,
    ytdlp: at(data, 'bin', `yt-dlp${exe}`),
    mpvFolder: at(data, 'bin', 'mpv'),
    mpv: at(data, 'bin', 'mpv', `mpv${exe}`),
    denoFolder: at(data, 'bin', 'deno'),
    deno: at(data, 'bin', 'deno', `deno${exe}`),
    tar: system('tar'),
    curl: system('curl'),
    run: at(data, 'run'),
    control: at(data, 'run', 'control.json'),
    cookieJar: at(data, 'cookies.txt'),
    coverPng: at(data, 'run', 'cover.png'),
    coverJpeg: at(data, 'run', 'cover.jpg'),
    lists: at(data, 'lists'),
    script: at(root, 'player', 'meowzik.lua'),
    logo: at(root, 'assets', 'logo.png'),
  }
}

export async function placesOf($: EngineInterface): Promise<Places> {
  const isWindows = (await $.env.get('OS')) === WINDOWS
  const home = isWindows ? await $.env.get('USERPROFILE') : await $.env.get('HOME')
  if (!home) {
    throw new Problem('homeMissing')
  }

  const machine = isWindows ? null : (await $.process.run(['uname', '-sm'])).stdout.trim().split(/\s+/)
  const platform: Platform = isWindows ? 'windows' : machine?.[0] === DARWIN ? 'mac' : 'linux'
  const arch = (isWindows ? await $.env.get('PROCESSOR_ARCHITECTURE') : machine?.[1]) ?? ''
  const configFolder = (await $.env.get('CLAUDE_CONFIG_DIR')) || joined(platform, home, CONFIG_FOLDER)
  const systemFolder = (isWindows ? await $.env.get('SystemRoot') : null) ?? ''

  return placesFor(platform, arch.toLowerCase(), configFolder, $.plugin.root, systemFolder)
}