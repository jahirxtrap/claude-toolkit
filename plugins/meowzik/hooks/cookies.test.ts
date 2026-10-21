import { expect, test } from 'claude-code/testing'

import { checkCookies, cookiesOf, holdsSession, netscapeOf, youtubeCookiesOf } from './cookies'

const SESSION = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', '__Secure-1PSID', '__Secure-1PAPISID']
const NOW = 1_800_000_000

const netscape = (names: readonly string[], expires = NOW + 1000) =>
  [
    '# Netscape HTTP Cookie File',
    ...names.map(name => `.youtube.com\tTRUE\t/\tTRUE\t${expires}\t${name}\tvalue-${name}`),
    `#HttpOnly_.google.com\tTRUE\t/\tTRUE\t${expires}\tNID\tother`,
  ].join('\n')

test('a Netscape export is read, HttpOnly lines included', () => {
  const cookies = cookiesOf(netscape(['SID']))

  expect(cookies).toHaveLength(2)
  expect(cookies[1]).toMatchObject({ domain: '.google.com', name: 'NID', isHttpOnly: true })
  expect(youtubeCookiesOf(netscape(['SID'])).map(cookie => cookie.name)).toEqual(['SID'])
})

test('a browser-extension JSON export is read the same way', () => {
  const exported = JSON.stringify([
    { domain: 'youtube.com', hostOnly: false, path: '/', secure: true, expirationDate: NOW + 5.5, name: 'SID', value: 'a', httpOnly: true },
    { domain: '.youtube.com', hostOnly: true, path: '/', secure: false, session: true, name: 'PREF', value: 'b' },
  ])

  expect(cookiesOf(exported)).toEqual([
    { domain: '.youtube.com', path: '/', isSecure: true, expires: NOW + 5, name: 'SID', value: 'a', isHttpOnly: true },
    { domain: 'youtube.com', path: '/', isSecure: false, expires: 0, name: 'PREF', value: 'b', isHttpOnly: false },
  ])
})

test('only a logged-in, unexpired export is usable', () => {
  expect(checkCookies([], NOW)).toEqual({ isUsable: false, reason: 'noYoutube', names: [] })
  expect(checkCookies(youtubeCookiesOf(netscape(['SID', 'HSID'])), NOW)).toMatchObject({ isUsable: false, reason: 'noSession' })
  expect(checkCookies(youtubeCookiesOf(netscape(SESSION, NOW - 1)), NOW)).toMatchObject({ isUsable: false, reason: 'expired' })
  expect(checkCookies(youtubeCookiesOf(netscape(SESSION)), NOW)).toEqual({ isUsable: true })
})

test('a jar yt-dlp stripped of its login no longer holds a session', () => {
  expect(holdsSession(netscape(SESSION))).toBe(true)
  expect(holdsSession(netscape(['SID']))).toBe(false)
})

test('the jar is written back as Netscape text that reads the same', () => {
  const cookies = youtubeCookiesOf(netscape(SESSION))

  expect(cookiesOf(netscapeOf(cookies))).toEqual(cookies)
})