/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Los tests de la demo la regeneran día a día durante dos semanas; en paralelo superan los 5 s por defecto
    testTimeout: 20_000,
  },
})
