# Scientific calculator

A dependency-free scientific calculator web app in `calculator/`.

```sh
npm start        # serves http://localhost:8080 (or just open calculator/index.html)
npm test         # engine unit tests (Node 18+)
```

- Operators: `+ − × ÷ ^`, `%`, `!` (also non-integers via gamma), `mod`, `nPr`, `nCr`, `root` (`3 root 27`), implicit multiplication (`2π`, `3(4+1)`), auto-closed parentheses
- Functions: `sin cos tan` and inverses, hyperbolic variants (`2nd` / `hyp` keys), `log ln √ ∛ |x| ⌊x⌋ ⌈x⌉ 10ˣ eˣ 1/x`, `EXP` notation, `π`, `e`, `Ans`
- DEG / RAD / GRAD modes (exact results at multiples of 90°), memory (MC MR M+ M− MS), history, light/dark theme, keyboard input
- Errors are reported, not crashed on: `Cannot divide by zero`, `Invalid input` (e.g. `√(−1)`, `ln(0)`, `asin(2)`), `Undefined` (`tan(90°)`, `0^0`), `Overflow` (`171!`), `Syntax error`

The parser lives in `calculator/engine.js` (UI-independent, covered by `calculator/engine.test.js`); `app.js` is the UI.

---

# Claude repo template

A starting point for new repos with Claude Code wired in through GitHub
Actions. Replace this README with your project's own after creating a repo.

## What you get

- `@claude` assistant workflow with `[model:x] [effort:y]` tags
- Label-triggered PR review with model/effort labels
- A run-summary comment (model, effort, time, tokens, cost) after every run
- Labels managed from `.github/labels.yml` and synced automatically
- Issue and PR templates, agent instructions (`AGENTS.md`, imported by `CLAUDE.md`)
- Docs in `docs/claude/`

Defaults: Sonnet 5.5, medium effort. See `docs/claude/README.md`.

## Using it

1. On GitHub: **Use this template -> Create a new repository**, then clone it.
2. Run the bootstrap script from the clone:

   ```sh
   bash scripts/bootstrap.sh
   ```

   It sets the `CLAUDE_CODE_OAUTH_TOKEN` secret (generate one with
   `claude setup-token`) and starts the label sync.
3. Install the Claude GitHub App on the new repo: https://github.com/apps/claude
4. Test: open an issue from the **Claude task** template.

GitHub does not copy secrets, labels, app installs or repo settings from a
template, which is why steps 2 and 3 exist.

## Project-specific edits

- `AGENTS.md` and `docs/agents/`: adjust to the project's issue tracker and
  domain docs (the files assume GitHub issues and a single-context repo).
- `.github/labels.yml`: add the project's own labels.

## Keeping the template up to date

A template is a snapshot: existing repos do not receive later changes. To pull
improvements into an older repo, diff it against this template and copy the
changed files (`.github/`, `docs/claude/`, `scripts/`).
