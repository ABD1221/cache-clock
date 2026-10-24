/** Minimal type shims for claude-code module (full types via `claude plugin types`). */
declare module 'claude-code' {
  export interface PluginState {
    [plugin: string]: Record<string, unknown>
  }
  export interface Atom<T> {
    readonly plugin: string
    readonly key: string
    readonly defaultValue: T
  }
  export function atom<T>(source: { plugin: string; key: string }, defaultValue: T): Atom<T>
  export function read<T>($: ModsApi, a: Atom<T>): Promise<T>
  export function update<T>($: ModsApi, a: Atom<T>, fn: (current: T) => T): Promise<void>

  export interface ModsApi {
    ui: {
      resolve(e: unknown): Record<string, (props: Record<string, unknown>) => unknown>
      invalidate(event: string): void
      toast(text: string, opts?: { timeoutMs?: number }): Promise<unknown>
      status(text: string): void
      log(text: string): void
      open(opts: { id: string; title?: string; focus?: true; closeOnEscape?: true }): Promise<{ isPlaced: boolean }>
      close(opts: { id: string }): Promise<void>
    }
    command: { register(opts: { name: string; description: string; argumentHint?: string; immediate?: boolean }): Promise<void> }
    clock: {
      every(ms: number, fn: () => void | Promise<void>): { cancel(): void }
      now(): Promise<number>
      after(ms: number, fn: () => void | Promise<void>): { cancel(): void }
      sleep(ms: number): Promise<void>
    }
    session: {
      compact(): Promise<unknown>
      messages(): Promise<unknown[]>
      id(): Promise<string>
    }
    state: {
      get(source: { plugin: string; key: string }): Promise<unknown>
      set(source: { plugin: string; key: string }, value: unknown): Promise<void>
    }
    process: { run(argv: string[], opts?: Record<string, unknown>): Promise<{ exitCode: number; stdout: string; stderr: string }> }
    http: { fetch(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; text: string; headers: Record<string, string> }> }
    store: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; delete(key: string): Promise<void> }
    fs: { read(path: string): Promise<string>; write(path: string, text: string): Promise<void>; exists(path: string): Promise<boolean> }
    env: { get(name: string): string | undefined; set(name: string, value: string): void }
    agent: { list(): Promise<unknown[]>; spawn(opts: unknown): Promise<unknown> }
    model: { complete(opts: unknown): Promise<{ isAnswered: boolean; text: string; usage: unknown }> }
    prompt: { submit(opts: { text: string; asUser?: boolean }): Promise<unknown> }
    tool: { register(opts: unknown): Promise<void>; call(opts: unknown): Promise<unknown> }
    mcp: { call(opts: unknown): Promise<unknown> }
    telemetry: { log(opts: unknown): void; mark(name: string): void }
    settings: { read(): Promise<unknown> }
    config: { list(): Promise<unknown[]>; set(key: string, value: unknown): Promise<void> }
    plugin: { name: string; root: string }
  }
}
