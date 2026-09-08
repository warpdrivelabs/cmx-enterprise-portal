/**
 * `cmx-html-pages-*` 对话框适配器：
 *   将 host CE 的「对外接口」契约绑定到一个 ui5-dialog 宿主，统一处理：
 *   - 渲染对话框头部标题（`getDialogTitle`）
 *   - 渲染对话框底部按钮（`getDialogButtons`），动作分派到 `save/apply/cancel/close`
 *   - 关闭前拦截（`onDialogClose(reason)` 与 `canClose()`）
 *   - 监听 `cmx-page-dirty-changed` / `cmx-page-busy-changed` / `cmx-page-request-close` / `cmx-page-request-save`
 *   - 在挂载完成后调用 `onDialogOpen(args)` 与 `onMount(ctx)`
 *
 * 不依赖具体的对话框元素实现；仅要求传入若干 DOM 钩子，宿主完全决定布局与样式。
 *
 * @example
 *   const adapter = openCmxPageInDialog({
 *     pageId: 'sales.order',
 *     args: { orderId: 42 },
 *     ctx: { user, locale, region: 'content' },
 *     mountIn: dialogBodyEl,
 *     titleSlot: dialogTitleEl,
 *     footerSlot: dialogFooterEl,
 *     onResult: (data) => console.log('saved', data),
 *     close: () => uiDialog.close(),
 *   });
 *   uiDialog.addEventListener('before-close', (ev) => {
 *     if (!adapter.allowClose()) ev.preventDefault();
 *   });
 */

import { cmxHtmlPagesElementLocalName } from '../utils/html-utils.js';

/**
 * @typedef {object} CmxDialogAdapterOptions
 * @property {string} pageId                     必填；用于推导宿主元素 tag 名
 * @property {unknown} [args]                    传给 onDialogOpen
 * @property {object} [ctx]                      传给 onMount / setContext
 * @property {HTMLElement} mountIn               承载 `<cmx-html-pages-*>` 的容器
 * @property {HTMLElement} [titleSlot]           写入 `getDialogTitle()` 文本
 * @property {HTMLElement} [footerSlot]          根据 `getDialogButtons()` 渲染 ui5-button
 * @property {HTMLElement} [hostEl]              （可选）已存在的 host 元素，否则适配器自行创建
 * @property {(payload: { reason: string, result?: unknown }) => void} [onResult]
 *                                              save/apply 成功 / cancel 时回调
 * @property {() => void} [close]                请求宿主关闭对话框
 * @property {(dirty: boolean) => void} [onDirtyChanged]
 * @property {(busy: { busy: boolean, message: string }) => void} [onBusyChanged]
 */

/**
 * @param {CmxDialogAdapterOptions} opts
 */
