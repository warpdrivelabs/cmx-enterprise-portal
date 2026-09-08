/**
 * formula-eval — 安全表达式求值器（用于细分元模型的计算公式与校验公式）
 *
 * 不使用裸 eval / new Function：自带词法分析 + 递归下降解析 + 求值，
 * 仅允许 数字 / 字符串 / 字段引用 / 白名单函数 / 算术·比较·逻辑运算符，
 * 因而可安全运行在 PortalManager 注入脚本（new Function 沙箱）与 Designer 预览中。
 *
 * 支持语法：
 *   字面量      123  3.14  'text'  "text"  true  false  null
 *   字段引用    unitPrice  quantity        （从 scope 取值；缺失按 0 处理）
 *   算术        + - * /  一元负号 -x
 *   比较        > < >= <= == !=
 *   逻辑        && || !x
 *   分组        ( ... )
 *   函数        数值 ROUND/ABS/FLOOR/CEIL/MIN/MAX/SUM/AVG/MOD/POWER/SQRT
 *               逻辑 IF/AND/OR/NOT/ISEMPTY/COALESCE
 *               字符串 CONCAT/LEN/UPPER/LOWER/TRIM/LEFT/RIGHT/MID/REPLACE/CONTAINS/STARTSWITH/ENDSWITH
 *               日期 TODAY/NOW/YEAR/MONTH/DAY/HOUR/MINUTE/DATEADD/DATEDIFF
 *   点分引用    维度.属性 / 表.列（单段或多段，从 scope 取值；缺失按 0）
 *
 * API：
 *   evalFormula(expr, scope)   -> number|boolean|string|null   求值（解析+计算一步）
 *   compileFormula(expr)       -> (scope) => value             预编译复用（缓存 AST）
 *
 * 设计取舍：表达式面向"行内字段计算 / 校验"，故标识符只解析单段名（不支持 a.b 取属性），
 * 缺失字段按数值 0 处理，使 `quantity > 0`、`unitPrice * quantity` 在空行下不抛错。
 */

const _num = (x) => Number(x) || 0
const _str = (x) => (x == null ? '' : String(x))
const _toDate = (x) => {
  if (x instanceof Date) return x
  if (x == null || x === '') return null
  const d = new Date(x)
  return Number.isNaN(d.getTime()) ? null : d
}
const _pad2 = (n) => String(n).padStart(2, '0')

