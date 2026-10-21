# CLAUDE.md: claude-toolkit

A general-use toolkit of Claude Code plugins by jahirtrap, published as one GitHub marketplace (`jahirxtrap/claude-toolkit`; jahirxtrap is only the GitHub user, jahirtrap is the author). Each plugin is self-contained under `plugins/<name>/`; `.claude-plugin/marketplace.json` is the catalog that lists them.

## Layout

```
claude-toolkit/
├── .claude-plugin/marketplace.json   # the catalog: one entry per plugin
├── plugins/<name>/
│   ├── .claude-plugin/plugin.json    # name, version, description, author
│   ├── hooks/                        # a mod: hooks.json, register.tsx, tests
│   ├── types/index.d.ts              # a mod's $.state contract
│   ├── .mcp.json                     # an MCP server
│   └── skills/ commands/ agents/     # the other kinds, as Claude Code lays them out
├── scripts/check.sh                  # what CI runs: validate and test everything
└── .github/workflows/ci.yml
```

A plugin is organized by what it is, not by kind: one that brings a mod, an MCP server and a skill keeps them all in its own folder.

## Adding a plugin

1. Build it under `plugins/<name>/`. `plugin.json` carries `"author": { "name": "jahirtrap", "url": "https://github.com/jahirxtrap" }`. For a mod, the `plugin-authoring` skill writes the API types beside it; they and its `tsconfig.json` are generated and gitignored.
2. Add its entry to `.claude-plugin/marketplace.json`: `name`, `description`, `version` (the same as its `plugin.json`), `source: "./plugins/<name>"`, `category`, `tags` (the kinds it includes first: `mod`, `mcp`, `skill`, `command`, `agent`).
3. Run `bash scripts/check.sh` (the marketplace validates, the catalog matches `plugins/`, every plugin validates and the ones with tests pass them), then the devkit `find_*` checks over the plugin.
4. Add it to the README: a row in the Plugins table (with its Includes column) and a section of its own.

A change to a plugin bumps its version in both `plugin.json` and its marketplace entry. Users pick it up with `claude plugin marketplace update claude-toolkit`.

## MCP servers

A plugin's `.mcp.json` starts its server. When the server's code lives in another repo, launch it from there with `uvx --from git+https://github.com/<owner>/<repo>#subdirectory=<path> <script>` instead of copying the code in: uvx resolves workspace dependencies from the clone, and a cached start takes under two seconds.

## Developing

- `claude --plugin-dir plugins/<name>` runs a session with the plugin loaded from the repo.
- `~/.claude/skills/<name>` linked to `plugins/<name>` (a junction on Windows) loads it in every session; `/reload-plugins` takes an edit.
- Type-check a mod with `npx -p typescript tsc -p plugins/<name>` once Claude Code has laid its types (any session that loaded it).

## Hard rules

1. **devkit conventions** apply: read the topic before writing code, run `find_format`, `find_duplication` and `find_hardcoded` over the plugin when done.
2. **No comments** in modules. English for code and identifiers.
3. **User-facing text is data:** a plugin that speaks more than one language keeps every string in a locale table (`locales.ts`), English by default.
4. **Colors live in one place** (`palette.ts`), measurements in one place (`layout.ts`).
5. **Branch on `e.surface`**, never on `'Input' in table`: the engine completes every surface's element table, so that check is always true. `mobile` has no `Input`, `Select` or `Client`; `terminal` has no `Svg`; `vscode` has no `Client`.
6. **A grid is `Box`es of fixed `width` and `height`**, never `Text` with a background: CConnect draws a background `Text` as a rounded chip sized to its content.
7. **JSON files end at `}`** with no trailing newline.

## Gotchas

- `claude plugin validate` reads a mod's `$.state` contract literally: keys inline under the plugin's name in `interface PluginState`; a contract exports types and nothing else.
- Each hook has a 10 s budget: `$.clock.sleep` counts, an in-flight `$` call does not.
- An MCP tool result too large for the model comes back to `$.tool.call` as `Error: result (...) exceeds maximum allowed tokens. Output has been saved to <file>.` without `isError`; read the saved file.
- The test kit has no `$.ui.focus` or `$.ui.scroll`; `ui.find` leaves `hover` out of `props` (read `ui.drawn()`).
- Marketplace names that look official are refused (`claude-plugins`, `claude-code-plugins`).

## Publishing

- The repo must be public for directories to list it.
- mods4claude.com: submit at `https://mods4claude.com/submit` with the repo URL and the mod name as in its `plugin.json`. They ask for `claude plugin validate` to pass.
- claudemod.com: submit at `https://www.claudemod.com/submit`.