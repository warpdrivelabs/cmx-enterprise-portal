/**
 * 活跃组件库适配器单例。
 * 替换组件库时只需在此处换用新的适配器实现。
 */
import { Ui5LibraryAdapter } from './ui5-library-adapter.js';

export const library = new Ui5LibraryAdapter();
