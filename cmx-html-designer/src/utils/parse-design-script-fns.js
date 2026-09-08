/**
 * 从设计器「源码」风格脚本中解析顶层 `function name(a,b) { ... }`（可选 `async`），
 * 供导入 HTML / 应用源码后同步「函数」页。
 *
 * body 为花括号内原文（不含最外层 `{}`），与 pageFns.body 存盘格式一致。
 * 不解析箭头函数、类方法、嵌套在字符串/模板字符串内的 `function`（简化实现）。
 *
 * @param {string} scriptText
 * @returns {{ name: string, params: string, body: string }[]}
 */
export function parseDesignPageFunctionDeclarations(scriptText) {
  const src = String(scriptText ?? '');
  /** @type {{ name: string, params: string, body: string }[]} */
  const out = [];

  let i = 0;

  const skipWsComments = () => {
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (c === '/' && src[i + 1] === '/') {
        i += 2;
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i + 1 < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i = Math.min(src.length, i + 2);
        continue;
      }
      break;
    }
  };

  const skipString = (quote) => {
    i++;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === quote) {
        i++;
        return;
      }
      i++;
    }
  };

  /** @param {number} openBraceIdx index of `{` */
  const readBlockEnd = (openBraceIdx) => {
    let j = openBraceIdx;
    let depth = 0;
    while (j < src.length) {
      const c = src[j];
      if (c === '"' || c === "'" || c === '`') {
        const q = c;
        j++;
        while (j < src.length) {
          if (src[j] === '\\') {
            j += 2;
            continue;
          }
          if (src[j] === q) {
            j++;
            break;
          }
          j++;
        }
        continue;
      }
      if (c === '/' && src[j + 1] === '/') {
        j += 2;
        while (j < src.length && src[j] !== '\n') j++;
        continue;
      }
      if (c === '/' && src[j + 1] === '*') {
        j += 2;
        while (j + 1 < src.length && !(src[j] === '*' && src[j + 1] === '/')) j++;
        j += 2;
        continue;
      }
      if (c === '{') {
        depth++;
        j++;
        continue;
      }
      if (c === '}') {
        depth--;
        j++;
        if (depth === 0) return j;
        continue;
      }
      j++;
    }
    return -1;
  };

  while (i < src.length) {
    skipWsComments();
    if (i >= src.length) break;

    const rest = src.slice(i);
    const asyncFn = rest.match(/^async\s+function\s+/);
    const plainFn = rest.match(/^function\s+/);
    const kw = asyncFn?.[0] ?? plainFn?.[0];
    if (!kw) {
      i++;
      continue;
    }
    i += kw.length;
    skipWsComments();
    const nameM = src.slice(i).match(/^[a-zA-Z_$][\w$]*/);
    if (!nameM) {
      i++;
      continue;
    }
    const name = nameM[0];
    i += name.length;
    skipWsComments();
    if (src[i] !== '(') {
      i++;
      continue;
    }
    i++;
    const pStart = i;
    let pDepth = 1;
    while (i < src.length && pDepth > 0) {
      const ch = src[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        skipString(ch);
        continue;
      }
      if (ch === '/' && src[i + 1] === '/') {
        i += 2;
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && src[i + 1] === '*') {
        i += 2;
        while (i + 1 < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      if (ch === '(') pDepth++;
      else if (ch === ')') pDepth--;
      i++;
    }
    const params = src.slice(pStart, i - 1).trim();
    skipWsComments();
    if (src[i] !== '{') {
      i++;
      continue;
    }
    const open = i;
    const end = readBlockEnd(open);
    if (end < 0) break;
    const inner = src.slice(open + 1, end - 1);
    const body = dedent(inner.replace(/^\r?\n/, '').replace(/\r?\n\s*$/, ''));
    out.push({ name, params, body });
    i = end;
  }

  return out;
}

/**
 * 移除多行文本的公共前缀缩进（tab 或空格），保留相对缩进。
 * @param {string} text
 * @returns {string}
 */
function dedent(text) {
  const lines = text.split('\n');
  // 只看非空行，找最小缩进量
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (!nonEmpty.length) return text;
  const minIndent = Math.min(
    ...nonEmpty.map((l) => {
      const m = l.match(/^(\s*)/)
      return m ? m[1].length : 0
    }),
  )
  if (minIndent === 0) return text;
  return lines.map((l) => l.slice(minIndent)).join('\n');
}
