export type Language = 'en' | 'es'

export type Notice = { key: string; params: Record<string, string> }

declare module 'claude-code' {
  interface PluginState {
    chess: {
      moves: string[]
      isThinking: boolean
      notice: Notice | null
      remark: string | null
      language: Language
    }
  }
}
