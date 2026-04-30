import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'agent/**/*.test.ts'],
    environment: 'node',
  },
})
