import { atom, read, update } from 'claude-code'

// ── Cache-write pricing table ($ per 1 million tokens) ─────────────────────
// Source: Anthropic published pricing. Cache write = 1.25× base input price.
// Base input prices (from claude-api skill, cached 2026-02-17):
//   claude-opus-4-6:   $5.00/M  →  cache write $6.25/M
//   claude-sonnet-4-6: $3.00/M  →  cache write $3.75/M
//   claude-haiku-4-5:  $1.00/M  →  cache write $1.25/M
// A model absent from this table shows "≈ ?" — never guess.
const WRITE_PRICE_PER_M = {
  'claude-opus-4-6':             6.25,
  'claude-sonnet-4-6':           3.75,
  'claude-haiku-4-5':            1.25,
  'claude-haiku-4-5-20251001':   1.25,
  'claude-opus-4-5':             6.25,
  'claude-opus-4-5-20251101':    6.25,
  'claude-sonnet-4-5':           3.75,
  'claude-sonnet-4-5-20250929':  3.75,
  'claude-opus-4-1':             6.25,
  'claude-opus-4-1-20250805':    6.25,
  'claude-opus-4-0':             6.25,
  'claude-opus-4-20250514':      6.25,
  'claude-sonnet-4-0':           3.75,
  'claude-sonnet-4-20250514':    3.75,
}

// ── Helpers ────────────────────────────────────────────────────────────────
/** 6-block progress bar for cache warmth (1.0 = full, 0 = empty). */
function progressBar(ratio) {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * 6)
  return '▰'.repeat(filled) + '▱'.repeat(6 - filled)
}

/** Compact token count: 180000 → "180k", 1200000 → "1.2M". */
function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

/** Cost (null = unknown model) → display string prefixed with "≈". */
function fmtCost(cost) {
  if (cost === null) return '≈ ?'
  if (cost < 0.005) return '≈ <$0.01'
  return '≈ $' + cost.toFixed(2)
}

/** What it would cost to re-cache `tokens` tokens with the given model. */
function coldRewriteCost(tokens, model) {
  const price = WRITE_PRICE_PER_M[model]
  return price != null ? (tokens * price) / 1_000_000 : null
}

// ── $.state atom — survives module reloads; drives reactive band redraws ───
const lastCacheAtom = atom({ plugin: 'cache-clock', key: 'lastCacheMs' }, 0)

// ── Module-level state (acceptable to lose on reload) ──────────────────────
let sessionTotalReads  = 0
let sessionTotalWrites = 0
let sessionTotalInput  = 0
let lastStepReads      = 0
let lastStepWrites     = 0
let lastStepInput      = 0
let lastStepModel      = ''
let fiveMinToastShown  = false
let enabled            = true

