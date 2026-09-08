import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmxUi5RuntimeAppPlugin, cmxUi5SideEffectShimPlugin } from 'cmx-ui5-runtime/vite-app';
import { localeDataWhitelistPlugin } from 'cmx-ui5-runtime/vite';
import { designerMetadataPlugin } from './vite-designer-metadata-plugin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const now = new Date();
const buildTime = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

/**
 * vite 配置：使用函数形式以便按 mode 加载 .env 文件。
 *
 * 环境变量分层：
 *   - .env             所有 mode 共享的默认值（如 CMX_APP_BASE=/）
 *   - .env.production  生产构建覆盖（CMX_APP_BASE=/html/）
 *   - shell 环境变量   优先级最高，可临时覆盖 .env（CI/CD 场景）
 *
 * loadEnv 第三个参数 '' 表示加载所有前缀的变量（默认只加载 VITE_ 前缀）。
 * CMX_ 前缀变量仅在 vite.config.js 中可见，不暴露给前端代码。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  /** 应用基础路径。dev=/，prod=/html/（也可被 shell CMX_APP_BASE 临时覆盖） */
  const appBase = env.CMX_APP_BASE || './';
  /** 与 cmx-container 后端联调；可覆盖端口 */
  const backendTarget = env.CMX_VITE_BACKEND || 'http://127.0.0.1:8080';

  return {
    /** 生产构建用绝对 base（/html/），避免 /html 无尾斜杠时相对路径解析到 /assets/ */
    base: appBase,
    plugins: [cmxUi5SideEffectShimPlugin(), cmxUi5RuntimeAppPlugin(), localeDataWhitelistPlugin, designerMetadataPlugin()],
    resolve: {
      alias: [
        {
          find: /^cmx-data-comp\/lib\/(.+)$/,
          replacement: path.resolve(__dirname, '../packages/cmx-data-comp/src/lib/$1'),
        },
        {
          find: /^cmx-data-comp\/components\/(.+)$/,
          replacement: path.resolve(__dirname, '../packages/cmx-data-comp/src/components/$1'),
        },
        {
          find: /^cmx-data-comp$/,
          replacement: path.resolve(__dirname, '../packages/cmx-data-comp/src/index.js'),
        },
        /* dev 模式下 client.js fallback import 'cmx-ui5-runtime/src/install.js'，
           需要能解析到 runtime 源码（含顶层 await，Vite dev 原生支持）。
           注意：不能只 alias 包根目录（会破坏 exports 子路径），需逐一映射。 */
        { find: /^cmx-ui5-runtime\/src\/(.+)$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/src/$1') },
        { find: /^cmx-ui5-runtime\/client$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/src/client.js') },
        { find: /^cmx-ui5-runtime\/api-client$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/src/api-client.js') },
        { find: /^cmx-ui5-runtime\/vite-app$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/vite-app.js') },
        { find: /^cmx-ui5-runtime\/vite$/, replacement: path.resolve(__dirname, '../packages/cmx-ui5-runtime/vite.js') },
      ],
      dedupe: [
        '@ui5/webcomponents',
        '@ui5/webcomponents-base',
        '@ui5/webcomponents-fiori',
        '@ui5/webcomponents-icons',
        '@ui5/webcomponents-icons-tnt',
        '@ui5/webcomponents-icons-business-suite',
        '@ui5/webcomponents-localization',
        '@ui5/webcomponents-theming',
        'cmx-icon-resource',
        'cmx-ui5-runtime',
      ],
    },
    server: {
      fs: {
        allow: [path.resolve(__dirname, '..')],
      },
      proxy: {
        '/shared': { target: backendTarget, changeOrigin: true },
        '/api': { target: backendTarget, changeOrigin: true },
        '/rpc': { target: backendTarget, changeOrigin: true },
        '/graphql': { target: backendTarget, changeOrigin: true },
        '/trpc': { target: backendTarget, changeOrigin: true },
        '/sse': { target: backendTarget, changeOrigin: true },
        '/ws': { target: backendTarget, ws: true },
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
    build: {
      target: 'es2022',
      outDir: 'dist',
      sourcemap: true,
      chunkSizeWarningLimit: 1500,
      rolldownOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          login: path.resolve(__dirname, 'login.html'),
          preview: path.resolve(__dirname, 'preview.html'),
          debug: path.resolve(__dirname, 'debug.html'),
        },
      },
    },
    optimizeDeps: {
      exclude: [
        '@ui5/webcomponents',
        '@ui5/webcomponents-fiori',
        '@ui5/webcomponents-base',
        '@ui5/webcomponents-icons',
        '@ui5/webcomponents-icons-tnt',
        '@ui5/webcomponents-icons-business-suite',
        '@ui5/webcomponents-localization',
        '@ui5/webcomponents-theming',
      ],
    },
  }
});
