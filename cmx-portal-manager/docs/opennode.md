现在 openNode 支持三种用法：


const app = document.querySelector('cmx-portal-app')

// 1. 直接传后端菜单节点 JSON
await app.openNode({ id: 'my-page', caption: '页面', workspace: { content: { ... } } })

// 2. 用 WorkspaceNode.fromMenuNode 包装后传入
const node = WorkspaceNode.fromMenuNode(menuJson, { tabId: 'custom-tab' })
await app.openNode(node)

// 3. 完全手工构造 WorkspaceNode
const node = new WorkspaceNode({
  workspace: { content: { type: 'html_pages', views: [{ htmlPageId: 'abc' }] } },
  meta: { tabId: 'my-tab', label: '自定义页面', icon: 'document' },
})
await app.openNode(node)
