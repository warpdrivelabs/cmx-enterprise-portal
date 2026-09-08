// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { setSkinStyle, resolveSkin, applyNeoSkin, applyPageStyleId } from '../cmx-skin-runtime.js'

describe('cmx-skin-runtime', () => {
  describe('setSkinStyle', () => {
    it('注入 <style> 到 shadowRoot（按 layer 生成正确 id）', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      setSkinStyle(shadow, 'cmx-panel', ':host{color:red}', 'neo')
      const el = shadow.getElementById('cmx-panel-skin-neo')
      expect(el).toBeTruthy()
      expect(el.tagName).toBe('STYLE')
      expect(el.textContent).toBe(':host{color:red}')
    })

    it('page layer 生成 -skin-page id', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      setSkinStyle(shadow, 'cmx-panel', ':host{}', 'page')
      expect(shadow.getElementById('cmx-panel-skin-page')).toBeTruthy()
    })

    it('custom layer（默认）生成 -skin-custom id', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      setSkinStyle(shadow, 'cmx-panel', ':host{}')
      expect(shadow.getElementById('cmx-panel-skin-custom')).toBeTruthy()
    })

    it('复用既有节点（不重复创建）', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      setSkinStyle(shadow, 'cmx-panel', 'a', 'neo')
      setSkinStyle(shadow, 'cmx-panel', 'b', 'neo')
      const els = shadow.querySelectorAll('#cmx-panel-skin-neo')
      expect(els).toHaveLength(1)
      expect(els[0].textContent).toBe('b')
    })

    it('空 cssText 时移除既有节点', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      setSkinStyle(shadow, 'cmx-panel', 'a', 'neo')
      setSkinStyle(shadow, 'cmx-panel', '', 'neo')
      expect(shadow.getElementById('cmx-panel-skin-neo')).toBeNull()
    })

    it('shadow 为空时安全返回', () => {
      expect(() => setSkinStyle(null, 'cmx-panel', 'a', 'neo')).not.toThrow()
    })
  })

  describe('resolveSkin', () => {
    let host
    beforeEach(() => { host = document.createElement('div') })
    afterEach(() => { delete globalThis.__cmxDefaultTestSkin })

    it('显式 data-cmx-skin 优先', () => {
      host.setAttribute('data-cmx-skin', 'flat')
      expect(resolveSkin(host, '__cmxDefaultTestSkin', 'neo')).toBe('flat')
    })

    it('显式属性归一化小写', () => {
      host.setAttribute('data-cmx-skin', 'NEO')
      expect(resolveSkin(host, '__cmxDefaultTestSkin', 'neo')).toBe('neo')
    })

    it('无显式属性时取全局默认', () => {
      globalThis.__cmxDefaultTestSkin = 'neo'
      expect(resolveSkin(host, '__cmxDefaultTestSkin', 'flat')).toBe('neo')
    })

    it('全局默认缺失时用 fallback', () => {
      expect(resolveSkin(host, '__cmxDefaultTestSkin', 'neo')).toBe('neo')
    })

    it('空字符串 data-cmx-skin 视为未设置', () => {
      host.setAttribute('data-cmx-skin', '  ')
      globalThis.__cmxDefaultTestSkin = 'neo'
      expect(resolveSkin(host, '__cmxDefaultTestSkin', 'flat')).toBe('neo')
    })
  })

  describe('applyNeoSkin', () => {
    afterEach(() => { delete globalThis.__cmxDefaultPanelSkin })

    it('neo 皮肤：加激活 class + 注入 <style>', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      const skin = applyNeoSkin({
        host, shadow, idBase: 'cmx-panel',
        neoCss: ':host(.cmx-panel-neo){color:red}',
        globalKey: '__cmxDefaultPanelSkin',
        activeClass: 'cmx-panel-neo',
      })
      expect(skin).toBe('neo')
      expect(host.classList.contains('cmx-panel-neo')).toBe(true)
      expect(shadow.getElementById('cmx-panel-skin-neo').textContent).toContain('color:red')
    })

    it('非 neo 皮肤：不加 class、不注入 <style>', () => {
      const host = document.createElement('div')
      host.setAttribute('data-cmx-skin', 'none')
      const shadow = host.attachShadow({ mode: 'open' })
      const skin = applyNeoSkin({
        host, shadow, idBase: 'cmx-panel',
        neoCss: ':host{}', globalKey: '__cmxDefaultPanelSkin',
      })
      expect(skin).toBe('none')
      expect(host.classList.contains('cmx-panel-neo')).toBe(false)
      expect(shadow.getElementById('cmx-panel-skin-neo')).toBeNull()
    })

    it('toneClass 按 data-cmx-skin-tone 生成变体 class', () => {
      const host = document.createElement('div')
      host.setAttribute('data-cmx-skin-tone', 'mint')
      const shadow = host.attachShadow({ mode: 'open' })
      applyNeoSkin({
        host, shadow, idBase: 'cmx-grid',
        neoCss: ':host{}', globalKey: '__cmxDefaultGridSkin',
        activeClass: 'cmx-grid-neo',
        toneClass: (tone) => (tone && tone !== 'cyan' ? `cmx-grid-neo--${tone}` : null),
      })
      expect(host.classList.contains('cmx-grid-neo')).toBe(true)
      expect(host.classList.contains('cmx-grid-neo--mint')).toBe(true)
    })
  })

  describe('applyPageStyleId', () => {
    it('读取 data-cmx-style-id 指向的 <style> 注入为 page layer', () => {
      const styleNode = document.createElement('style')
      styleNode.id = 'my-override'
      styleNode.textContent = ':host{color:blue}'
      document.body.appendChild(styleNode)

      const host = document.createElement('div')
      host.setAttribute('data-cmx-style-id', 'my-override')
      const shadow = host.attachShadow({ mode: 'open' })
      applyPageStyleId(host, shadow, 'cmx-panel')

      expect(shadow.getElementById('cmx-panel-skin-page').textContent).toBe(':host{color:blue}')
      styleNode.remove()
    })

    it('无 data-cmx-style-id 时安全返回', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      expect(() => applyPageStyleId(host, shadow, 'cmx-panel')).not.toThrow()
      expect(shadow.getElementById('cmx-panel-skin-page')).toBeNull()
    })
  })
})
