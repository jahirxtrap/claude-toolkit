export type Cookie = {
  domain: string
  path: string
  isSecure: boolean
  expires: number
  name: string
  value: string
  isHttpOnly: boolean
}

export type CookieCheck = { isUsable: true } | { isUsable: false; reason: 'noYoutube' | 'noSession' | 'expired'; names: string[] }

type ExportedCookie = {
  domain?: string
  hostOnly?: boolean
  path?: string
  secure?: boolean
  session?: boolean
  expirationDate?: number
  name?: string
  value?: string
  httpOnly?: boolean
}

const SESSION_COOKIES = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', '__Secure-1PSID', '__Secure-1PAPISID']
const HTTP_ONLY = '#HttpOnly_'
const YOUTUBE_DOMAIN = 'youtube.com'
const NETSCAPE_HEADER = '# Netscape HTTP Cookie File'

const fromNetscape = (text: string): Cookie[] =>
  text
    .split(/\r?\n/)
    .map(line => line.startsWith(HTTP_ONLY) ? { isHttpOnly: true, line: line.slice(HTTP_ONLY.length).trim() } : { isHttpOnly: false, line: line.trim() })
    .filter(({ line }) => line !== '' && !line.startsWith('#'))
    .map(({ isHttpOnly, line }) => ({ isHttpOnly, fields: line.split('\t') }))
    .filter(({ fields }) => fields.length >= 7)
    .map(({ isHttpOnly, fields }) => ({
      domain: fields[0] ?? '',
      path: fields[2] ?? '/',
      isSecure: fields[3] === 'TRUE',
      expires: Number(fields[4]) || 0,
      name: fields[5] ?? '',
      value: fields.slice(6).join('\t'),
      isHttpOnly,
    }))

const domainOf = (cookie: ExportedCookie) => {
  const domain = cookie.domain ?? ''

  return cookie.hostOnly ? domain.replace(/^\./, '') : domain.startsWith('.') ? domain : `.${domain}`
}

const fromJson = (text: string): Cookie[] => {
  const parsed: unknown = JSON.parse(text)
  const list: unknown = Array.isArray(parsed) ? parsed : (parsed as { cookies?: unknown } | null)?.cookies

  return (Array.isArray(list) ? (list as ExportedCookie[]) : []).map(cookie => ({
    domain: domainOf(cookie),
    path: cookie.path || '/',
    isSecure: Boolean(cookie.secure),
    expires: cookie.session || !cookie.expirationDate ? 0 : Math.floor(cookie.expirationDate),
    name: cookie.name ?? '',
    value: cookie.value ?? '',
    isHttpOnly: Boolean(cookie.httpOnly),
  }))
}

export const cookiesOf = (text: string): Cookie[] => {
  try {
    return /^\s*[[{]/.test(text) ? fromJson(text) : fromNetscape(text)
  } catch {
    return []
  }
}

export const youtubeCookiesOf = (text: string) => cookiesOf(text).filter(cookie => cookie.domain.includes(YOUTUBE_DOMAIN))

export const checkCookies = (cookies: readonly Cookie[], nowSeconds: number): CookieCheck => {
  if (cookies.length === 0) {
    return { isUsable: false, reason: 'noYoutube', names: [] }
  }

  const names = new Set(cookies.map(cookie => cookie.name))
  const missing = SESSION_COOKIES.filter(name => !names.has(name))
  if (missing.length > 0) {
    return { isUsable: false, reason: 'noSession', names: missing }
  }

  const expired = cookies
    .filter(cookie => SESSION_COOKIES.includes(cookie.name) && cookie.expires > 0 && cookie.expires < nowSeconds)
    .map(cookie => cookie.name)

  return expired.length > 0 ? { isUsable: false, reason: 'expired', names: expired } : { isUsable: true }
}

export const holdsSession = (text: string) => {
  const names = new Set(youtubeCookiesOf(text).map(cookie => cookie.name))

  return SESSION_COOKIES.every(name => names.has(name))
}

export const netscapeOf = (cookies: readonly Cookie[]) =>
  [
    NETSCAPE_HEADER,
    '',
    ...cookies.map(cookie =>
      [
        `${cookie.isHttpOnly ? HTTP_ONLY : ''}${cookie.domain}`,
        cookie.domain.startsWith('.') ? 'TRUE' : 'FALSE',
        cookie.path,
        cookie.isSecure ? 'TRUE' : 'FALSE',
        String(cookie.expires),
        cookie.name,
        cookie.value,
      ].join('\t'),
    ),
    '',
  ].join('\n')