export function register(on, options) {
  const cacheMs = Number(options?.cacheMinutes ?? 60) * 60_000

  // ── session.start ─────────────────────────────────────────────────────────
  on('session.start', async ($, e, next) => {
    // Register the /cache-clock command (immediate so it works during turns)
    await $.command.register({
      name: 'cache-clock',
      description: 'Cache clock: on | off | status',
      argumentHint: 'on|off|status',
      immediate: true,
    })

    // Tick every 30 s: refresh the progress bar and fire the 5-min warning toast
    $.clock.every(30_000, async () => {
      if (!enabled) return
      const lastMs = await read($, lastCacheAtom)
      if (!lastMs) return
      const remaining = lastMs + cacheMs - await $.clock.now()

      if (!fiveMinToastShown && remaining > 0 && remaining <= 5 * 60_000) {
        fiveMinToastShown = true
        const cached = lastStepReads + lastStepWrites
        const cost   = coldRewriteCost(cached, lastStepModel)
        $.ui.toast(
          `Cache expires in ~5 min · ${fmtTokens(cached)} tokens · ` +
          `cold rewrite ${fmtCost(cost)} · Send anything to keep it warm.`,
          { timeoutMs: 10_000 },
        )
      }

      // Force band redraw for colour/bar update (state hasn't changed, time has)
      $.ui.invalidate('ui.render')
    })

    return next(e)
  })

  // ── turn.step — capture cache token counts from each model request ─────────
  // Async generator: yield* next(e) streams the response, then we inspect usage.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)

    if (result?.usage) {
      const reads  = result.usage.cache_read_input_tokens    ?? 0
      const writes = result.usage.cache_creation_input_tokens ?? 0
      const input  = result.usage.input_tokens               ?? 0
      const model  = result.usage.model                      ?? ''

      // Always accumulate session totals (subagent steps included)
      sessionTotalReads  += reads
      sessionTotalWrites += writes
      sessionTotalInput  += input

      if (!e.agentId) {
        // Main-loop step: update last-step metrics regardless of cache activity
        lastStepReads  = reads
        lastStepWrites = writes
        lastStepInput  = input
        lastStepModel  = model

        // Only restart the warmth countdown when this step actually used the cache
        if (reads > 0 || writes > 0) {
          fiveMinToastShown = false
          // update() triggers reactive redraws of the band via $.state
          const now = await $.clock.now()
          await update($, lastCacheAtom, () => now)
        }
      }
    }

    return result
  })

  // ── AbovePrompt band ───────────────────────────────────────────────────────
  // Stack our line on top; preserve other mods' band content below.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!enabled) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const lastMs      = await read($, lastCacheAtom)
    const now         = await $.clock.now()
    const remaining   = lastMs ? lastMs + cacheMs - now : 0
    const remainingMin = Math.max(0, Math.floor(remaining / 60_000))
    const ratio       = lastMs ? Math.max(0, remaining / cacheMs) : 0
    const bar         = progressBar(ratio)

    // Colour thresholds: green > 15 min, amber ≤ 15 min, red = COLD
    let statusColor, statusText
    if (!lastMs || remaining <= 0) {
      statusColor = 'red'
      statusText  = 'COLD'
    } else if (remainingMin <= 15) {
      statusColor = '#f59e0b'  // amber
      statusText  = `warm ${remainingMin}m`
    } else {
      statusColor = '#22c55e'  // green
      statusText  = `warm ${remainingMin}m`
    }

    // % reused = cache reads ÷ (reads + writes + fresh input) — last main step
    const lastTotal = lastStepReads + lastStepWrites + lastStepInput
    const pctReused = lastTotal > 0 ? Math.round((lastStepReads / lastTotal) * 100) : 0
    const cached    = lastStepReads + lastStepWrites
    const cost      = coldRewriteCost(cached, lastStepModel)

    // Preserve other mods' band lines below ours
    const theirs = await next(e)

    const myLine = Box({
      flexDirection: 'row',
      columnGap: 1,
      children: [
        // Label chip: bold dark text on cyan — matches the spec colour
        Text({
          backgroundColor: '#22d3ee',
          color: '#0b0b0f',
          weight: 'bold',
          children: [' • CACHE '],
        }),
        Text({ color: statusColor, children: [statusText] }),
        Text({ children: [bar] }),
        // Stats only shown when cache is warm
        ...(lastMs && remaining > 0 ? [
          Text({ dimColor: true, children: [`${pctReused}% reused`] }),
          Text({ dimColor: true, children: ['·'] }),
          Text({ dimColor: true, children: [`${fmtTokens(cached)} cached`] }),
          Text({ dimColor: true, children: ['·'] }),
          Text({ dimColor: true, children: [`cold rewrite ${fmtCost(cost)}`] }),
        ] : []),
        Button({
          key: 'compact',
          label: 'Compact',
          onPress: async () => {
            try {
              await $.session.compact()
              $.ui.toast('Compacted.', { timeoutMs: 5_000 })
            } catch (err) {
              $.ui.toast(
                'Compact failed: ' + (err?.message ?? String(err)),
                { timeoutMs: 5_000 },
              )
            }
          },
        }),
      ],
    })

    return Box({
      flexDirection: 'column',
      children: [myLine, theirs],
    })
  })

  // ── /cache-clock command ───────────────────────────────────────────────────
  on('command.run', { command: 'cache-clock' }, async ($, e) => {
    const arg = String(e.args ?? '').trim().toLowerCase()

    if (arg === 'on') {
      enabled = true
      $.ui.invalidate('ui.render')
      return { text: 'Cache clock: ON' }
    }

    if (arg === 'off') {
      enabled = false
      $.ui.invalidate('ui.render')
      return { text: 'Cache clock: OFF' }
    }

    if (arg === 'status' || arg === '') {
      const total    = sessionTotalReads + sessionTotalWrites + sessionTotalInput
      const pct      = total > 0 ? Math.round((sessionTotalReads / total) * 100) : 0
      // Estimated savings: tokens served from cache at 0.1× base price instead
      // of full input price → saving ≈ 90% of base input price per read token.
      // base input = WRITE_PRICE_PER_M[model] / 1.25
      const writePrice = lastStepModel ? WRITE_PRICE_PER_M[lastStepModel] ?? null : null
      const savedCost  = writePrice !== null
        ? (sessionTotalReads * (writePrice / 1.25) * 0.9) / 1_000_000
        : null
      return {
        text: [
          `cache-clock: ${enabled ? 'ON' : 'OFF'} · model: ${lastStepModel || '(none)'}`,
          `reads: ${fmtTokens(sessionTotalReads)} · writes: ${fmtTokens(sessionTotalWrites)} · % reused: ${pct}%`,
          `est. savings: ${fmtCost(savedCost)} (estimate)`,
        ].join('\n'),
      }
    }

    return { text: 'Usage: /cache-clock on | off | status' }
  })
}
