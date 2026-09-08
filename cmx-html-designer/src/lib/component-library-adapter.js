/**
 * ComponentLibraryAdapter — 组件库适配层抽象接口
 *
 * 将设计器对特定 UI 组件库（SAP UI5、Shoelace、Material 等）的运行时依赖
 * 收敛至此接口。替换组件库只需提供该接口的新实现，无需修改业务代码。
 *
 * 当前具体实现：Ui5LibraryAdapter（src/lib/ui5-library-adapter.js）
 *
 * 接口约定：
 *   themes        — 可用主题列表：[{ value: string, label: string, dark: boolean }]
 *   languages     — 可用语言列表：[{ value: string, flag: string, label: string }]
 *   defaultTheme  — 默认主题 id 字符串
 *   applyTheme(id)     — 通知组件库运行时切换主题
 *   applyLanguage(id)  — 通知组件库运行时切换语言
 *   themeInfo(id)      — 返回主题元数据 { value, label, dark } 或 null
 */
export class ComponentLibraryAdapter {
  /** @returns {{ value: string, label: string, dark: boolean }[]} */
  get themes()       { return []; }

  /** @returns {{ value: string, flag: string, label: string }[]} */
  get languages()    { return []; }

  /** @returns {string} 默认主题 id */
  get defaultTheme() { return ''; }

  /** @param {string} id 主题 id */
  applyTheme(id)     {}

  /** @param {string} id 语言 id */
  applyLanguage(id)  {}

  /**
   * 返回给定 id 的主题元数据，未找到时返回 null。
   * @param {string} id
   * @returns {{ value: string, label: string, dark: boolean } | null}
   */
  themeInfo(id)      { return null; }
}
