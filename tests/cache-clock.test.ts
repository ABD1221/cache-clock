import { expect, mock, test } from 'claude-code/testing'

// Shared AbovePrompt mount props used by band tests
const BAND = {
  plugin: 'cache-clock',
  component: 'AbovePrompt',
  requestId: 'AbovePrompt',
  viewport: { columns: 140, rows: 40, isFullscreen: false },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 5,
    bodyColumns: 140,
    scroll: { offset: 0, bodyRows: 5 },
    view: {},
  },
} as const

// ── Test 1 (required): [Compact] button triggers $.session.compact() ─────────
test('[Compact] button calls $.session.compact()', async ($, on) => {
  let compactCalled = false

  // clock.now is needed because ui.render calls $.clock.now()
  mock.clock(on)

  // All on() stubs registered before the first $ call ($.ui.mount)
  on('session.compact', () => {
    compactCalled = true
    // engine requires at least one valid message shape
    return { messages: [{ role: 'user', text: '[compacted]', toolUses: [] }] }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: [''] }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'compact' })
  await ui.unmount()

  expect(compactCalled).toBe(true)
})

// ── Test 2: /cache-clock status returns the expected fields ───────────────────
test('/cache-clock status reports reads, writes, and % reused', async ($, on) => {
  mock.clock(on)
  on('session.start',    () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const result = await $.command.run({ command: 'cache-clock', args: 'status' })
  expect(result.text).toMatch(/reads:/)
  expect(result.text).toMatch(/writes:/)
  expect(result.text).toMatch(/% reused:/)
  expect(result.text).toMatch(/est\. savings:/)
})

// ── Test 3: /cache-clock off → band falls through to other mods ───────────────
test('/cache-clock off lets other mods draw the band unmodified', async ($, on) => {
  mock.clock(on)
  on('session.start',    () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  // Must register ui.render stub BEFORE the first $ call
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['other mod'] }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const offResult = await $.command.run({ command: 'cache-clock', args: 'off' })
  expect(offResult.text).toBe('Cache clock: OFF')

  // With mod disabled, band hook returns next(e) — other mods' element is the root
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const el  = await ui.find({ type: 'Text', text: 'other mod' })
  expect(el).toBeDefined()
  await ui.unmount()

  const onResult = await $.command.run({ command: 'cache-clock', args: 'on' })
  expect(onResult.text).toBe('Cache clock: ON')
})

// ── Test 4: turn.step with cache activity updates the band ───────────────────
test('turn.step with cache reads updates the band display', async ($, on) => {
  mock.clock(on)
  on('session.start',    () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  // Must register turn.step stub BEFORE the first $ call
  on('turn.step', async function* ($_, e) {
    yield { kind: 'text', index: 0, text: 'response' }
    return {
      turnId:     e.turnId,
      index:      e.index,
      answer:     'response',
      toolUses:   [],
      stopReason: 'end_turn',
      usage: {
        input_tokens:                500,
        output_tokens:                50,
        cache_read_input_tokens:    1800,   // 1.8k reads
        cache_creation_input_tokens:   0,
        model: 'claude-sonnet-4-6',
      },
    }
  })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-4-6', messageCount: 1 })
  let step = await stream.next()
  while (!step.done) step = await stream.next()

  const result = await $.command.run({ command: 'cache-clock', args: 'status' })
  expect(result.text).toMatch(/reads: 1\.8k/)
})

// ── Test 5: 5-minute toast fires once when cache is about to expire ───────────
test('5-minute warning toast fires once and not twice', async ($, on) => {
  const clock  = mock.clock(on, { now: 0 })
  const toasts: string[] = []

  on('ui.toast', ($_, e) => {
    toasts.push(e.text as string)
    return { value: undefined }
  })
  on('session.start',    () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  // Must register turn.step stub BEFORE the first $ call
  on('turn.step', async function* ($_, e) {
    yield { kind: 'text', index: 0, text: 'hi' }
    return {
      turnId:     e.turnId,
      index:      e.index,
      answer:     'hi',
      toolUses:   [],
      stopReason: 'end_turn',
      usage: {
        input_tokens:                100,
        output_tokens:                10,
        cache_read_input_tokens:     500,
        cache_creation_input_tokens:   0,
        model: 'claude-opus-4-6',
      },
    }
  })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  // Fire a step at t=55min so lastCacheMs is set to 55*60_000
  await clock.set(55 * 60_000)
  const stream = $.turn.step({ turnId: 't2', index: 0, model: 'claude-opus-4-6', messageCount: 1 })
  let step = await stream.next()
  while (!step.done) step = await stream.next()

  // TTL is 60min → expires at t=115min.
  // Advance to t=110min (5 min remaining) — tick should fire the warning toast
  await clock.advance(55 * 60_000)
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toMatch(/5 min/)

  // Another tick must NOT fire a second toast
  await clock.advance(30_000)
  expect(toasts.length).toBe(1)
})
