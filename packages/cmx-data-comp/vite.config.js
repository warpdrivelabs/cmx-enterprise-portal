import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      'cmx-data-comp': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
  },
  optimizeDeps: {
    exclude: [
      '@ui5/webcomponents',
      '@ui5/webcomponents-fiori',
      '@ui5/webcomponents-base',
      '@ui5/webcomponents-icons',
      '@ui5/webcomponents-localization',
      '@ui5/webcomponents-theming',
    ],
  },
})
