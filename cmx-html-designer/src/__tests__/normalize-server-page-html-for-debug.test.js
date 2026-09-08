import { describe, expect, it } from 'vitest';
import { normalizeServerPageHtmlForDebug } from '../utils/normalize-server-page-html-for-debug.js';

describe('normalizeServerPageHtmlForDebug', () => {
  it('wraps server fragment + meta into runnable doc with hydrate and host', () => {
    const meta = {
      pageData: [{ name: 'var1', type: 'string', defaultValue: '' }],
      pageFns: [{
        name: 'testClick',
        params: 'str',
        body: "alert(str);",
        readsVars: [],
        writesVars: [],
      }],
      pageServices: [],
      pageDeps: [],
    };
    const fragment = `<ui5-button data-eventclick="testClick(&quot;x&quot;);">x</ui5-button>
<script>
function testClick() {}
</script>
<script type="application/json" id="__designer_meta__">${JSON.stringify(meta)}</script>`;

    const out = normalizeServerPageHtmlForDebug(fragment, 'my-page-test101');
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('function __hydrateEvents');
    expect(out).toContain('cmx-html-pages-my-page-test101');
    expect(out).toContain('id="cmx-page-template-my-page-test101"');
    expect(out).toMatch(/host\.testClick\s*=\s*new Function\(/);
    expect(out).toContain('cmx://page-fn/my-page-test101/testClick');
  });

  it('passes through already wrapped runtime HTML', () => {
    const wrapped = `<!DOCTYPE html><html><body><template id="cmx-page-template-a"></template>
<cmx-html-pages-a></cmx-html-pages-a><script>function __hydrateEvents(){}</script></body></html>`;
    expect(normalizeServerPageHtmlForDebug(wrapped, 'a')).toBe(wrapped);
  });

  it('preserves pageInterfaces from server meta so author iface impls survive into runnable doc', () => {
    const meta = {
      pageData: [],
      pageFns: [],
      pageServices: [],
      pageDeps: [],
      pageInterfaces: [
        { name: 'onMount', enabled: true, body: 'host.__cmxFromIface = 42;' },
      ],
    };
    const fragment = `<div></div>
<script type="application/json" id="__designer_meta__">${JSON.stringify(meta)}</script>`;
    const out = normalizeServerPageHtmlForDebug(fragment, 'iface-roundtrip');
    expect(out).toMatch(/host\.onMount\s*=\s*new Function\(/);
    expect(out).toContain('cmx://page-iface/iface-roundtrip/onMount');
  });
});
