# CLAUDE.md: claude-mods

Claude Code mods by jahirtrap, published as one GitHub marketplace (`jahirxtrap/claude-mods`). Each mod is a self-contained plugin under `mods/<name>/`; `.claude-plugin/marketplace.json` is the catalog that lists them.

## Layout

```
claude-mods/
├── .claude-plugin/marketplace.json   # the catalog: one entry per mod
├── mods/<name>/
│   ├── .claude-plugin/plugin.json    # name, version, description, author, "types"
│   ├── hooks/hooks.json              # { "modules": ["./register.tsx"] }
│   ├── hooks/register.tsx            # the hooks module
│   ├── hooks/*.test.ts(x)            # claude plugin test runs them
│   └── types/index.d.ts              # the $.state contract
├── scripts/check.sh                  # what CI runs: validate and test everything
└── .github/workflows/ci.yml
```

## Adding a mod

1. Build it under `mods/<name>/` with the files above. The `plugin-authoring` skill writes the API types beside the mod; they and the mod's `tsconfig.json` are generated and gitignored.
2. Add its entry to `.claude-plugin/marketplace.json`: `name`, `description`, `version` (the same as its `plugin.json`), `source: "./mods/<name>"`, `category`, `tags`.
3. Run `bash scripts/check.sh` (the marketplace validates, the catalog matches `mods/`, every mod validates and passes its tests), then the devkit `find_*` checks over the mod.
4. Add it to the README: a row in the Mods table and a section of its own.

A change to a mod bumps its version in both `plugin.json` and its marketplace entry. Users pick it up with `claude plugin marketplace update claude-mods`.

## Developing

- `claude --plugin-dir mods/<name>` runs a session with the mod loaded from the repo.
- `~/.claude/skills/<name>` linked to `mods/<name>` (a junction on Windows) loads it in every session; `/reload-plugins` takes an edit.
- Type-check with `npx -p typescript tsc -p mods/<name>` once Claude Code has laid the types (any session that loaded the mod).

## Hard rules

1. **devkit conventions** apply: read the topic before writing code, run `find_format`, `find_duplication` and `find_hardcoded` over the mod when done.
2. **No comments** in modules. English for code and identifiers.
3. **User-facing text is data:** a mod that speaks more than one language keeps every string in a locale table (`locales.ts`), English by default.
4. **Colors live in one place** (`palette.ts`), measurements in one place (`layout.ts`).
5. **Branch on `e.surface`**, never on `'Input' in table`: the engine completes every surface's element table, so that check is always true. `mobile` has no `Input`, `Select` or `Client`; `terminal` has no `Svg`; `vscode` has no `Client`.
6. **A grid is `Box`es of fixed `width` and `height`**, never `Text` with a background: CConnect draws a background `Text` as a rounded chip sized to its content.
7. **JSON files end at `}`** with no trailing newline.

## Gotchas

- `claude plugin validate` reads the `$.state` contract literally: keys inline under the plugin's name in `interface PluginState`; a contract exports types and nothing else.
- Each hook has a 10 s budget: `$.clock.sleep` counts, an in-flight `$` call does not.
- An MCP tool result too large for the model comes back to `$.tool.call` as `Error: result (...) exceeds maximum allowed tokens. Output has been saved to <file>.` without `isError`; read the saved file.
- The test kit has no `$.ui.focus` or `$.ui.scroll`; `ui.find` leaves `hover` out of `props` (read `ui.drawn()`).

## Publishing

- The repo must be public for directories to list it.
- mods4claude.com: submit at `https://mods4claude.com/submit` with the repo URL and the mod name as in its `plugin.json`. They ask for `claude plugin validate` to pass.
- claudemod.com: submit at `https://www.claudemod.com/submit`.