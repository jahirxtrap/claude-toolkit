# claude-mods

A personal collection of **Claude Code mods**. Each one is a plugin built on Claude Code's function hooks (a pane next to the chat, a line above the prompt, a slash command), installs on its own and keeps working in every session. This repository is also their marketplace: add it once, then install only the mods you want.

```
[Claude Code] ──function hooks──> [a claude-mods mod: pane, band, command]
```

Every mod draws on each surface Claude Code has (the terminal, the desktop app, VS Code, the phone app) as far as that surface allows, and says so where it can't.

## Mods

| Mod | What it does | Command |
|---|---|---|
| **chess** | Play chess against Claude in a pane, any time, without taking a chat turn. | `/chess` |

## chess

**chess** puts a game against Claude next to the chat. You play White, Claude plays Black, and the game never takes a turn of the conversation, so you can play while Claude works on something else or waits for you.

- **Click to play:** click a piece => its squares light up (a dot on the empty ones) => click one. The arrows and Enter work too.
- **Claude thinks:** it gets the board drawn as text, both piece lists and the legal moves, looks at your threats and at its king's escape squares, then answers with its move and a short remark (a few seconds, Sonnet at low effort).
- **Grows with the pane:** resize the pane and the board follows, squares kept square and pieces scaled up.
- **English and Spanish:** pick the language in the pane and Claude talks to you in it too.
- **Your game is kept:** close the pane or Claude Code and carry on later; New game, Undo, and Ask Claude to move when a reply goes wrong.
- **Every surface:** a clickable board in the terminal and the desktop app, a move field in VS Code (e4, Nf3, O-O or e2e4), the board alone in the phone app.

The rules are complete (castling, en passant, promotion, check, mate, stalemate, the fifty-move rule and bare kings) and checked with perft against the reference counts.

See [`mods/chess`](mods/chess) for the code and its tests.

## Structure

```
claude-mods/
├── .claude-plugin/
│   └── marketplace.json   # the catalog: one entry per mod
├── mods/
│   └── chess/             # chess against Claude in a pane
├── scripts/
│   └── check.sh           # validate the marketplace, then validate and test every mod
└── .github/workflows/     # CI runs scripts/check.sh
```

## Install

Add the marketplace once and install the mods you want:

```sh
claude plugin marketplace add jahirxtrap/claude-mods
claude plugin install chess@claude-mods
```

From inside Claude Code it is `/plugin marketplace add jahirxtrap/claude-mods` and `/plugin install chess@claude-mods`, then `/reload-plugins`. To get new versions later, `claude plugin marketplace update claude-mods`.

To try a mod without installing it:

```sh
git clone https://github.com/jahirxtrap/claude-mods && cd claude-mods
claude --plugin-dir mods/chess
```

Built and tested on Claude Code 2.1.304.

## Develop

```sh
bash scripts/check.sh   # the marketplace validates, the catalog matches mods/, every mod validates and passes its tests
```

Adding a mod is one folder under `mods/` plus its entry in `marketplace.json`; [CLAUDE.md](CLAUDE.md) has the steps and the rules.

## License

MIT (see [LICENSE](LICENSE)).