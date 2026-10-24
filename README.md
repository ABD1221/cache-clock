# cache-clock

A Claude Code mod that shows whether your prompt cache is still warm.

Displays a live band above the prompt:

```
 • CACHE  warm 52m  ▰▰▰▰▰▱  94% reused · 180k cached · cold rewrite ≈ $1.12  [Compact]
```

- **Green** when >15 min remain, **amber** at ≤15 min, **red COLD** when expired
- Toasts once at 5 minutes left with token count, rewrite cost, and a nudge to send something
- `[Compact]` button calls `$.session.compact()` in one click
- Stacks on top of other mods' band content — never hides theirs

## Requirements

Claude Code ≥ 2.1.287

## Install

```bash
cp -r . ~/.claude/skills/cache-clock
claude plugin enable cache-clock@skills-dir
```

Restart Claude Code — the band appears immediately.

## Command

```
/cache-clock on | off | status
```

`status` shows session-total reads, writes, % reused, and estimated savings.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `cacheMinutes` | `60` | Match your Claude API cache TTL: `5` or `60` |

Set via `/cache-clock` settings or in your Claude Code config.

## How it works

- Hooks `turn.step` to capture `cache_read_input_tokens` and `cache_creation_input_tokens` from each main-loop step (subagent steps count toward session totals but don't restart the countdown)
- Stores the last-cache timestamp in `$.state` so it survives redraws
- Ticks every 30 s via `$.clock.every` to update the bar and fire the warning toast
- Cold-rewrite cost = cached tokens × cache-write price for the model that answered (prices from Anthropic's published pricing; unknown models show `≈ ?`)

## Development

```bash
# Type-check the test file
npx tsc --project tsconfig.json

# Run tests (requires Claude Code ≥ 2.1.287)
claude plugin test .

# Validate manifest
claude plugin validate .
```
