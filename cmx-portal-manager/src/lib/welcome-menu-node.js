/**
 * 欢迎页菜单节点 JSON —— 与 `data/menu-pages/fi/cmxfico/gl/explorer-menu.json` 中的
 * `portal-welcome` 项保持等价。auto-open（启动时）、shellbar home 按钮、用户
 * 点菜单上的"欢迎页"三条入口共享同一份；任何一条入口都走 `Workspace.openWorkspaceNode`
 * → `prepareWorkspaceHtmlPages` → `WorkspaceNode.open_view` → contentArea.addTab，
 * 与点击其它菜单页（如交易单据）完全同一条链路，再无 special-case 路径。
 *
 * tabId 由 `WorkspaceNode.fromMenuNode` 从 node.id 推出来 → `portal-welcome`；
 * 同一个 tabId 重复 open 会自动 reselect 现有 tab（见 portal-content-area-tabs.addTab）。
 */
export const PORTAL_WELCOME_MENU_NODE = Object.freeze({
  id: 'portal-welcome',
  name: 'welcome',
  caption: '欢迎页',
  type: 'workspace-node',
  permissionId: null,
  icon: 'home',
  workspace: {
    content: {
      caption: '欢迎',
      icon: 'home',
      views: [
        {
          tabLabel: '欢迎',
          icon: 'home',
          type: 'html_pages',
          html_page: 'welcome',
        },
      ],
    },
  },
})
