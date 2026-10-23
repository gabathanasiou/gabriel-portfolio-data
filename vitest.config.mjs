import { defineConfig } from 'vitest/config';

/* Pure-logic unit tests for the data pipeline (the bottom of the pyramid —
   see docs/TESTING.md). Node environment, no DOM: there is no browser layer
   in this repo.
   Run: `npm test` (watch: `npm run test:watch`). */
export default defineConfig({
  test: {
    include: ['scripts/**/__tests__/**/*.test.mjs'],
    environment: 'node'
  }
});
