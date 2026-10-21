import { expect, test } from 'claude-code/testing'

import { argumentsOf, joined, placesFor, settingsOf } from './config'
import { coverArgv, playerArgv, readReports } from './mpv'
import { denoAssetOf, missingOf, mpvAssetOf, runtimeArgsOf, toolLabelOf, toolListOf, versionOf, ytdlpAssetOf } from './setup'

test('mpv gets the script, an escaped control path, the headers and the stream after --', () => {
  const argv = playerArgv({
    mpv: 'mpv',
    script: 'C:\\plugin\\player\\meowzik.lua',
    control: 'C:\\Users\\José\\.claude\\meowzik\\run\\control.json',
    run: '7',
    volume: 80,
    start: 42,
    isPaused: true,
    stream: { url: 'https://x/audio.webm', headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.youtube.com/' }, availableAt: null },
  })

  expect(argv).toContain('--volume=80')
  expect(argv).toContain('--start=42')
  expect(argv).toContain('--pause')
  expect(argv).toContain('--script-opts=meowzik-control=%47%C:\\Users\\José\\.claude\\meowzik\\run\\control.json,meowzik-run=7')
  expect(argv).toContain('--user-agent=Mozilla/5.0')
  expect(argv).toContain('--http-header-fields-append=Referer: https://www.youtube.com/')
  expect(argv.slice(-2)).toEqual(['--', 'https://x/audio.webm'])
  expect(
    playerArgv({ mpv: 'mpv', script: 's', control: 'c', run: '1', volume: 0, start: 0, isPaused: false, stream: { url: 'u', headers: {}, availableAt: null } }),
  ).not.toContain('--pause')
})

test('a cover is one cropped frame mpv writes, full-range for the JPEG encoder', () => {
  expect(coverArgv('mpv', 'https://i.ytimg.com/vi/x/hqdefault.jpg', '/tmp/cover.png', 240, null)).toEqual([
    'mpv',
    '--no-config',
    '--no-terminal',
    '--frames=1',
    '--vf=lavfi=[scale=240:240:force_original_aspect_ratio=increase,crop=240:240]',
    '--o=/tmp/cover.png',
    '--',
    'https://i.ytimg.com/vi/x/hqdefault.jpg',
  ])
  expect(coverArgv('mpv', 'https://i.ytimg.com/vi_webp/x/maxresdefault.webp', '/tmp/cover.jpg', 240, 'yuvj420p')).toContain(
    '--vf=lavfi=[scale=240:240:force_original_aspect_ratio=increase,crop=240:240,format=yuvj420p]',
  )
})

test('the script reports are read across split chunks', () => {
  const first = readReports('@start \n@pos 12.5\n@len 3')

  expect(first.reports).toEqual([{ kind: 'start' }, { kind: 'position', seconds: 12.5 }])
  expect(first.rest).toBe('@len 3')
  expect(readReports(`${first.rest}20.4\n@pos -\n@end error loading failed\n@end eof nil\n`).reports).toEqual([
    { kind: 'length', seconds: 320.4 },
    { kind: 'position', seconds: null },
    { kind: 'end', reason: 'error', error: 'loading failed' },
    { kind: 'end', reason: 'eof', error: '' },
  ])
})

test('the downloads match the machine', () => {
  expect(ytdlpAssetOf('windows', 'amd64')).toBe('yt-dlp.exe')
  expect(ytdlpAssetOf('windows', 'arm64')).toBe('yt-dlp_arm64.exe')
  expect(ytdlpAssetOf('mac', 'arm64')).toBe('yt-dlp_macos')
  expect(ytdlpAssetOf('linux', 'aarch64')).toBe('yt-dlp_linux_aarch64')
  expect(ytdlpAssetOf('linux', 'x86_64')).toBe('yt-dlp_linux')

  const assets = [
    'ffmpeg-x86_64-git-9a861e968.7z',
    'mpv-dev-x86_64-20261021-git-e471496c56.7z',
    'mpv-x86_64-v3-20261021-git-e471496c56.7z',
    'mpv-x86_64-20261021-git-e471496c56.7z',
    'mpv-aarch64-20261021-git-e471496c56.7z',
  ].map(name => ({ name, url: `https://example.com/${name}` }))

  expect(mpvAssetOf(assets, 'amd64')?.name).toBe('mpv-x86_64-20261021-git-e471496c56.7z')
  expect(mpvAssetOf(assets, 'arm64')?.name).toBe('mpv-aarch64-20261021-git-e471496c56.7z')
  expect(mpvAssetOf(assets, 'x86')).toBeNull()

  expect(denoAssetOf('windows', 'amd64')).toBe('deno-x86_64-pc-windows-msvc.zip')
  expect(denoAssetOf('mac', 'arm64')).toBe('deno-aarch64-apple-darwin.zip')
  expect(denoAssetOf('linux', 'x86_64')).toBe('deno-x86_64-unknown-linux-gnu.zip')
})

test('versions read off the first line, and yt-dlp is told which JavaScript runtime to use', () => {
  expect(versionOf('mpv v0.41.0-1227-ge471496c5 Copyright © 2000-2026\n built on')).toBe('v0.41.0-1227-ge471496c5')
  expect(versionOf('2026.08.19\n')).toBe('2026.08.19')
  expect(versionOf('deno 2.9.6 (stable, release, x86_64-pc-windows-msvc)\nv8 14.0')).toBe('2.9.6')
  expect(versionOf('v24.8.0\n')).toBe('v24.8.0')

  expect(runtimeArgsOf({ path: 'node', version: 'v24.8.0' })).toEqual(['--js-runtimes', 'node'])
  expect(runtimeArgsOf({ path: 'C:\\Users\\me\\.claude\\meowzik\\bin\\deno\\deno.exe', version: '2.9.6' })).toEqual([
    '--js-runtimes',
    'deno:C:\\Users\\me\\.claude\\meowzik\\bin\\deno\\deno.exe',
  ])
  expect(toolLabelOf('runtime', { path: '/opt/homebrew/bin/bun', version: '1.1.30' })).toBe('bun')
  expect(toolLabelOf('runtime', null)).toBe('deno')

  expect(
    missingOf({
      isChecked: true,
      isInstalling: false,
      mpv: null,
      ytdlp: { path: 'yt-dlp', version: '1' },
      runtime: null,
      folder: '',
      logo: '',
      manualMpv: null,
      canBrew: false,
      cookies: null,
      searchSource: 'youtube',
    }),
  ).toEqual(['mpv', 'runtime'])
  expect(toolListOf(['mpv', 'ytdlp', 'runtime'])).toBe('mpv, yt-dlp, and deno')
})

test('settings and places come from the options and the machine', () => {
  expect(argumentsOf(`--proxy "socks5://127.0.0.1:9050" --extractor-args 'youtube:player_client=mweb'`)).toEqual([
    '--proxy',
    'socks5://127.0.0.1:9050',
    '--extractor-args',
    'youtube:player_client=mweb',
  ])
  expect(settingsOf({ searchSource: 'soundcloud', cookies: ' C:\\c.txt ', mpv: '' })).toMatchObject({
    searchSource: 'soundcloud',
    cookies: 'C:\\c.txt',
    ytdlpArgs: [],
  })
  expect(settingsOf({ searchSource: 'bandcamp' }).searchSource).toBe('youtube')
  expect(joined('windows', 'C:\\Users\\me\\', '.claude', 'meowzik')).toBe('C:\\Users\\me\\.claude\\meowzik')

  const windows = placesFor('windows', 'amd64', 'C:\\Users\\me\\.claude', 'C:\\plugins\\meowzik', 'C:\\WINDOWS')
  expect(windows).toMatchObject({
    mpv: 'C:\\Users\\me\\.claude\\meowzik\\bin\\mpv\\mpv.exe',
    ytdlp: 'C:\\Users\\me\\.claude\\meowzik\\bin\\yt-dlp.exe',
    deno: 'C:\\Users\\me\\.claude\\meowzik\\bin\\deno\\deno.exe',
    tar: 'C:\\WINDOWS\\System32\\tar.exe',
    curl: 'C:\\WINDOWS\\System32\\curl.exe',
    control: 'C:\\Users\\me\\.claude\\meowzik\\run\\control.json',
    script: 'C:\\plugins\\meowzik\\player\\meowzik.lua',
  })
  expect(placesFor('linux', 'x86_64', '/home/me/.claude', '/p', '')).toMatchObject({ ytdlp: '/home/me/.claude/meowzik/bin/yt-dlp', tar: 'tar', curl: 'curl' })
})