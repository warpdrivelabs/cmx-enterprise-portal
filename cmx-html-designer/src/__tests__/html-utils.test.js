import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/index.js', () => ({
  library: { defaultTheme: 'sap_horizon_dark' },
}));

import {
  escapeAttr,
  escapeHtml,
  rgbToHex,
  getStyleValue,
  prettyFormatHtml,
  serializeDesignArea,
  serializeDesignAreaWithIds,
  wrapHtmlDocument,
  slugForCmxHtmlPagesTag,
  cmxHtmlPagesElementLocalName,
  cmxPageTemplateElementId,
  cmxPageRuntimeClassName,
  formatDebugRunTabLabel,
  parseDesignerRunSession,
  parseDesignerRunBatchSession,
  stripDesignScriptsFromHtmlFragment,
} from '../utils/html-utils.js';

// ── escapeAttr ──────────────────────────────────────────────────────────────

describe('escapeAttr', () => {
  it('escapes ampersands', () => {
    expect(escapeAttr('a&b')).toBe('a&amp;b');
  });
  it('escapes double quotes', () => {
    expect(escapeAttr('say "hi"')).toBe('say &quot;hi&quot;');
  });
  it('handles both in same string', () => {
    expect(escapeAttr('a&"b')).toBe('a&amp;&quot;b');
  });
  it('returns empty string for null/undefined', () => {
    expect(escapeAttr(null)).toBe('');
    expect(escapeAttr(undefined)).toBe('');
  });
  it('coerces numbers', () => {
    expect(escapeAttr(42)).toBe('42');
  });
  it('leaves safe characters unchanged', () => {
    expect(escapeAttr('hello world')).toBe('hello world');
  });
});

// ── escapeHtml ──────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });
  it('escapes less-than', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });
  it('escapes greater-than', () => {
    expect(escapeHtml('a>b')).toBe('a&gt;b');
  });
  it('handles all three together', () => {
    expect(escapeHtml('<a&b>')).toBe('&lt;a&amp;b&gt;');
  });
  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  it('leaves safe text unchanged', () => {
    expect(escapeHtml('hello "world"')).toBe('hello "world"');
  });
});

// ── rgbToHex ────────────────────────────────────────────────────────────────

describe('rgbToHex', () => {
  it('converts rgb(0,0,0) to #000000', () => {
    expect(rgbToHex('rgb(0, 0, 0)')).toBe('#000000');
  });
  it('converts rgb(255,255,255) to #ffffff', () => {
    expect(rgbToHex('rgb(255, 255, 255)')).toBe('#ffffff');
  });
  it('converts rgb(0, 112, 242) correctly', () => {
    expect(rgbToHex('rgb(0, 112, 242)')).toBe('#0070f2');
  });
  it('returns non-rgb values unchanged', () => {
    expect(rgbToHex('#abc123')).toBe('#abc123');
  });
  it('returns non-rgb strings unchanged', () => {
    expect(rgbToHex('red')).toBe('red');
  });
  it('pads single-digit hex values', () => {
    expect(rgbToHex('rgb(1, 2, 3)')).toBe('#010203');
  });
});

// ── getStyleValue ───────────────────────────────────────────────────────────

describe('getStyleValue', () => {
  it('returns empty string when property not set', () => {
    const el = document.createElement('div');
    expect(getStyleValue(el, 'color')).toBe('');
  });
  it('returns hex for rgb color values', () => {
    const el = document.createElement('div');
    el.style.backgroundColor = 'rgb(0, 112, 242)';
    expect(getStyleValue(el, 'backgroundColor')).toBe('#0070f2');
  });
  it('returns value as-is for non-rgb values', () => {
    const el = document.createElement('div');
    el.style.fontSize = '14px';
    expect(getStyleValue(el, 'fontSize')).toBe('14px');
  });
});

// ── prettyFormatHtml ────────────────────────────────────────────────────────

