import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  base: './',
  test: {
    // The component tests mount App.svelte into a fake DOM. The algorithm
    // tests don't touch the DOM, so this costs them nothing.
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
})
