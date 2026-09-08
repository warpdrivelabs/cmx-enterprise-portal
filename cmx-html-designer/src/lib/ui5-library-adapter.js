/**
 * Ui5LibraryAdapter — SAP UI5 Web Components 适配器（ComponentLibraryAdapter 的具体实现）
 *
 * UI5 运行时由 cmx-ui5-runtime 提供；主题/语言 API 从 globalThis.__cmxUi5 读取。
 */
import { getCmxUi5RuntimeSync } from 'cmx-ui5-runtime/client';
import { ComponentLibraryAdapter } from './component-library-adapter.js';

const THEMES = [
  { value: 'sap_horizon',      label: 'Horizon 亮色',     dark: false },
  { value: 'sap_horizon_dark', label: 'Horizon 暗色',     dark: true  },
  { value: 'sap_horizon_hcb',  label: 'Horizon 高对比黑', dark: true  },
  { value: 'sap_horizon_hcw',  label: 'Horizon 高对比白', dark: false },
  { value: 'sap_fiori_3',      label: 'Quartz 亮色',      dark: false },
  { value: 'sap_fiori_3_dark', label: 'Quartz 暗色',      dark: true  },
  { value: 'sap_fiori_3_hcb',  label: 'Quartz 高对比黑',  dark: true  },
  { value: 'sap_fiori_3_hcw',  label: 'Quartz 高对比白',  dark: false },
];

const LANGUAGES = [
  { value: 'zh_CN', flag: '🇨🇳', label: '中文简体' },
  { value: 'en_US', flag: '🇺🇸', label: 'American English' },
];

export class Ui5LibraryAdapter extends ComponentLibraryAdapter {
  get themes()       { return THEMES; }
  get languages()    { return LANGUAGES; }
  get defaultTheme() { return 'sap_horizon_dark'; }

  applyTheme(id) {
    getCmxUi5RuntimeSync()?.setTheme(id);
  }

  applyLanguage(id) {
    void getCmxUi5RuntimeSync()?.setLanguage(id);
  }

  themeInfo(id)      { return THEMES.find(t => t.value === id) ?? null; }
}
