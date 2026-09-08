import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  cmx_log,
  installCmxConsoleTap,
  uninstallCmxConsoleTap,
  isCmxConsoleTapInstalled,
} from '../utils/cmx-console.js';

describe('cmx-console', () => {
  afterEach(() => {
    uninstallCmxConsoleTap();
  });

  it('installCmxConsoleTap forwards to sink and restores on uninstall', () => {
    const lines = [];
    installCmxConsoleTap((level, line) => {
      lines.push(`${level}:${line}`);
    });
    expect(isCmxConsoleTapInstalled()).toBe(true);

    console.log('a', 1);
    console.warn('b');
    console.error('c');

    expect(lines.some((l) => l.startsWith('log:a 1'))).toBe(true);
    expect(lines.some((l) => l === 'warn:b')).toBe(true);
    expect(lines.some((l) => l === 'error:c')).toBe(true);

    uninstallCmxConsoleTap();
    expect(isCmxConsoleTapInstalled()).toBe(false);
  });

  it('cmx_log bypasses tap', () => {
    const lines = [];
    installCmxConsoleTap((level, line) => {
      lines.push(`${level}:${line}`);
    });
    cmx_log.log('only-native');
    expect(lines.length).toBe(0);
    uninstallCmxConsoleTap();
  });
});