const FUNCS = {
  // ── 数值 ──
  ROUND: (x, n) => {
    const d = Number.isFinite(n) ? n : 0
    const f = Math.pow(10, d)
    return Math.round(_num(x) * f) / f
  },
  ABS:   (x) => Math.abs(_num(x)),
  FLOOR: (x) => Math.floor(_num(x)),
  CEIL:  (x) => Math.ceil(_num(x)),
  MIN:   (...a) => Math.min(...a.map(_num)),
  MAX:   (...a) => Math.max(...a.map(_num)),
  SUM:   (...a) => a.reduce((s, v) => s + _num(v), 0),
  AVG:   (...a) => a.length ? a.reduce((s, v) => s + _num(v), 0) / a.length : 0,
  MOD:   (a, b) => { const d = _num(b); return d === 0 ? 0 : _num(a) % d },
  POWER: (a, b) => Math.pow(_num(a), _num(b)),
  SQRT:  (x) => Math.sqrt(_num(x)),
  // ── 逻辑 ──
  IF:    (c, a, b) => (c ? a : b),
  AND:   (...a) => a.every(Boolean),
  OR:    (...a) => a.some(Boolean),
  NOT:   (x) => !x,
  ISEMPTY: (x) => x == null || x === '',
  COALESCE: (...a) => { for (const v of a) { if (v != null && v !== '') return v } return null },
  // ── 字符串 ──
  CONCAT: (...a) => a.map(_str).join(''),
  LEN:    (x) => _str(x).length,
  UPPER:  (x) => _str(x).toUpperCase(),
  LOWER:  (x) => _str(x).toLowerCase(),
  TRIM:   (x) => _str(x).trim(),
  LEFT:   (x, n) => _str(x).slice(0, Math.max(0, _num(n))),
  RIGHT:  (x, n) => { const s = _str(x); const k = Math.max(0, _num(n)); return k ? s.slice(-k) : '' },
  MID:    (x, start, len) => _str(x).substr(Math.max(0, _num(start) - 1), _num(len)),
  REPLACE: (x, a, b) => _str(x).split(_str(a)).join(_str(b)),
  CONTAINS: (x, sub) => _str(x).includes(_str(sub)),
  STARTSWITH: (x, sub) => _str(x).startsWith(_str(sub)),
  ENDSWITH: (x, sub) => _str(x).endsWith(_str(sub)),
  // ── 日期/时间 ──（统一返回 YYYY-MM-DD / 数值）
  TODAY: () => { const d = new Date(); return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}` },
  NOW:   () => { const d = new Date(); return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())} ${_pad2(d.getHours())}:${_pad2(d.getMinutes())}:${_pad2(d.getSeconds())}` },
  YEAR:  (x) => { const d = _toDate(x); return d ? d.getFullYear() : 0 },
  MONTH: (x) => { const d = _toDate(x); return d ? d.getMonth() + 1 : 0 },
  DAY:   (x) => { const d = _toDate(x); return d ? d.getDate() : 0 },
  HOUR:  (x) => { const d = _toDate(x); return d ? d.getHours() : 0 },
  MINUTE: (x) => { const d = _toDate(x); return d ? d.getMinutes() : 0 },
  DATEADD: (x, days) => { const d = _toDate(x); if (!d) return null; d.setDate(d.getDate() + _num(days)); return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}` },
  DATEDIFF: (a, b) => { const d1 = _toDate(a); const d2 = _toDate(b); if (!d1 || !d2) return 0; return Math.round((d1 - d2) / 86400000) },
}

// ─── 词法分析 ───────────────────────────────────────────────────────────────

const TT = { NUM: 'num', STR: 'str', IDENT: 'ident', OP: 'op', LP: '(', RP: ')', COMMA: ',', EOF: 'eof' }

function tokenize (src) {
  const s = String(src ?? '')
  const tokens = []
  let i = 0
  const isDigit = (c) => c >= '0' && c <= '9'
  const isIdentStart = (c) => /[A-Za-z_$一-龥]/.test(c)
  const isIdentPart  = (c) => /[A-Za-z0-9_$一-龥]/.test(c)

  while (i < s.length) {
    const c = s[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }

    if (isDigit(c) || (c === '.' && isDigit(s[i + 1]))) {
      let j = i + 1
      while (j < s.length && (isDigit(s[j]) || s[j] === '.')) j++
      tokens.push({ t: TT.NUM, v: parseFloat(s.slice(i, j)) })
      i = j; continue
    }

    if (c === '"' || c === "'") {
      const quote = c
      let j = i + 1; let str = ''
      while (j < s.length && s[j] !== quote) {
        if (s[j] === '\\' && j + 1 < s.length) { str += s[j + 1]; j += 2 } else { str += s[j]; j++ }
      }
      tokens.push({ t: TT.STR, v: str })
      i = j + 1; continue
    }

    if (isIdentStart(c)) {
      let j = i + 1
      while (j < s.length && isIdentPart(s[j])) j++
      // 支持点分标识符（如 维度.属性）：后跟 .标识符段时继续吞并
      while (s[j] === '.' && isIdentStart(s[j + 1] || '')) {
        j++ // 吃掉 '.'
        while (j < s.length && isIdentPart(s[j])) j++
      }
      tokens.push({ t: TT.IDENT, v: s.slice(i, j) })
      i = j; continue
    }

    // 双字符运算符
    const two = s.slice(i, i + 2)
    if (two === '>=' || two === '<=' || two === '==' || two === '!=' || two === '&&' || two === '||') {
      tokens.push({ t: TT.OP, v: two }); i += 2; continue
    }

    if (c === '(') { tokens.push({ t: TT.LP }); i++; continue }
    if (c === ')') { tokens.push({ t: TT.RP }); i++; continue }
    if (c === ',') { tokens.push({ t: TT.COMMA }); i++; continue }
    if ('+-*/<>!'.includes(c)) { tokens.push({ t: TT.OP, v: c }); i++; continue }

    throw new Error(`[formula] 非法字符 "${c}" @${i}`)
  }
  tokens.push({ t: TT.EOF })
  return tokens
}

// ─── 递归下降解析 → AST ──────────────────────────────────────────────────────

function parse (tokens) {
  let p = 0
  const peek = () => tokens[p]
  const next = () => tokens[p++]
  const eat = (cond, msg) => {
    const tok = tokens[p]
    if (!cond(tok)) throw new Error(`[formula] 解析失败：${msg}`)
    p++; return tok
  }
  const isOp = (v) => peek().t === TT.OP && peek().v === v

  function parseExpr () { return parseOr() }

  function parseOr () {
    let node = parseAnd()
    while (isOp('||')) { next(); node = { k: 'bin', op: '||', l: node, r: parseAnd() } }
    return node
  }
  function parseAnd () {
    let node = parseEq()
    while (isOp('&&')) { next(); node = { k: 'bin', op: '&&', l: node, r: parseEq() } }
    return node
  }
  function parseEq () {
    let node = parseRel()
    while (isOp('==') || isOp('!=')) { const op = next().v; node = { k: 'bin', op, l: node, r: parseRel() } }
    return node
  }
  function parseRel () {
    let node = parseAdd()
    while (isOp('<') || isOp('>') || isOp('<=') || isOp('>=')) { const op = next().v; node = { k: 'bin', op, l: node, r: parseAdd() } }
    return node
  }
  function parseAdd () {
    let node = parseMul()
    while (isOp('+') || isOp('-')) { const op = next().v; node = { k: 'bin', op, l: node, r: parseMul() } }
    return node
  }
  function parseMul () {
    let node = parseUnary()
    while (isOp('*') || isOp('/')) { const op = next().v; node = { k: 'bin', op, l: node, r: parseUnary() } }
    return node
  }
  function parseUnary () {
    if (isOp('-')) { next(); return { k: 'unary', op: '-', e: parseUnary() } }
    if (isOp('!')) { next(); return { k: 'unary', op: '!', e: parseUnary() } }
    return parsePrimary()
  }
  function parsePrimary () {
    const tok = peek()
    if (tok.t === TT.NUM) { next(); return { k: 'num', v: tok.v } }
    if (tok.t === TT.STR) { next(); return { k: 'str', v: tok.v } }
    if (tok.t === TT.LP)  { next(); const e = parseExpr(); eat((t) => t.t === TT.RP, '缺少 )'); return e }
    if (tok.t === TT.IDENT) {
      next()
      if (peek().t === TT.LP) {
        next()
        const args = []
        if (peek().t !== TT.RP) {
          args.push(parseExpr())
          while (peek().t === TT.COMMA) { next(); args.push(parseExpr()) }
        }
        eat((t) => t.t === TT.RP, '函数缺少 )')
        return { k: 'call', name: tok.v, args }
      }
      if (tok.v === 'true')  return { k: 'lit', v: true }
      if (tok.v === 'false') return { k: 'lit', v: false }
      if (tok.v === 'null')  return { k: 'lit', v: null }
      return { k: 'ref', name: tok.v }
    }
    throw new Error('[formula] 解析失败：意外结束或非法 token')
  }

  const ast = parseExpr()
  eat((t) => t.t === TT.EOF, '表达式有多余内容')
  return ast
}

// ─── 求值 ────────────────────────────────────────────────────────────────────

function evalNode (node, scope) {
  switch (node.k) {
    case 'num': return node.v
    case 'str': return node.v
    case 'lit': return node.v
    case 'ref': {
      const v = scope ? scope[node.name] : undefined
      return v == null || v === '' ? 0 : v   // 缺失字段按 0，便于数值计算与比较
    }
    case 'unary': {
      const e = evalNode(node.e, scope)
      return node.op === '-' ? -(Number(e) || 0) : !e
    }
    case 'call': {
      const fn = FUNCS[node.name]
      if (!fn) throw new Error(`[formula] 未知函数 ${node.name}`)
      return fn(...node.args.map((a) => evalNode(a, scope)))
    }
    case 'bin': {
      const l = evalNode(node.l, scope)
      // 短路逻辑
      if (node.op === '&&') return l ? evalNode(node.r, scope) : l
      if (node.op === '||') return l || evalNode(node.r, scope)
      const r = evalNode(node.r, scope)
      switch (node.op) {
        case '+':  return (typeof l === 'string' || typeof r === 'string') ? `${l}${r}` : (Number(l) || 0) + (Number(r) || 0)
        case '-':  return (Number(l) || 0) - (Number(r) || 0)
        case '*':  return (Number(l) || 0) * (Number(r) || 0)
        case '/':  { const d = Number(r) || 0; return d === 0 ? 0 : (Number(l) || 0) / d }
        case '>':  return (Number(l) || 0) >  (Number(r) || 0)
        case '<':  return (Number(l) || 0) <  (Number(r) || 0)
        case '>=': return (Number(l) || 0) >= (Number(r) || 0)
        case '<=': return (Number(l) || 0) <= (Number(r) || 0)
        case '==': return l === r
        case '!=': return l !== r
        default:   throw new Error(`[formula] 未知运算符 ${node.op}`)
      }
    }
    default: throw new Error('[formula] 未知节点')
  }
}

const _astCache = new Map()

/** 预编译表达式为求值函数；AST 缓存按表达式字符串复用。 */
export function compileFormula (expr) {
  const key = String(expr ?? '')
  let ast = _astCache.get(key)
  if (!ast) {
    ast = parse(tokenize(key))
    _astCache.set(key, ast)
  }
  return (scope) => evalNode(ast, scope || {})
}

/** 一步求值：解析 + 计算。表达式非法或求值出错时返回 fallback（默认 null）并 console.warn。 */
export function evalFormula (expr, scope, fallback = null) {
  if (expr == null || expr === '') return fallback
  try {
    return compileFormula(expr)(scope || {})
  } catch (e) {
    console.warn('[formula] eval failed:', e?.message || e, '«' + expr + '»')
    return fallback
  }
}