describe('prettyFormatHtml', () => {
  it('returns fallback for empty string', () => {
    expect(prettyFormatHtml('')).toBe('<!-- 设计区为空 -->');
  });
  it('formats a simple element', () => {
    const result = prettyFormatHtml('<div>hello</div>');
    expect(result).toContain('<div>');
    expect(result).toContain('hello');
    expect(result).toContain('</div>');
  });
  it('indents nested elements', () => {
    const result = prettyFormatHtml('<ul><li>item</li></ul>');
    expect(result).toMatch(/  <li>/);
  });
  it('handles void tags without closing tag', () => {
    const result = prettyFormatHtml('<br>');
    expect(result).toContain('<br>');
    expect(result).not.toContain('</br>');
  });
  it('preserves attributes', () => {
    const result = prettyFormatHtml('<div class="foo">text</div>');
    expect(result).toContain('class="foo"');
  });
});

// ── serializeDesignArea ─────────────────────────────────────────────────────

describe('serializeDesignArea', () => {
  function makeArea(html) {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el;
  }

  it('returns fallback for empty area', () => {
    const area = makeArea('');
    expect(serializeDesignArea(area)).toBe('<!-- 设计区为空 -->');
  });

  it('strips data-design-node and data-node-id', () => {
    const area = makeArea('<span data-design-node data-node-id="1">text</span>');
    const result = serializeDesignArea(area);
    expect(result).not.toContain('data-design-node');
    expect(result).not.toContain('data-node-id');
    expect(result).toContain('text');
  });

  it('removes selected and drop-target classes', () => {
    const area = makeArea('<span data-design-node class="selected drop-target">text</span>');
    const result = serializeDesignArea(area);
    expect(result).not.toContain('selected');
    expect(result).not.toContain('drop-target');
  });

  it('removes sel-overlay element', () => {
    const area = makeArea('<div data-design-node>x</div><div class="sel-overlay">overlay</div>');
    const result = serializeDesignArea(area);
    expect(result).not.toContain('sel-overlay');
    expect(result).not.toContain('overlay');
  });

  it('clears {{varName}} placeholders in attrs when forExport=true', () => {
    const area = makeArea('<div data-design-node label="{{myVar}}">text</div>');
    const result = serializeDesignArea(area, true);
    expect(result).toContain('label=""');
  });

  it('preserves data-bind-* attrs when forExport=true', () => {
    const area = makeArea('<div data-design-node data-bind-text="{{x}}">text</div>');
    const result = serializeDesignArea(area, true);
    expect(result).toContain('data-bind-text');
  });

  it('strips designer runtime attrs from normal output', () => {
    const area = makeArea('<div data-design-node data-designer-preview-visible="1" data-designer-auto-min-height="1">text</div>');
    const result = serializeDesignArea(area);
    expect(result).not.toContain('data-designer-preview-visible');
    expect(result).not.toContain('data-designer-auto-min-height');
  });

  it('preserves business data attrs when attr filtering is enabled', () => {
    const area = makeArea('<div data-design-node data-state="hidden" data-kind="posted" data-status="draft" unknown-ui5-internal="x">text</div>');
    const result = serializeDesignArea(area, false, () => new Set(['class', 'style']));
    expect(result).toContain('data-state="hidden"');
    expect(result).toContain('data-kind="posted"');
    expect(result).toContain('data-status="draft"');
    expect(result).not.toContain('unknown-ui5-internal');
  });
});

// ── serializeDesignAreaWithIds ──────────────────────────────────────────────

describe('serializeDesignAreaWithIds', () => {
  it('keeps data-node-id in output', () => {
    const area = document.createElement('div');
    area.innerHTML = '<span data-design-node data-node-id="42">hi</span>';
    const result = serializeDesignAreaWithIds(area);
    expect(result).toContain('data-node-id="42"');
  });

  it('removes data-design-node attribute', () => {
    const area = document.createElement('div');
    area.innerHTML = '<span data-design-node data-node-id="1">hi</span>';
    const result = serializeDesignAreaWithIds(area);
    expect(result).not.toContain('data-design-node');
  });

  it('strips designer runtime attrs while keeping node ids', () => {
    const area = document.createElement('div');
    area.innerHTML = '<span data-design-node data-node-id="1" data-designer-preview-visible="1">hi</span>';
    const result = serializeDesignAreaWithIds(area);
    expect(result).toContain('data-node-id="1"');
    expect(result).not.toContain('data-designer-preview-visible');
  });

  it('keeps business data attrs with node ids', () => {
    const area = document.createElement('div');
    area.innerHTML = '<span data-design-node data-node-id="1" data-state="hidden" data-kind="posted">hi</span>';
    const result = serializeDesignAreaWithIds(area, () => new Set(['class', 'style']));
    expect(result).toContain('data-node-id="1"');
    expect(result).toContain('data-state="hidden"');
    expect(result).toContain('data-kind="posted"');
  });
});

