import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    /* 与 vite.config.js 的 dev 解析对齐：cmx-ui5-runtime 是 workspace 链接包，
       exports 仅声明公开子路径；client.js 内部的 'cmx-ui5-runtime/src/install.js'
       动态 import 在 node/vitest 解析下会被 exports 拦截，需 alias 到源码。 */
    alias: [
      { find: /^cmx-ui5-runtime\/src\/(.+)$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/src/$1') },
      { find: /^cmx-ui5-runtime\/client$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/src/client.js') },
      { find: /^cmx-ui5-runtime\/api-client$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/src/api-client.js') },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**/*.js'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 40, functions: 40, branches: 40 },
    },
  },
});
