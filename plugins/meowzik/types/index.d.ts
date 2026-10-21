export type Source = 'youtube' | 'soundcloud' | 'suno' | 'spotify' | 'web'

export type Requester = 'you' | 'claude' | 'autoplay'

export type Track = {
  id: string
  title: string
  url: string
  duration: number
  uploader: string
  thumbnail: string | null
  source: Source
  requestedBy: Requester
  query?: string
  streamUrl?: string
  isAutoplay?: boolean
}

export type LoopMode = 'off' | 'track' | 'queue'

export type Phase = 'idle' | 'loading' | 'playing' | 'paused'

export type Tab = 'queue' | 'history' | 'favorites' | 'lyrics' | 'setup'

export type LyricLine = { at: number; text: string }

export type LyricsSource = 'lrclib' | 'subtitles' | 'captions'

export type Lyrics = {
  trackId: string
  status: 'loading' | 'found' | 'instrumental' | 'missing' | 'unreachable'
  isSynced: boolean
  lines: LyricLine[]
  source: LyricsSource | null
}

export type MiniPlayer = 'playing' | 'always' | 'off'

export type Notice = { key: string; params: Record<string, string>; isError: boolean }

export type Cover = { id: string; png: string | null; jpeg: string | null; generation: number }

export type Tool = { path: string; version: string }

export type Setup = {
  isChecked: boolean
  isInstalling: boolean
  mpv: Tool | null
  ytdlp: Tool | null
  runtime: Tool | null
  folder: string
  logo: string
  manualMpv: string | null
  canBrew: boolean
  cookies: Notice | null
  searchSource: 'youtube' | 'soundcloud'
}

declare module 'claude-code' {
  interface PluginState {
    meowzik: {
      current: Track | null
      phase: Phase
      position: number
      length: number
      queue: Track[]
      played: Track[]
      favorites: Track[]
      loop: LoopMode
      isShuffled: boolean
      isAutoplay: boolean
      volume: number
      tab: Tab
      page: number
      notice: Notice | null
      isSearching: boolean
      setup: Setup
      cover: Cover | null
      lyrics: Lyrics | null
    }
  }
}