// ── wrapHtmlDocument ────────────────────────────────────────────────────────

describe('wrapHtmlDocument', () => {
  it('includes DOCTYPE', () => {
    expect(wrapHtmlDocument('<p>hi</p>')).toContain('<!DOCTYPE html>');
  });
  it('embeds canvas HTML in page-bound template id and host tag', () => {
    const html = wrapHtmlDocument('<p>hello</p>');
    expect(html).toContain('id="cmx-page-template-unnamed"');
    expect(html).toContain('cmx-html-pages-unnamed');
    expect(html).toContain('<p>hello</p>');
  });
  it('uses library.defaultTheme in bootstrap script', () => {
    expect(wrapHtmlDocument('')).toContain('sap_horizon_dark');
  });
  it('includes importmap', () => {
    expect(wrapHtmlDocument('')).toContain('"imports"');
  });
  it('embeds scriptBlock when provided', () => {
    expect(wrapHtmlDocument('', 'var x = 1;')).toContain('var x = 1;');
  });
  it('includes __hydrateEvents when scriptBlock provided', () => {
    expect(wrapHtmlDocument('', 'var x = 1;')).toContain('__hydrateEvents');
  });
  it('includes __hydrateEvents when scriptBlock is empty (仅画布事件、无 page-data 时)', () => {
    expect(wrapHtmlDocument('<p>ui only</p>', '')).toContain('__hydrateEvents');
  });
  it('uses new Function for event handlers instead of eval', () => {
    expect(wrapHtmlDocument('<p>x</p>', '')).toContain('new Function');
    expect(wrapHtmlDocument('<p>x</p>', '')).not.toContain('eval(');
  });
  it('embeds metaJson in head when provided', () => {
    expect(wrapHtmlDocument('', '', '{"foo":"bar"}')).toContain('__designer_meta__');
    expect(wrapHtmlDocument('', '', '{"foo":"bar"}')).toContain('{"foo":"bar"}');
  });
  it('body contains cmx host even when canvas empty', () => {
    const result = wrapHtmlDocument('');
    expect(result).toContain('<body');
    expect(result).toContain('cmx-html-pages-unnamed');
  });
  it('respects pageId for host tag name', () => {
    expect(wrapHtmlDocument('', '', '', [], 'My.App')).toContain('cmx-html-pages-my-app');
  });
  it('respects pageId for template element id and runtime class name', () => {
    const html = wrapHtmlDocument('<span></span>', '', '', [], 'app.v2');
    expect(html).toContain('id="cmx-page-template-app-v2"');
    expect(html).toContain('querySelector("#cmx-page-template-app-v2")');
    expect(html).toContain('class CmxHtmlPage_app_v2 extends HTMLElement');
    expect(html).toContain('customElements.define(TAG, CmxHtmlPage_app_v2)');
  });
});

// ── cmx-html-pages 运行宿主工具 ─────────────────────────────────────────────

describe('slugForCmxHtmlPagesTag', () => {
  it('maps dots and underscores to hyphens', () => {
    expect(slugForCmxHtmlPagesTag('app.home_v1')).toBe('app-home-v1');
  });
  it('uses unnamed for empty', () => {
    expect(slugForCmxHtmlPagesTag('')).toBe('unnamed');
    expect(slugForCmxHtmlPagesTag('   ')).toBe('unnamed');
  });
});

describe('cmxHtmlPagesElementLocalName', () => {
  it('prefixes slug', () => {
    expect(cmxHtmlPagesElementLocalName('My.Page')).toBe('cmx-html-pages-my-page');
  });
});

describe('cmxPageTemplateElementId', () => {
  it('prefixes template id with page slug', () => {
    expect(cmxPageTemplateElementId('home')).toBe('cmx-page-template-home');
    expect(cmxPageTemplateElementId('A.B_c')).toBe('cmx-page-template-a-b-c');
  });
});

