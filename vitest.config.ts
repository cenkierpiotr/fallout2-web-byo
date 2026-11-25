import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'tools/!(*.py|*.json)'],
    include: ['**/*.test.ts'],
  },
});
