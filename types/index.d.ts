declare module 'claude-code' {
  interface PluginState {
    'cache-clock': {
      /** Unix timestamp (ms) when the cache was last written or read on the main loop. 0 = cold. */
      lastCacheMs: number
    }
  }
}
