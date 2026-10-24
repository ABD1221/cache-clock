/** Minimal type shims for claude-code/testing (requires Claude Code v2.1.287+). */
declare module 'claude-code/testing' {
  import type { ModsApi } from 'claude-code'

  export interface MockClock {
    now(): number
    advance(ms: number): Promise<void>
    set(ms: number): Promise<void>
    settle(): Promise<void>
    sleep(ms: number): Promise<void>
  }

  export interface Ui {
    press(opts: { key: string }): Promise<void>
    input(opts: { key: string; text: string; kind?: 'change' }): Promise<void>
    select(opts: { key: string; value: string }): Promise<void>
    find(opts: { key?: string; type?: string; text?: string | RegExp }): Promise<unknown>
    unmount(): Promise<void>
  }

  export interface TestDollar {
    tool: { call(opts: Record<string, unknown>): Promise<unknown> }
    command: { run(opts: { command: string; args: string }): Promise<{ text: string }> }
    session: { start(opts: { surface: string; isInteractive: boolean; cwd: string }): Promise<unknown> }
    turn: { step(opts: { turnId: string; index: number; model: string; messageCount: number }): AsyncGenerator<unknown, unknown, unknown> }
    turn: { complete(opts: { turnId: string; answer: string; durationMs: number; isAborted: boolean; usage: unknown }): Promise<unknown> }
    prompt: { submit(opts: { text: string }): Promise<unknown> }
    classic: Record<string, (opts: unknown) => Promise<unknown>>
    ui: { mount(opts: Record<string, unknown>): Promise<Ui> }
    [key: string]: unknown
  }

  export type OnFn = (event: string, stubFn: ($: ModsApi, e: Record<string, unknown>) => unknown) => void

  export function test(
    name: string,
    opts: { plugins?: Array<{ name: string; register: (on: unknown) => void }> } | ((dollar: TestDollar, on: OnFn) => Promise<void>),
    fn?: (dollar: TestDollar, on: OnFn) => Promise<void>
  ): void

  export function tier(t: 'prepend' | 'append' | 'builtin' | 'user'): void

  export const expect: {
    (actual: unknown): {
      toBe(expected: unknown): void
      toEqual(expected: unknown): void
      toMatch(pattern: string | RegExp): void
      toMatchObject(obj: object): void
      toContain(item: unknown): void
      toBeDefined(): void
      toBeUndefined(): void
      toThrow(): void
      not: ReturnType<typeof expect>
    }
  }

  export const mock: {
    clock(on: OnFn, opts?: { now?: number }): MockClock
    store(on: OnFn, initial?: Record<string, unknown>): void
    env(on: OnFn, vars?: Record<string, string>): void
    session(on: OnFn): { appended(): unknown[] }
  }
}
