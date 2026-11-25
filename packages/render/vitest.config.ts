import { defineConfig } from 'vitest/config';

// Limit 30 s: pelny przebieg monorepo na obciazonej maszynie przekracza domyslne 5 s.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
