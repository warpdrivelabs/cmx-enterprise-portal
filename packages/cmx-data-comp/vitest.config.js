import { defineConfig } from 'vitest/config'

// 纯模型/引擎层（lib/*）多为无 DOM 依赖的纯函数，默认用 node 环境跑得更快；
// 个别需要 DOM 的用例可在文件顶部用 `// @vitest-environment jsdom` 覆盖。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.js'],
      reporter: ['text', 'lcov'],
    },
  },
})
