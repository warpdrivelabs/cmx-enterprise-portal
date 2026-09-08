/**
 * 拖拽分隔条工具函数
 */

/**
 * 为分隔条绑定水平拖拽事件
 * @param {HTMLElement} splitter  - 分隔条元素
 * @param {(deltaX: number) => void} onMove - 每帧回调
 */
export function bindHorizontalDrag(splitter, onMove) {
  let startX = 0;

  const onMouseMove = (e) => {
    const dx = e.clientX - startX;
    startX = e.clientX;
    onMove(dx);
  };

  const onMouseUp = () => {
    splitter.classList.remove('dragging');
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    splitter.classList.add('dragging');
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

/**
 * 为分隔条绑定垂直拖拽事件
 * @param {HTMLElement} splitter  - 分隔条元素
 * @param {(deltaY: number) => void} onMove - 每帧回调
 */
export function bindVerticalDrag(splitter, onMove) {
  let startY = 0;

  const onMouseMove = (e) => {
    const dy = e.clientY - startY;
    startY = e.clientY;
    onMove(dy);
  };

  const onMouseUp = () => {
    splitter.classList.remove('dragging');
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    splitter.classList.add('dragging');
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