export function openCmxPageInDialog (opts) {
  const {
    pageId,
    args,
    ctx,
    mountIn,
    titleSlot,
    footerSlot,
    onResult,
    close,
    onDirtyChanged,
    onBusyChanged,
  } = opts;
  if (!mountIn) throw new Error('[cmx-page-dialog-adapter] mountIn is required');
  if (!pageId)  throw new Error('[cmx-page-dialog-adapter] pageId is required');

  const tag = cmxHtmlPagesElementLocalName(pageId);
  const host = opts.hostEl || /** @type {HTMLElement} */ (document.createElement(tag));
  if (!host.isConnected) mountIn.appendChild(host);

  let closing = false;
  let lastResult;
  let allowedToClose = false;

  const tryCall = (name, ...a) => {
    try {
      const fn = /** @type {any} */ (host)[name];
      return typeof fn === 'function' ? fn.apply(host, a) : undefined;
    } catch (e) {
      console.warn(`[cmx-page-dialog] ${name} threw`, e);
      return undefined;
    }
  };

  const onDirty = (ev) => {
    onDirtyChanged?.(!!ev?.detail?.dirty);
  };
  const onBusy = (ev) => {
    onBusyChanged?.({ busy: !!ev?.detail?.busy, message: String(ev?.detail?.message || '') });
  };
  const onReqClose = (ev) => {
    void runClose(ev?.detail?.reason || 'close');
  };
  const onReqSave = () => {
    void runAction('save');
  };

  host.addEventListener('cmx-page-dirty-changed', onDirty);
  host.addEventListener('cmx-page-busy-changed', onBusy);
  host.addEventListener('cmx-page-request-close', onReqClose);
  host.addEventListener('cmx-page-request-save', onReqSave);

  // 等组件 connectedCallback 跑完一拍，再注入上下文与对话框参数
  Promise.resolve().then(() => {
    tryCall('setContext', ctx || null);
    tryCall('onDialogOpen', args);
    tryCall('onMount', ctx || null);
    tryCall('initPage', ctx || null);
    tryCall('onActivate');
    refreshTitle();
    refreshFooter();
  });

  function refreshTitle () {
    if (!titleSlot) return;
    const t = tryCall('getDialogTitle');
    titleSlot.textContent = typeof t === 'string' && t ? t : '';
  }

  function refreshFooter () {
    if (!footerSlot) return;
    footerSlot.innerHTML = '';
    let buttons = tryCall('getDialogButtons');
    if (!Array.isArray(buttons) || !buttons.length) {
      buttons = [
        { id: 'ok',     label: '确定', design: 'Emphasized', action: 'save' },
        { id: 'cancel', label: '取消', design: 'Default',    action: 'cancel' },
      ];
    }
    for (const b of buttons) {
      const btn = document.createElement('ui5-button');
      btn.id = `cmx-iface-${String(b.id || b.action || 'btn')}`;
      if (b.design) btn.setAttribute('design', String(b.design));
      btn.textContent = String(b.label || b.id || b.action || '按钮');
      btn.addEventListener('click', () => {
        void runAction(String(b.action || b.id || 'close'));
      });
      footerSlot.appendChild(btn);
    }
  }

  async function runAction (action) {
    if (closing) return;
    try {
      if (action === 'save' || action === 'apply') {
        host.setBusy?.(true, action === 'save' ? '保存中…' : '应用中…');
        const r = await tryCall(action);
        host.setBusy?.(false, '');
        if (r && r.ok === false) {
          console.warn(`[cmx-page-dialog] ${action} rejected`, r.error || r.errors);
          return;
        }
        lastResult = r && Object.prototype.hasOwnProperty.call(r, 'data') ? r.data : tryCall('getResult');
        onResult?.({ reason: action, result: lastResult });
        if (action === 'save') await runClose('ok', /*postSave=*/true);
      } else if (action === 'cancel') {
        await runClose('cancel');
      } else {
        await runClose(action);
      }
    } catch (e) {
      host.setBusy?.(false, '');
      console.warn(`[cmx-page-dialog] action ${action} failed`, e);
    }
  }

  async function runClose (reason, postSave = false) {
    if (closing) return;
    closing = true;
    let allow = true;
    if (!postSave) {
      const r = await tryCall('onDialogClose', reason);
      if (r === false) allow = false;
    }
    if (allow) {
      const c = await tryCall('canClose');
      if (c === false) allow = false;
    }
    if (!allow) {
      closing = false;
      return;
    }
    allowedToClose = true;
    if (reason === 'cancel' && !postSave) {
      onResult?.({ reason: 'cancel' });
    }
    try { close?.(); } catch (e) { console.warn('[cmx-page-dialog] close failed', e); }
  }

  function dispose () {
    host.removeEventListener('cmx-page-dirty-changed', onDirty);
    host.removeEventListener('cmx-page-busy-changed', onBusy);
    host.removeEventListener('cmx-page-request-close', onReqClose);
    host.removeEventListener('cmx-page-request-save', onReqSave);
    tryCall('onDeactivate');
    if (host.parentNode === mountIn) mountIn.removeChild(host);
  }

  return {
    host,
    /** 重渲染标题与按钮（接口运行后状态变化时手动触发） */
    refresh: () => { refreshTitle(); refreshFooter(); },
    /** 触发某动作；外部按钮可不经 footerSlot 直接调 */
    invoke: runAction,
    /** 宿主在 before-close 钩子里调；返回 false 应被宿主用来阻止关闭 */
    allowClose: () => allowedToClose,
    /** 询问页面是否允许关闭（带 reason）；外部应等 Promise 再决定 */
    requestClose: (reason) => runClose(reason || 'close'),
    /** 拆除监听并卸载 host */
    dispose,
  };
}
