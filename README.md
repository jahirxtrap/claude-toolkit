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

## Structure

```
claude-toolkit/
├── .claude-plugin/
│   └── marketplace.json   # the catalog: one entry per plugin
├── plugins/
│   └── chess/             # chess against Claude in a pane (mod)
├── scripts/
│   └── check.sh           # validate the marketplace, then validate and test every plugin
└── .github/workflows/     # CI runs scripts/check.sh
```

Each plugin keeps Claude Code's own layout inside its folder (`hooks/` for a mod, `.mcp.json` for an MCP server, `skills/`, `commands/`, `agents/`), so a plugin that mixes kinds stays in one place.

## Install

Add the marketplace once and install the plugins you want:

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

Built and tested on Claude Code 2.1.304.

## Develop

```sh
bash scripts/check.sh   # the marketplace validates, the catalog matches plugins/, every plugin validates and passes its tests
```

Adding a plugin is one folder under `plugins/` plus its entry in `marketplace.json`; [CLAUDE.md](CLAUDE.md) has the steps and the rules.

## License

MIT (see [LICENSE](LICENSE)).