describe('cmxPageRuntimeClassName', () => {
  it('builds unique class identifier per pageId', () => {
    expect(cmxPageRuntimeClassName('home')).toBe('CmxHtmlPage_home');
    expect(cmxPageRuntimeClassName('app.v2')).toBe('CmxHtmlPage_app_v2');
  });
  it('prefixes with underscore when slug starts with digit', () => {
    expect(cmxPageRuntimeClassName('9a')).toMatch(/^CmxHtmlPage__/);
  });
});

describe('parseDesignerRunSession', () => {
  it('returns null for empty', () => {
    expect(parseDesignerRunSession(null)).toBeNull();
    expect(parseDesignerRunSession('')).toBeNull();
  });
  it('parses JSON payload', () => {
    const p = parseDesignerRunSession(JSON.stringify({ html: '<p>x</p>', pageId: 'a.b' }));
    expect(p).toEqual({ html: '<p>x</p>', pageId: 'a.b' });
  });
  it('defaults pageId for JSON without pageId', () => {
    const p = parseDesignerRunSession(JSON.stringify({ html: '<p>x</p>' }));
    expect(p).toEqual({ html: '<p>x</p>', pageId: 'unnamed' });
  });
  it('treats non-JSON as legacy full html', () => {
    const p = parseDesignerRunSession('<!DOCTYPE html><html>');
    expect(p?.pageId).toBe('unnamed');
    expect(p?.html).toContain('<!DOCTYPE');
  });
});

describe('parseDesignerRunBatchSession', () => {
  it('returns null for empty', () => {
    expect(parseDesignerRunBatchSession(null)).toBeNull();
    expect(parseDesignerRunBatchSession('')).toBeNull();
  });
  it('parses valid batch payload', () => {
    const raw = JSON.stringify({
      pages: [
        { pageId: 'a.b', html: '<body><p>1</p></body>', name: 'N1', details: '', timestamp: 't1' },
        { pageId: 'c', html: '<body><p>2</p></body>' },
      ],
    });
    const b = parseDesignerRunBatchSession(raw);
    expect(b?.pages).toHaveLength(2);
    expect(b?.pages[0]).toMatchObject({
      pageId: 'a.b',
      name: 'N1',
      timestamp: 't1',
    });
    expect(b?.pages[1].details).toBe('');
  });
  it('drops entries without html or pageId', () => {
    const raw = JSON.stringify({
      pages: [
        { pageId: 'x', html: '   ' },
        { pageId: '', html: '<p>a</p>' },
        { pageId: 'ok', html: '<p>ok</p>' },
      ],
    });
    const b = parseDesignerRunBatchSession(raw);
    expect(b?.pages).toEqual([
      expect.objectContaining({ pageId: 'ok', html: '<p>ok</p>' }),
    ]);
  });
});

describe('formatDebugRunTabLabel', () => {
  it('uses custom title when not the export placeholder', () => {
    expect(formatDebugRunTabLabel('我的首页', 'app.home')).toBe('我的首页');
  });
  it('uses 当前调试 / pageId when title is the default export title', () => {
    expect(formatDebugRunTabLabel('导出页面', 'app.home')).toBe('当前调试 / app.home');
  });
  it('uses 当前调试 when title is empty', () => {
    expect(formatDebugRunTabLabel('', 'x')).toBe('当前调试 / x');
  });
});

describe('stripDesignScriptsFromHtmlFragment', () => {
  it('removes script tags and returns joined script text', () => {
    const { html, scriptsJoined } = stripDesignScriptsFromHtmlFragment(
      '<p>a</p><script>foo();</script><p>b</p>',
    );
    expect(html).toContain('<p>a</p>');
    expect(html).toContain('<p>b</p>');
    expect(html).not.toContain('script');
    expect(scriptsJoined).toBe('foo();');
  });
  it('skips non-executable script types', () => {
    const { html, scriptsJoined } = stripDesignScriptsFromHtmlFragment(
      '<script type="application/json">{"x":1}</script><script>x=1</script>',
    );
    expect(scriptsJoined).toBe('x=1');
    expect(html).toContain('application/json');
  });
  it('removes __designer_meta__ json script', () => {
    const { html, scriptsJoined } = stripDesignScriptsFromHtmlFragment(
      '<p>x</p><script type="application/json" id="__designer_meta__">{"pageData":[]}</script>',
    );
    expect(html).not.toContain('__designer_meta__');
    expect(scriptsJoined).toBe('');
  });
});
