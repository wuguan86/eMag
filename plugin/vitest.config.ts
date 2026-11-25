import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', include: ['tests/**/*.test.{ts,tsx,mjs}'], restoreMocks: true,
    environmentOptions: { jsdom: { url: 'https://www.emag.ro/' } },
  },
});
