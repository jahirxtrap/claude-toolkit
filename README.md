# claude-toolkit

A general-use toolkit of **Claude Code plugins** by jahirtrap. A plugin can bring a mod (a pane next to the chat, a line above the prompt), an MCP server, skills, commands or agents, or several of them together; each one installs on its own. This repository is also their marketplace: add it once, then install only the plugins you want.

```
[Claude Code] ──marketplace──> [a claude-toolkit plugin: mod, MCP server, skill, command]
```

Every plugin draws on each surface Claude Code has (the terminal, the desktop app, VS Code, the phone app) as far as that surface allows, and says so where it can't.

## Plugins

| Plugin | Includes | What it does | Command |
|---|---|---|---|
| **chess** | mod | Play chess against Claude in a pane, any time, without taking a chat turn. | `/chess` |
| **meowzik** | mod | A music player beside the chat: YouTube, SoundCloud, Spotify and Suno, played by you or by Claude. | `/meowzik` |

## chess

**chess** puts a game against Claude next to the chat. You play White, Claude plays Black, and the game never takes a turn of the conversation, so you can play while Claude works on something else or waits for you.

- **Click to play:** click a piece => its squares light up (a dot on the empty ones) => click one. The arrows and Enter work too.
- **Claude thinks:** it gets the board drawn as text, both piece lists and the legal moves, looks at your threats and at its king's escape squares, then answers with its move and a short remark (a few seconds, Sonnet at low effort).
- **Grows with the pane:** resize the pane and the board follows, squares kept square and pieces scaled up.
- **English and Spanish:** pick the language in the pane and Claude talks to you in it too.
- **Your game is kept:** close the pane or Claude Code and carry on later; New game, Undo, and Ask Claude to move when a reply goes wrong.
- **Every surface:** a clickable board in the terminal and the desktop app, a move field in VS Code (e4, Nf3, O-O or e2e4), the board alone in the phone app.

The rules are complete (castling, en passant, promotion, check, mate, stalemate, the fifty-move rule and bare kings) and checked with perft against the reference counts.

See [`plugins/chess`](plugins/chess) for the code and its tests.

## meowzik

**meowzik** is the Meowzik Discord bot as a Claude Code mod: the same player, the same buttons, in a pane next to the chat, and without Discord's limits (no cap on the queue, the history, the favorites or a playlist).

- **Any source:** a song name (searched on YouTube, or SoundCloud if you pick it), a YouTube or SoundCloud link, a whole YouTube playlist or SoundCloud set, a Spotify track, album or playlist (each song is looked up when it plays), or a Suno song.
- **Player controls:** the bot's buttons as a player's, with icons (⏮ ▶ ⏭ ⏹, then shuffle, loop for the queue or the track, autoplay and favorite, lit while on), a thick progress bar you drag to seek and a volume slider you drag or move with the arrows.
- **Autoplay:** when the queue runs out it follows YouTube's mix or SoundCloud's recommendations for what you were listening to, skipping what already played in the session.
- **Lists without limits:** Queue, History and Favorites in tabs, page by page; press a song to play it now, queue it, move it, remove it or favorite it. They are kept in `~/.claude/meowzik/lists`, so they survive the session.
- **Claude plays too:** ask for music and Claude uses the mod's tools (`play`, `control`, `status`, `list`), so "play some Daft Punk", "skip this" or "what is playing?" just work.
- **Installs what is missing:** the first song brings mpv, the standalone yt-dlp (it carries the scripts that solve YouTube's challenges) and, when there is no deno, Node.js or Bun to run them, deno; all into `~/.claude/meowzik/bin` (on macOS mpv and deno come from Homebrew when it is there; on Linux it shows the command for mpv). Nothing else on your system changes.
- **YouTube's bot check:** when YouTube asks to confirm you are not a bot, point the mod at a cookies file (or a browser) in `/config`; like the bot it works on a copy and keeps the session YouTube rotates. Or switch the search source to SoundCloud, which needs no login.
- **Every surface:** the cover, the draggable progress and volume sliders and the field to add songs in the terminal and the desktop app; the field with seek and volume buttons in VS Code; the player, the lists and Claude's tools in the phone app.

Settings (in `/config`, under meowzik): the search source, the YouTube cookies file or browser, extra yt-dlp arguments, and the mpv and yt-dlp paths if you want your own.

See [`plugins/meowzik`](plugins/meowzik) for the code and its tests.

## Structure

```
claude-toolkit/
├── .claude-plugin/
│   └── marketplace.json   # the catalog: one entry per plugin
├── plugins/
│   ├── chess/             # chess against Claude in a pane (mod)
│   └── meowzik/           # a music player beside the chat (mod)
├── scripts/
│   └── check.sh           # validate the marketplace, then validate and test every plugin
└── .github/workflows/     # CI runs scripts/check.sh
```

Each plugin keeps Claude Code's own layout inside its folder (`hooks/` for a mod, `.mcp.json` for an MCP server, `skills/`, `commands/`, `agents/`), so a plugin that mixes kinds stays in one place.

## Install

One plugin, in one step (Claude Code 2.1.275 or later):

```
/plugin install chess --marketplace jahirxtrap/claude-toolkit
```

Or add the marketplace once and install the plugins you want:

```sh
claude plugin marketplace add jahirxtrap/claude-toolkit
claude plugin install chess@claude-toolkit
```

From inside Claude Code it is `/plugin marketplace add jahirxtrap/claude-toolkit` and `/plugin install chess@claude-toolkit`, then `/reload-plugins`. To get new versions later, `claude plugin marketplace update claude-toolkit`.

To try a plugin without installing it:

```sh
git clone https://github.com/jahirxtrap/claude-toolkit && cd claude-toolkit
claude --plugin-dir plugins/chess
```

Built and tested on Claude Code 2.1.306.

## Develop

```sh
bash scripts/check.sh   # the marketplace validates, the catalog matches plugins/, every plugin validates and passes its tests
```

Adding a plugin is one folder under `plugins/` plus its entry in `marketplace.json`; [CLAUDE.md](CLAUDE.md) has the steps and the rules.

## License

MIT (see [LICENSE](LICENSE)).