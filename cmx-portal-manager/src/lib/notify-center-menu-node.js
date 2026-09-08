// 通知中心菜单节点：按中心(task/message/log)打开一个 content 区的通知列表页。
// 借鉴 help-center-menu-node.js；同一 native_page(portal.notify.center)，用 props.center 区分中心，
// tabId 含 center 以便三中心各开各的 tab。

const CENTER_META = {
  task: { label: '任务中心', icon: 'task' },
  message: { label: '消息中心', icon: 'email' },
  log: { label: '日志中心', icon: 'history' },
}

export function createNotifyCenterMenuNode (center) {
  const c = CENTER_META[center] ? center : 'task'
  const meta = CENTER_META[c]
  return {
    id: `portal-notify-${c}`,
    name: `notify-${c}`,
    caption: meta.label,
    type: 'workspace-node',
    permissionId: null,
    icon: meta.icon,
    workspace: {
      content: {
        caption: meta.label,
        icon: meta.icon,
        views: [
          {
            tabLabel: meta.label,
            icon: meta.icon,
            type: 'native_pages',
            native_page: 'portal.notify.center',
            view: 'content',
            props: { center: c },
          },
        ],
      },
    },
  }
}
