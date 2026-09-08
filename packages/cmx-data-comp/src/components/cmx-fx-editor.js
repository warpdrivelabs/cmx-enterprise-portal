import { escHtml as esc } from '../lib/cmx-page-helpers.js'

/**
 * Excel 样式「函数 / 公式编辑器」通用浮层组件（<cmx-fx-editor>）。
 *
 * 纯 UI：内置函数目录（~150 个）在组件内定义；取数函数（QM/QC/…）、报表专属参数控件、
 * 初值回显、提交落地全部由**使用方注入**（configure）+ 事件（cmx-fx-commit / cmx-fx-cancel）传出。
 * 组件零 apiJson / 零 cellMap / 零报表域概念——底层不依赖上层，无耦合。
 *
 * @component
 *
 * 用法：
 *   const el = document.createElement('cmx-fx-editor')
 *   el.configure({
 *     fetchFunctions,   // 数组 | ()=>数组|Promise<数组>：取数函数目录（含 prototype.params）
 *     fetchTabLabel,    // 取数 tab 文案，默认「取数函数」
 *     paramControls,    // { [kind]: ({param,index,value,attr}) => htmlString }：注入 period/org/object/direction 等控件
 *     getInitialExpr,   // (target)=>string：打开时回显该格已有公式（去前导 =）
 *     formatArg,        // 可选覆盖 (param,value)=>string（引号规则）
 *     cellLabel,        // 「插入单元格」按钮上显示的当前格地址（供 setCurrentCell 更新）
 *   })
 *   el.setTarget('C5')          // 写入目标格（页脚「写入到 X」）
 *   el.setCurrentCell('C5')     // 「插入单元格」按钮插入的地址（选区跟随）
 *   document.body.appendChild(el)
 *   el.open(anchorEl)           // 打开（anchorEl 定位锚点，可空）
 *   el.addEventListener('cmx-fx-commit', e => { const { expr, target } = e.detail; ... })
 *
 * @fires cmx-fx-commit  - detail:{ expr, target } 用户点「写入单元格」时派发，expr 为原始 DSL 裸串（去前导 =）
 * @fires cmx-fx-cancel  - 关闭/取消（点关闭按钮或按 Esc）时派发
 * @fires cmx-fx-invalid - detail:{ reason } 公式校验失败时派发
 *
 * 关键配置（通过 configure() 注入，非标签属性）：
 *   fetchFunctions - 取数函数目录（数组 | ()=>数组|Promise<数组>）
 *   paramControls  - 取数参数控件工厂 { [kind]: ({param,index,value,attr}) => htmlString }
 *   getInitialExpr - (target)=>string，打开时回显该格已有公式（去前导 =）
 *   formatArg      - 可选 (param,value)=>string，覆盖引号规则
 *   cellLabel      - 「插入单元格」按钮上显示的当前格地址
 *
 * 命令式 API：configure(cfg) / setTarget(addr) / setCurrentCell(addr) / open(anchorEl) / close()
 */


// ── 内置函数目录（SpreadJS/Excel 常用全集 ~150）：[name, category, help, example] ──
// category: math数学 stat统计 logic逻辑 text文本 date日期 lookup查找 finance财务 info信息
const FX_BUILTIN_CATALOG = [
  // ── 数学 math ──
  ['SUM','math','求和（支持区间）','SUM(D3:D7)'],
  ['SUMIF','math','按条件求和','SUMIF(A2:A9,">100",B2:B9)'],
  ['SUMIFS','math','多条件求和','SUMIFS(C2:C9,A2:A9,"华东",B2:B9,">0")'],
  ['SUMPRODUCT','math','乘积之和','SUMPRODUCT(A2:A9,B2:B9)'],
  ['PRODUCT','math','连乘','PRODUCT(A2:A9)'],
  ['ABS','math','绝对值','ABS(C5)'],
  ['ROUND','math','四舍五入','ROUND(C5,2)'],
  ['ROUNDUP','math','向上舍入','ROUNDUP(C5,2)'],
  ['ROUNDDOWN','math','向下舍入','ROUNDDOWN(C5,2)'],
  ['INT','math','取整（向下）','INT(C5)'],
  ['TRUNC','math','截尾取整','TRUNC(C5,2)'],
  ['MOD','math','取余','MOD(C5,3)'],
  ['CEILING','math','按基数向上取整','CEILING(C5,10)'],
  ['FLOOR','math','按基数向下取整','FLOOR(C5,10)'],
  ['POWER','math','幂','POWER(C5,2)'],
  ['SQRT','math','平方根','SQRT(C5)'],
  ['EXP','math','e 的幂','EXP(C5)'],
  ['LN','math','自然对数','LN(C5)'],
  ['LOG','math','对数','LOG(C5,10)'],
  ['LOG10','math','常用对数','LOG10(C5)'],
  ['SIGN','math','符号(-1/0/1)','SIGN(C5)'],
  ['GCD','math','最大公约数','GCD(A2,B2)'],
  ['LCM','math','最小公倍数','LCM(A2,B2)'],
  ['RAND','math','0~1 随机数','RAND()'],
  ['RANDBETWEEN','math','区间随机整数','RANDBETWEEN(1,100)'],
  ['SUBTOTAL','math','分类汇总(可选函数号)','SUBTOTAL(9,C2:C9)'],
  ['ROMAN','math','罗马数字','ROMAN(2026)'],
  ['PI','math','圆周率','PI()'],
  ['QUOTIENT','math','商的整数部分','QUOTIENT(C5,3)'],
  ['MROUND','math','舍入到基数倍数','MROUND(C5,5)'],
  ['SIN','math','正弦','SIN(C5)'],
  ['COS','math','余弦','COS(C5)'],
  ['TAN','math','正切','TAN(C5)'],
  // ── 统计 stat ──
  ['AVERAGE','stat','平均值','AVERAGE(C2:C9)'],
  ['AVERAGEIF','stat','按条件平均','AVERAGEIF(A2:A9,">0",C2:C9)'],
  ['AVERAGEIFS','stat','多条件平均','AVERAGEIFS(C2:C9,A2:A9,"华东")'],
  ['COUNT','stat','计数(数字)','COUNT(C2:C9)'],
  ['COUNTA','stat','计数(非空)','COUNTA(A2:A9)'],
  ['COUNTBLANK','stat','空单元格计数','COUNTBLANK(A2:A9)'],
  ['COUNTIF','stat','按条件计数','COUNTIF(A2:A9,">100")'],
  ['COUNTIFS','stat','多条件计数','COUNTIFS(A2:A9,"华东",B2:B9,">0")'],
  ['MAX','stat','最大值','MAX(C5:C9)'],
  ['MIN','stat','最小值','MIN(C5:C9)'],
  ['MAXIFS','stat','按条件最大','MAXIFS(C2:C9,A2:A9,"华东")'],
  ['MINIFS','stat','按条件最小','MINIFS(C2:C9,A2:A9,"华东")'],
  ['MEDIAN','stat','中位数','MEDIAN(C2:C9)'],
  ['MODE','stat','众数','MODE(C2:C9)'],
  ['LARGE','stat','第 k 大','LARGE(C2:C9,2)'],
  ['SMALL','stat','第 k 小','SMALL(C2:C9,2)'],
  ['RANK','stat','排名','RANK(C5,C2:C9)'],
  ['STDEV','stat','样本标准差','STDEV(C2:C9)'],
  ['STDEVP','stat','总体标准差','STDEVP(C2:C9)'],
  ['VAR','stat','样本方差','VAR(C2:C9)'],
  ['VARP','stat','总体方差','VARP(C2:C9)'],
  ['PERCENTILE','stat','百分位数','PERCENTILE(C2:C9,0.9)'],
  ['QUARTILE','stat','四分位数','QUARTILE(C2:C9,1)'],
  ['FREQUENCY','stat','频数分布','FREQUENCY(A2:A9,B2:B5)'],
  // ── 逻辑 logic ──
  ['IF','logic','条件取值','IF(C5>0,C5,0)'],
  ['IFS','logic','多分支条件','IFS(C5>90,"A",C5>60,"B",TRUE,"C")'],
  ['IFERROR','logic','出错时取备用值','IFERROR(A1/B1,0)'],
  ['IFNA','logic','#N/A 时取备用值','IFNA(VLOOKUP(A1,D:E,2,0),"无")'],
  ['AND','logic','逻辑与','AND(C5>0,C5<100)'],
  ['OR','logic','逻辑或','OR(C5<0,C5>100)'],
  ['NOT','logic','逻辑非','NOT(C5>0)'],
  ['XOR','logic','逻辑异或','XOR(A1>0,B1>0)'],
  ['TRUE','logic','逻辑真','TRUE()'],
  ['FALSE','logic','逻辑假','FALSE()'],
  ['SWITCH','logic','按值分支','SWITCH(A1,1,"一",2,"二","其它")'],
  // ── 文本 text ──
  ['CONCATENATE','text','连接文本','CONCATENATE(A1," ",B1)'],
  ['CONCAT','text','连接(支持区间)','CONCAT(A1:A5)'],
  ['TEXTJOIN','text','带分隔符连接','TEXTJOIN("-",TRUE,A1:A5)'],
  ['LEFT','text','左取 n 字符','LEFT(A1,3)'],
  ['RIGHT','text','右取 n 字符','RIGHT(A1,3)'],
  ['MID','text','中间取字符','MID(A1,2,3)'],
  ['LEN','text','文本长度','LEN(A1)'],
  ['FIND','text','查找(区分大小写)','FIND("x",A1)'],
  ['SEARCH','text','查找(不区分大小写)','SEARCH("x",A1)'],
  ['REPLACE','text','按位置替换','REPLACE(A1,1,2,"XX")'],
  ['SUBSTITUTE','text','按内容替换','SUBSTITUTE(A1,"旧","新")'],
  ['UPPER','text','转大写','UPPER(A1)'],
  ['LOWER','text','转小写','LOWER(A1)'],
  ['PROPER','text','首字母大写','PROPER(A1)'],
  ['TRIM','text','去首尾空格','TRIM(A1)'],
  ['REPT','text','重复文本','REPT("*",5)'],
  ['TEXT','text','按格式转文本','TEXT(C5,"#,##0.00")'],
  ['VALUE','text','文本转数值','VALUE(A1)'],
  ['NUMBERVALUE','text','按区域转数值','NUMBERVALUE(A1)'],
  ['CHAR','text','数字转字符','CHAR(65)'],
  ['CODE','text','字符转编码','CODE(A1)'],
  ['EXACT','text','精确比较','EXACT(A1,B1)'],
  ['CLEAN','text','删除非打印字符','CLEAN(A1)'],
  // ── 日期 date ──
  ['TODAY','date','今天','TODAY()'],
  ['NOW','date','现在(日期时间)','NOW()'],
  ['DATE','date','构造日期','DATE(2026,7,1)'],
  ['TIME','date','构造时间','TIME(9,30,0)'],
  ['YEAR','date','取年','YEAR(A1)'],
  ['MONTH','date','取月','MONTH(A1)'],
  ['DAY','date','取日','DAY(A1)'],
  ['HOUR','date','取时','HOUR(A1)'],
  ['MINUTE','date','取分','MINUTE(A1)'],
  ['SECOND','date','取秒','SECOND(A1)'],
  ['WEEKDAY','date','星期几','WEEKDAY(A1,2)'],
  ['WEEKNUM','date','第几周','WEEKNUM(A1)'],
  ['EOMONTH','date','月末日期','EOMONTH(A1,0)'],
  ['EDATE','date','n 月后日期','EDATE(A1,3)'],
  ['DATEDIF','date','日期差','DATEDIF(A1,B1,"m")'],
  ['DAYS','date','天数差','DAYS(B1,A1)'],
  ['NETWORKDAYS','date','工作日天数','NETWORKDAYS(A1,B1)'],
  ['WORKDAY','date','n 工作日后','WORKDAY(A1,5)'],
  ['DATEVALUE','date','文本转日期','DATEVALUE("2026-07-01")'],
  // ── 查找 lookup ──
  ['VLOOKUP','lookup','垂直查找','VLOOKUP(A2,D:F,3,0)'],
  ['HLOOKUP','lookup','水平查找','HLOOKUP(A2,D1:J3,2,0)'],
  ['LOOKUP','lookup','向量查找','LOOKUP(A2,D2:D9,F2:F9)'],
  ['INDEX','lookup','按行列取值','INDEX(D2:F9,2,3)'],
  ['MATCH','lookup','匹配位置','MATCH(A2,D2:D9,0)'],
  ['XLOOKUP','lookup','增强查找','XLOOKUP(A2,D2:D9,F2:F9,"无")'],
  ['CHOOSE','lookup','按序号选值','CHOOSE(2,"甲","乙","丙")'],
  ['OFFSET','lookup','偏移引用','OFFSET(A1,2,3)'],
  ['INDIRECT','lookup','按文本引用','INDIRECT("D"&ROW())'],
  ['ROW','lookup','行号','ROW(A1)'],
  ['COLUMN','lookup','列号','COLUMN(A1)'],
  ['ROWS','lookup','区间行数','ROWS(A1:A9)'],
  ['COLUMNS','lookup','区间列数','COLUMNS(A1:F1)'],
  ['TRANSPOSE','lookup','转置','TRANSPOSE(A1:C3)'],
  ['HYPERLINK','lookup','超链接','HYPERLINK("http://x","链接")'],
  // ── 财务 finance ──
  ['PMT','finance','等额还款额','PMT(0.05/12,60,-100000)'],
  ['PV','finance','现值','PV(0.05/12,60,-2000)'],
  ['FV','finance','终值','FV(0.05/12,60,-2000)'],
  ['NPV','finance','净现值','NPV(0.1,C2:C9)'],
  ['IRR','finance','内部收益率','IRR(C2:C9)'],
  ['RATE','finance','利率','RATE(60,-2000,100000)'],
  ['NPER','finance','期数','NPER(0.05/12,-2000,100000)'],
  ['SLN','finance','直线折旧','SLN(100000,10000,5)'],
  ['DB','finance','固定余额递减折旧','DB(100000,10000,5,1)'],
  ['DDB','finance','双倍余额递减折旧','DDB(100000,10000,5,1)'],
  // ── 信息 info ──
  ['ISBLANK','info','是否为空','ISBLANK(A1)'],
  ['ISNUMBER','info','是否数字','ISNUMBER(A1)'],
  ['ISTEXT','info','是否文本','ISTEXT(A1)'],
  ['ISERROR','info','是否错误值','ISERROR(A1)'],
  ['ISNA','info','是否 #N/A','ISNA(A1)'],
  ['ISEVEN','info','是否偶数','ISEVEN(A1)'],
  ['ISODD','info','是否奇数','ISODD(A1)'],
  ['NA','info','返回 #N/A','NA()'],
  ['N','info','转数值','N(A1)'],
  ['T','info','转文本','T(A1)'],
]

/** 内置函数分类标签映射（英文 key → 中文显示）。 */
const FX_BUILTIN_CATS = { math: '数学', stat: '统计', logic: '逻辑', text: '文本', date: '日期', lookup: '查找', finance: '财务', info: '信息' }

/** 运算符 / 括号按钮定义：t=显示文案，ins=插入文本，inside=插入后光标定位到括号内。 */
const FX_OPS = [
  { t: '+', ins: '+' }, { t: '−', ins: '-' }, { t: '×', ins: '*' }, { t: '÷', ins: '/' },
  { t: '( )', ins: '()', inside: true }, { t: ',', ins: ',' },
  { t: '>', ins: '>' }, { t: '<', ins: '<' }, { t: '=', ins: '=' },
]

/** 聚合/连接类给变参入口。 */
const FX_AGG = ['SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'MAX', 'MIN', 'PRODUCT', 'CONCAT', 'CONCATENATE', 'AND', 'OR', 'GCD', 'LCM', 'MEDIAN', 'MODE', 'STDEV', 'STDEVP', 'VAR', 'VARP']

/** 把内置函数名归一为带 prototype 的 fn（由样例括号内推断参数，聚合类加变参）。 */
function builtinCatalogFn (name) {
  const row = FX_BUILTIN_CATALOG.find((r) => r[0] === name)
  const help = (row && row[2]) || ''
  const example = (row && row[3]) || `${name}()`
  const category = (row && row[1]) || 'math'
  const m = /\(([^)]*)\)/.exec(example)
  const argStr = m ? m[1].trim() : ''
  const rawArgs = argStr ? argStr.split(',').map((s) => s.trim()) : []
  const params = rawArgs.map((a, i) => ({ name: a || `参数${i + 1}`, kind: 'expr', required: i === 0, hint: '' }))
  const variadic = FX_AGG.includes(name) ? { name: '更多', kind: 'expr', required: false, hint: '可继续追加' } : null
  return { name, category, help, example, prototype: { params, variadic } }
}

/** 展开逐参列表（含变参尾项）。 */
function wizardParamList (fn) {
  const params = (fn.prototype && fn.prototype.params) ? fn.prototype.params.slice() : []
  const v = fn.prototype && fn.prototype.variadic
  if (v) params.push({ ...v, name: (v.name || '值') + '…', variadic: true })
  return params
}

/** 默认单参格式化：对象/科目码/文本加单引号，期间/组织/数值/单元格/表达式裸写。 */
function defaultFormatArg (p, v) {
  const s = String(v)
  if (p.kind === 'object' || p.kind === 'report' || p.kind === 'version' || p.kind === 'text' || p.kind === 'direction') {
    return `'${s.replace(/'/g, '')}'`
  }
  return s
}

/** 逐参拼函数串（跳过空缺的可选参、去尾部空缺）。formatArg 可注入覆盖引号规则。 */
function buildFormula (fn, args, formatArg) {
  const fa = formatArg || defaultFormatArg
  const params = wizardParamList(fn)
  const parts = []
  for (let i = 0; i < params.length; i++) {
    const p = params[i]
    let v = args[i]
    if (v == null || v === '') { if (p.required && p.kind !== 'expr') v = p.default || ''; else continue }
    if (v == null || v === '') continue
    parts.push(fa(p, v))
  }
  while (parts.length && (parts[parts.length - 1] === '' || parts[parts.length - 1] == null)) parts.pop()
  return `${fn.name}(${parts.join(',')})`
}

// ── shadow DOM 样式（前缀 fxe-，走 SAP 主题变量，shadow 内自动 light/dark） ──
const FX_STYLE = `
:host{position:fixed;inset:0;z-index:1000;pointer-events:none;
  --fxe-blue:#0a6ed1;--fxe-cyan:#00a6c8;--fxe-green:#10a760;--fxe-purple:var(--neo-violet, #7c3aed);--fxe-amber:#d98200;--fxe-red:#c9372c;
  --fxe-border:var(--sapGroup_TitleBorderColor,#d9e2ec)}
:host([hidden]){display:none}
.fxe-panel{pointer-events:auto;position:fixed;z-index:1000;width:min(720px,94vw);height:min(446px,86vh);display:flex;flex-direction:column;background:var(--sapTile_Background,#fff);color:var(--sapTextColor,#1d2d3e);border:1px solid color-mix(in srgb,var(--fxe-blue) 30%,var(--fxe-border));border-radius:12px;box-shadow:0 26px 70px rgba(0,0,0,.5),0 3px 12px rgba(0,0,0,.34);overflow:hidden}
.fxe-head{display:flex;align-items:center;justify-content:space-between;padding:5px 10px;cursor:move;background:linear-gradient(135deg,var(--fxe-blue),#0a4f9c);color: #fff;user-select:none;flex:0 0 auto}
.fxe-head b{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color: #fff}
.fxe-badge{display:inline-flex;align-items:center;justify-content:center;width:22px;height:18px;border-radius:5px;background:rgba(255,255,255,.22);font:italic 800 12px/1 "Times New Roman",Georgia,serif}
.fxe-x{width:22px;height:22px;border:0;border-radius:6px;background:rgba(255,255,255,.16);color:var(--sapGroup_ContentBorderColor, #ffffff);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.fxe-x:hover{background:rgba(255,255,255,.32)}
.fxe-editrow{flex:0 0 auto;display:flex;align-items:stretch;margin:11px 14px 8px;border:1.5px solid color-mix(in srgb,var(--fxe-green) 45%,var(--fxe-border));border-radius:9px;overflow:hidden}
.fxe-eq{display:flex;align-items:center;justify-content:center;width:30px;flex:0 0 auto;background:color-mix(in srgb,var(--fxe-green) 22%,var(--sapField_Background,#fff));color:var(--fxe-green);font:800 16px/1 ui-monospace,Menlo,Consolas,monospace;border-right:1px solid color-mix(in srgb,var(--fxe-green) 34%,var(--fxe-border))}
.fxe-expr{flex:1;min-height:44px;max-height:96px;resize:vertical;border:0;outline:0;padding:8px 11px;font:600 13.5px/1.5 ui-monospace,Menlo,Consolas,monospace;color:var(--sapTextColor,#1d2d3e);background:color-mix(in srgb,var(--fxe-green) 10%,var(--sapField_Background,#fff))}
.fxe-expr::placeholder{color:var(--sapContent_LabelColor,#9aa4b0);font-weight:400;font-style:italic}
.fxe-pal{flex:1;min-height:0;overflow:hidden;padding:6px 12px 8px;display:flex;flex-direction:column;gap:6px}
.fxe-oprow{flex:0 0 auto;display:flex;flex-wrap:nowrap;align-items:center;gap:5px;padding:6px 8px;border:1px solid var(--fxe-border);border-left:4px solid var(--fxe-amber);border-radius:9px;background:color-mix(in srgb,var(--fxe-amber) 12%,var(--sapTile_Background,#fff))}
.fxe-tabs{flex:0 0 auto;display:flex;align-items:center;gap:6px}
.fxe-tab{height:28px;padding:0 12px;border:1px solid var(--fxe-border);border-radius:8px;background:var(--sapField_Background,#fff);color:var(--sapContent_LabelColor,#6a6d70);font:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:background .1s,color .1s,border-color .1s}
.fxe-tab.on.fxe-tab-fetch{color: #fff;background:var(--fxe-purple);border-color:var(--fxe-purple)}
.fxe-tab.on.fxe-tab-builtin{color: #fff;background:var(--fxe-cyan);border-color:var(--fxe-cyan)}
.fxe-tab:not(.on):hover{color:var(--fxe-blue);border-color:color-mix(in srgb,var(--fxe-blue) 40%,var(--fxe-border))}
.fxe-list{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;border:1px solid var(--fxe-border);border-radius:9px;padding:5px 6px}
.fxe-list-fetch{border-left:4px solid var(--fxe-purple);background:color-mix(in srgb,var(--fxe-purple) 8%,var(--sapTile_Background,#fff))}
.fxe-list-builtin{border-left:4px solid var(--fxe-cyan);background:color-mix(in srgb,var(--fxe-cyan) 8%,var(--sapTile_Background,#fff))}
.fxe-search{flex:0 0 auto;margin-left:auto;width:210px;display:flex;align-items:center;gap:6px;height:28px;padding:0 9px;border:1px solid var(--fxe-border);border-radius:8px;background:var(--sapField_Background,#fff)}
.fxe-search ui5-icon{width:.9rem;height:.9rem;color:var(--sapContent_LabelColor,#8a8d90)}
.fxe-search input{flex:1;border:0;outline:0;background:transparent;font:13px var(--sapFontFamily,Arial);color:var(--sapTextColor,#1d2d3e)}
.fxe-op{min-width:32px;height:30px;padding:0 9px;border:1px solid color-mix(in srgb,var(--fxe-amber) 40%,var(--fxe-border));border-radius:7px;background:var(--sapField_Background,#fff);color:var(--fxe-amber);font:700 14px/1 ui-monospace,Menlo,Consolas,monospace;cursor:pointer;transition:transform .1s,box-shadow .1s,background .1s}
.fxe-op:hover{background:color-mix(in srgb,var(--fxe-amber) 22%,var(--sapField_Background,#fff));transform:translateY(-1px);box-shadow:0 2px 7px color-mix(in srgb,var(--fxe-amber) 40%,transparent)}
.fxe-op-cell{font-family:var(--sapFontFamily,Arial);font-size:11px;font-weight:600;min-width:auto;margin-left:auto}
.fxe-fns{display:flex;flex-direction:column;gap:2px}.fxe-fns-scroll{overflow:auto;flex:1 1 auto;min-height:0}
.fxe-fn{display:flex;flex-direction:row;align-items:baseline;gap:8px;text-align:left;padding:3px 8px;min-height:24px;border:1px solid transparent;border-radius:6px;background:transparent;cursor:pointer;transition:background .1s,border-color .1s;width:100%}
.fxe-fn:hover{background:color-mix(in srgb,var(--fxe-blue) 8%,var(--sapField_Background,#fff))}
.fxe-fnname{flex:0 0 auto;min-width:74px;font:800 12px/1.4 ui-monospace,Menlo,Consolas,monospace}
.fxe-fnhelp{flex:1 1 auto;min-width:40px;font-size:11px;color:var(--sapContent_LabelColor,#6a6d70);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fxe-fneg{flex:0 1 auto;margin-left:auto;font:10px/1.4 ui-monospace,Menlo,Consolas,monospace;color:color-mix(in srgb,var(--sapContent_LabelColor,#6a6d70) 70%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%;min-width:0}
.fxe-fn-builtin .fxe-fnname{color:var(--fxe-cyan)}.fxe-fn-builtin:hover{border-color:var(--fxe-cyan);box-shadow:0 2px 8px color-mix(in srgb,var(--fxe-cyan) 30%,transparent)}
.fxe-fn-fetch .fxe-fnname{color:var(--fxe-purple)}.fxe-fn-fetch:hover{border-color:var(--fxe-purple);box-shadow:0 2px 8px color-mix(in srgb,var(--fxe-purple) 30%,transparent)}
.fxe-sub{flex:1;min-height:0;overflow:auto;padding:4px 14px 12px;display:flex;flex-direction:column;gap:9px}
.fxe-subhead{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:9px;background:color-mix(in srgb,var(--fxe-purple) 16%,var(--sapTile_Background,#fff));border:1px solid color-mix(in srgb,var(--fxe-purple) 32%,var(--fxe-border))}
.fxe-subback{width:26px;height:26px;border:0;border-radius:6px;background:color-mix(in srgb,var(--fxe-purple) 22%,transparent);color:var(--fxe-purple);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.fxe-subback:hover{background:color-mix(in srgb,var(--fxe-purple) 38%,transparent)}
.fxe-subttl{font-size:12.5px;color:var(--sapTextColor,#1d2d3e)}.fxe-subttl b{color:var(--fxe-purple);font-family:ui-monospace,Menlo,Consolas,monospace}.fxe-subeg{margin-left:6px;font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;color:color-mix(in srgb,var(--sapContent_LabelColor,#6a6d70) 80%,transparent);font-style:normal}
.fxe-subgrid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}
.fxe-prow{display:grid;grid-template-columns:92px minmax(0,1fr);gap:9px;align-items:start;padding:6px 0;border-bottom:1px dashed color-mix(in srgb,var(--fxe-border) 70%,transparent)}
.fxe-plabel{font-size:12px;color:var(--sapTextColor,#1d2d3e);padding-top:7px;font-weight:600}.fxe-plabel .req{color:var(--fxe-red);margin-left:2px}
.fxe-pctl{display:flex;flex-direction:column;gap:4px;min-width:0}
.fxe-pctl select,.fxe-pctl input{height:30px;border:1px solid var(--fxe-border);border-radius:6px;background:var(--sapField_Background,#fff);color:var(--sapTextColor,#1d2d3e);padding:0 9px;font:13px var(--sapFontFamily,Arial);min-width:0}
.fxe-pctl select:focus,.fxe-pctl input:focus{border-color:var(--fxe-purple);outline:0;box-shadow:0 0 0 2px color-mix(in srgb,var(--fxe-purple) 22%,transparent)}
.fxe-abs{margin-top:4px}
.fxe-phint{font-size:11px;color:var(--sapContent_LabelColor,#8a8d90)}
.fxe-subout{grid-column:1/-1;display:flex;align-items:center;gap:10px;margin-top:2px}
.fxe-subout label{font-size:11px;color:var(--sapContent_LabelColor,#6a6d70);flex:0 0 auto}
.fxe-subout code{flex:1;font:700 12.5px/1.4 ui-monospace,Menlo,Consolas,monospace;color:var(--fxe-purple);background:color-mix(in srgb,var(--fxe-purple) 14%,var(--sapTile_Background,#fff));border:1px solid color-mix(in srgb,var(--fxe-purple) 30%,var(--fxe-border));border-radius:7px;padding:6px 9px;word-break:break-all}
.fxe-foot{flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 10px;border-top:1px solid var(--fxe-border);background:var(--sapList_HeaderBackground,#f7f9fc)}
.fxe-tgt{font-size:11.5px;color:var(--sapContent_LabelColor,#6a6d70)}.fxe-tgt b{color:var(--fxe-blue);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px}
.fxe-btns{display:flex;gap:8px}
.fxe-sbtn{height:24px;border:1px solid var(--fxe-border);border-radius:6px;background:var(--sapButton_Background,#fff);color:var(--fxe-blue);font:inherit;font-size:11.5px;font-weight:600;display:inline-flex;align-items:center;gap:5px;padding:0 9px;cursor:pointer}.fxe-sbtn:hover{background:color-mix(in srgb,var(--fxe-blue) 8%,#fff);border-color:color-mix(in srgb,var(--fxe-blue) 40%,var(--fxe-border))}.fxe-sbtn.primary{background:var(--fxe-blue);border-color:var(--fxe-blue);color: #fff}.fxe-sbtn.primary:hover{background:#0a63bd}.fxe-sbtn ui5-icon{width:.95rem;height:.95rem}
.fxe-sub .fxe-sbtn{height:28px;font-size:12px;padding:0 10px}
.fxe-empty{padding:14px;text-align:center;color:var(--sapContent_LabelColor,#8a8d90);font-size:12px;grid-column:1/-1}
`

export class CmxFxEditor extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    /** @type {object} 注入的配置对象（fetchFunctions / paramControls / getInitialExpr / formatArg / cellLabel 等） */
    this._cfg = {}
    /** @type {Array<object>} 注入的取数函数目录（open 时异步解析后填充） */
    this._fetchFns = []
    /** @type {object|null} 面板运行时状态 { expr, target, search, tab, sub, pos, caret, edited, anchorRect } */
    this._state = null
    /** @type {string} 「插入单元格」按钮插入的地址（当前选中格） */
    this._currentCell = 'A1'
  }

  /** 元素插入 DOM 时：注入样式（仅首次），初始隐藏。 */
  connectedCallback () {
    if (!this._styleReady) {
      this._styleReady = true
      const style = document.createElement('style')
      style.textContent = FX_STYLE
      this.shadowRoot.appendChild(style)
    }
    this.hidden = true
  }

  /** 元素移出 DOM 时：清理拖拽监听器。 */
  disconnectedCallback () {
    this._teardownDoc()
  }

  /**
   * 注入配置（可多次调用增量合并）。返回 this 便于链式。
   * @param {object} [cfg] - 配置对象（fetchFunctions / paramControls / getInitialExpr / formatArg / cellLabel / fetchTabLabel / initialTarget）
   * @returns {CmxFxEditor} this（便于链式调用）
   */
  configure (cfg) {
    Object.assign(this._cfg, cfg || {})
    if (cfg && cfg.cellLabel != null) this._currentCell = String(cfg.cellLabel)
    return this
  }

  /**
   * 设写入目标格（页脚「写入到 X」）。选区变化时调用；面板已开则原地更新不重渲。
   * @param {string} addr - 目标单元格地址
   * @returns {CmxFxEditor} this
   */
  setTarget (addr) {
    const a = String(addr || '').trim()
    if (!a) return this
    if (this._state) {
      this._state.target = a
      if (!this._state.edited) {
        const init = this._readInitial(a)
        this._state.expr = init
        const ta = this.shadowRoot.querySelector('[data-fxe-expr]')
        const focused = this.shadowRoot.activeElement === ta
        if (ta && !focused) ta.value = init
      }
      const tgt = this.shadowRoot.querySelector('[data-fxe-tgt]')
      if (tgt) tgt.textContent = a
    }
    return this
  }

  /**
   * 设「插入单元格」按钮插入的地址（当前选中格）。
   * @param {string} addr - 当前单元格地址
   * @returns {CmxFxEditor} this
   */
  setCurrentCell (addr) {
    this._currentCell = String(addr || 'A1')
    const btn = this.shadowRoot.querySelector('[data-fxe-cell]')
    if (btn) btn.textContent = `插入单元格 ${this._currentCell}`
    return this
  }

  /**
   * 打开浮层。anchorEl：定位锚点（fx 按钮），可空。
   * 异步解析注入的取数函数目录，就绪后重渲染。
   * @param {HTMLElement} [anchorEl] - 定位锚点元素（用于浮层定位）
   * @returns {Promise<CmxFxEditor>} this
   */
  async open (anchorEl) {
    let anchorRect = null
    try { if (anchorEl && anchorEl.getBoundingClientRect) { const r = anchorEl.getBoundingClientRect(); anchorRect = { left: r.left, bottom: r.bottom, top: r.top } } } catch (_) {}
    const target = this._cfg.initialTarget || this._currentCell || 'A1'
    this._state = { expr: this._readInitial(target), target, search: '', tab: 'fetch', sub: null, pos: null, caret: null, edited: false, anchorRect }
    this.hidden = false
    this._render()
    // 异步解析注入的取数函数目录，就绪后重渲染
    try {
      const src = this._cfg.fetchFunctions
      const list = typeof src === 'function' ? await src() : src
      this._fetchFns = Array.isArray(list) ? list : []
    } catch (_) { this._fetchFns = [] }
    if (this._state) this._render()
    return this
  }

  /**
   * 关闭浮层（不派发事件）。
   * @returns {CmxFxEditor} this
   */
  close () {
    this._state = null
    this.hidden = true
    this._teardownDoc()
    this.shadowRoot.querySelector('.fxe-panel')?.remove()
    return this
  }

  /**
   * 内部：读初值（注入 getInitialExpr），去掉前导 = 号。
   * @param {string} target - 目标格地址
   * @returns {string} 初始表达式（无前导 =）
   */
  _readInitial (target) {
    try {
      const g = this._cfg.getInitialExpr
      if (typeof g === 'function') return String(g(target) || '').replace(/^=+/, '')
    } catch (_) {}
    return ''
  }

  /**
   * 派发 cmx-fx-* CustomEvent（bubbles + composed，可穿透 shadow DOM）。
   * @param {string} name  - 事件名
   * @param {*} [detail]   - 事件 detail
   */
  _emit (name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }))
  }

  /** 重新渲染整个面板（生成 HTML → 定位 → 绑定事件）。无 _state 时直接返回。 */
  _render () {
    const st = this._state
    if (!st) return
    let panel = this.shadowRoot.querySelector('.fxe-panel')
    if (!panel) { panel = document.createElement('div'); panel.className = 'fxe-panel'; panel.setAttribute('role', 'dialog'); this.shadowRoot.appendChild(panel) }
    panel.innerHTML = this._panelHtml()
    this._place(panel)
    this._bind()
  }

  /** 生成面板完整 HTML：标题栏 + 公式编辑区 + （调色板或逐参表单）+ 页脚操作栏。 */
  _panelHtml () {
    const st = this._state
    const head = `<div class="fxe-head" data-fxe-drag>
        <b><span class="fxe-badge">fx</span> 函数 / 公式编辑器</b>
        <button class="fxe-x" type="button" data-fxe-close aria-label="关闭"><ui5-icon name="decline"></ui5-icon></button>
      </div>`
    const editor = `<div class="fxe-editrow">
        <span class="fxe-eq">=</span>
        <textarea class="fxe-expr" data-fxe-expr spellcheck="false" placeholder="点下方函数/运算符插入，或直接键入表达式，如 FS(0,@current,'1001')+SUM(D3:D7)">${esc(st.expr || '')}</textarea>
      </div>`
    const body = st.sub ? this._subHtml(st.sub) : this._paletteHtml()
    return `${head}${editor}${body}
      <div class="fxe-foot">
        <span class="fxe-tgt">写入到 <b data-fxe-tgt>${esc(st.target || '')}</b></span>
        <div class="fxe-btns">
          <button class="fxe-sbtn" type="button" data-fxe-close><ui5-icon name="decline"></ui5-icon>取消</button>
          <button class="fxe-sbtn primary" type="button" data-fxe-insert><ui5-icon name="accept"></ui5-icon>写入单元格</button>
        </div>
      </div>`
  }

  /** 生成调色板区 HTML：运算符按钮行 + 取数/内置函数 Tab 切换 + 搜索框 + 函数列表。 */
  _paletteHtml () {
    const st = this._state
    const q = String(st.search || '').trim().toLowerCase()
    const opBtns = FX_OPS.map((o) => `<button class="fxe-op" type="button" data-fxe-op="${esc(o.ins)}" data-fxe-inside="${o.inside ? '1' : ''}" title="${esc(o.t)}">${esc(o.t)}</button>`).join('')
    const cellBtn = `<button class="fxe-op fxe-op-cell" type="button" data-fxe-cell title="插入当前选中单元格地址">插入单元格 ${esc(this._currentCell || 'A1')}</button>`
    const fnRow = (kind, name, help, example) => `<button class="fxe-fn fxe-fn-${kind}" type="button" data-fxe-${kind}="${esc(name)}" title="${esc(name + (help ? ' — ' + help : '') + (example ? '　例：' + example : ''))}">
        <span class="fxe-fnname">${esc(name)}</span><span class="fxe-fnhelp">${esc(help || '')}</span><span class="fxe-fneg">${esc(example || '')}</span></button>`
    const tab = st.tab === 'builtin' ? 'builtin' : 'fetch'
    let rows
    if (tab === 'builtin') {
      rows = FX_BUILTIN_CATALOG
        .filter(([name, cat, help, eg]) => !q || name.toLowerCase().includes(q) || String(help).toLowerCase().includes(q) || String(eg).toLowerCase().includes(q) || String(FX_BUILTIN_CATS[cat] || '').includes(q))
        .map(([name, cat, help, eg]) => fnRow('builtin', name, help, eg)).join('') || '<div class="fxe-empty">无匹配</div>'
    } else {
      rows = (this._fetchFns || [])
        .filter((m) => m && m.name && (!q || m.name.toLowerCase().includes(q) || String(m.help || '').toLowerCase().includes(q) || String(m.example || '').toLowerCase().includes(q)))
        .map((m) => fnRow('fetch', m.name, m.help, m.example)).join('') || '<div class="fxe-empty">无匹配（尚未注入取数函数）</div>'
    }
    const fetchLabel = esc(this._cfg.fetchTabLabel || '取数函数')
    const ph = tab === 'builtin' ? '搜索内置函数…' : `搜索${fetchLabel}…`
    return `<div class="fxe-pal">
        <div class="fxe-oprow">${opBtns}${cellBtn}</div>
        <div class="fxe-tabs">
          <button class="fxe-tab fxe-tab-fetch ${tab === 'fetch' ? 'on' : ''}" type="button" data-fxe-tab="fetch">${fetchLabel}</button>
          <button class="fxe-tab fxe-tab-builtin ${tab === 'builtin' ? 'on' : ''}" type="button" data-fxe-tab="builtin">内置函数</button>
          <div class="fxe-search"><ui5-icon name="search"></ui5-icon><input data-fxe-search placeholder="${ph}" value="${esc(st.search || '')}"></div>
        </div>
        <div class="fxe-list fxe-list-${tab}">
          <div class="fxe-fns fxe-fns-scroll">${rows}</div>
        </div>
      </div>`
  }

  /** 生成逐参表单区 HTML：函数标题栏 + 参数控件网格 + 实时预览函数串 + 插入按钮。 */
  _subHtml (sub) {
    const fn = sub.fn
    const params = wizardParamList(fn)
    const rows = params.map((p, i) => {
      const val = sub.args[i] != null ? sub.args[i] : (p.default || '')
      return `<div class="fxe-prow">
        <div class="fxe-plabel">${esc(p.name)}${p.required ? '<span class="req">*</span>' : ''}</div>
        <div class="fxe-pctl">${this._control(p, i, val)}<div class="fxe-phint">${esc(p.hint || '')}</div></div>
      </div>`
    }).join('') || '<div class="fxe-phint">该函数无固定参数</div>'
    const built = buildFormula(fn, sub.args, this._cfg.formatArg)
    return `<div class="fxe-sub">
        <div class="fxe-subhead"><button class="fxe-subback" type="button" data-fxe-subback><ui5-icon name="nav-back"></ui5-icon></button>
          <span class="fxe-subttl"><b>${esc(fn.name)}</b> · ${esc(fn.help || '')}${fn.example ? `<em class="fxe-subeg">例：${esc(fn.example)}</em>` : ''}</span></div>
        <div class="fxe-subgrid">${rows}</div>
        <div class="fxe-subout"><label>函数</label><code data-fxe-subout>${esc(built || fn.name + '()')}</code>
          <button class="fxe-sbtn primary" type="button" data-fxe-subinsert><ui5-icon name="add"></ui5-icon>插入到表达式</button></div>
      </div>`
  }

  /**
   * 参数控件：先查注入的 paramControls[kind]，未命中 → 内置文本框兜底。
   * @param {object} p       - 参数定义 { name, kind, required, hint, default }
   * @param {number} i       - 参数序号
   * @param {string} val     - 当前值
   * @returns {string} 控件 HTML 字符串
   */
  _control (p, i, val) {
    const A = `data-fxe-arg="${i}"`
    const injected = this._cfg.paramControls && this._cfg.paramControls[p.kind]
    if (typeof injected === 'function') {
      try {
        const out = injected({ param: p, index: i, value: val, attr: A, esc })
        if (out != null) return String(out)
      } catch (_) {}
    }
    return `<input ${A} placeholder="${esc(p.hint || '')}" value="${esc(val)}">`
  }

  /**
   * 浮层定位：优先用已记录的 pos（拖拽后保持位置）；否则按锚点元素或默认位置计算，
   * 并做边界裁剪防止溢出视口。
   * @param {HTMLElement} panel - 面板 DOM 元素
   */
  _place (panel) {
    const st = this._state
    if (st.pos) { panel.style.left = st.pos.left + 'px'; panel.style.top = st.pos.top + 'px'; return }
    panel.style.visibility = 'hidden'
    const pr = panel.getBoundingClientRect()
    const pw = pr.width || 460
    const ph = pr.height || 460
    let left, top
    const a = st.anchorRect
    if (a) {
      left = Math.min(Math.max(8, a.left), window.innerWidth - pw - 8)
      top = a.bottom + 6
      if (top + ph > window.innerHeight - 8) top = Math.max(8, a.top - ph - 6)
    } else {
      left = Math.max(12, window.innerWidth - pw - 40)
      top = 130
    }
    panel.style.left = left + 'px'
    panel.style.top = top + 'px'
    panel.style.visibility = ''
    st.pos = { left, top }
  }

  /**
   * 在公式 textarea 的光标位置插入文本。
   * @param {string} text       - 要插入的文本
   * @param {boolean} [inside]  - 为 true 时把光标定位到首个 '(' 之后（方便继续输入参数）
   */
  _insertAtCursor (text, inside) {
    const st = this._state
    const ta = this.shadowRoot.querySelector('[data-fxe-expr]')
    const cur = String(st.expr || '')
    if (!ta) { st.expr = cur + text; this._render(); return }
    const focused = this.shadowRoot.activeElement === ta
    let s, e
    if (focused && ta.selectionStart != null) { s = ta.selectionStart; e = ta.selectionEnd }
    else if (typeof st.caret === 'number') { s = e = Math.min(st.caret, cur.length) }
    else { s = e = cur.length }
    const next = cur.slice(0, s) + text + cur.slice(e)
    st.expr = next
    st.edited = true
    ta.value = next
    let caret = s + text.length
    if (inside) { const open = text.indexOf('('); if (open >= 0) caret = s + open + 1 }
    st.caret = caret
    ta.focus()
    try { ta.setSelectionRange(caret, caret) } catch {}
  }

  /** 逐参表单中参数值变化时，实时重算并更新底部函数预览串（不整体重渲）。 */
  _refreshSubOut () {
    const st = this._state
    if (!st || !st.sub) return
    const out = this.shadowRoot.querySelector('[data-fxe-subout]')
    if (out) { const f = buildFormula(st.sub.fn, st.sub.args, this._cfg.formatArg); out.textContent = f || (st.sub.fn.name + '()') }
  }

  /** 事件绑定（每次 _render 后重绑）：关闭、Esc、拖拽、textarea 输入、运算符、函数选择、提交等。 */
  _bind () {
    const root = this.shadowRoot
    const st = this._state
    const panel = root.querySelector('.fxe-panel')
    if (!panel || !st) return
    root.querySelectorAll('[data-fxe-close]').forEach((b) => b.addEventListener('click', () => { this._emit('cmx-fx-cancel', {}); this.close() }))
    panel.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); this._emit('cmx-fx-cancel', {}); this.close() } })

    // 拖动
    const handle = root.querySelector('[data-fxe-drag]')
    if (handle) {
      handle.addEventListener('mousedown', (ev) => {
        if (ev.target.closest('[data-fxe-close]')) return
        ev.preventDefault()
        const pr = panel.getBoundingClientRect()
        const ox = ev.clientX - pr.left; const oy = ev.clientY - pr.top
        document.body.style.userSelect = 'none'
        const move = (e) => {
          let left = e.clientX - ox; let top = e.clientY - oy
          left = Math.max(4, Math.min(left, window.innerWidth - 80))
          top = Math.max(4, Math.min(top, window.innerHeight - 40))
          panel.style.left = left + 'px'; panel.style.top = top + 'px'
          st.pos = { left, top }
        }
        const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.userSelect = '' }
        this._docMove = move; this._docUp = up
        document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
      })
    }

    // 公式 textarea
    const ta = root.querySelector('[data-fxe-expr]')
    ta?.addEventListener('input', () => { st.expr = ta.value; st.caret = ta.selectionStart; st.edited = true })
    ta?.addEventListener('keyup', () => { st.caret = ta.selectionStart })
    ta?.addEventListener('click', () => { st.caret = ta.selectionStart })
    ta?.addEventListener('blur', () => { if (ta.selectionStart != null) st.caret = ta.selectionStart })

    // 写入单元格
    root.querySelector('[data-fxe-insert]')?.addEventListener('click', () => this._commit())

    if (st.sub) {
      root.querySelector('[data-fxe-subback]')?.addEventListener('click', () => { st.sub = null; this._render() })
      root.querySelector('[data-fxe-subinsert]')?.addEventListener('click', () => {
        const built = buildFormula(st.sub.fn, st.sub.args, this._cfg.formatArg)
        st.sub = null
        this._render()
        this._insertAtCursor(built)
      })
      root.querySelectorAll('[data-fxe-arg]').forEach((el) => el.addEventListener('input', () => {
        const i = Number(el.getAttribute('data-fxe-arg'))
        let v = el.value
        if (v === '__abs' || v === '__code') { const sib = el.parentElement.querySelector('.fxe-abs'); v = sib ? sib.value : '' } else if (el.classList.contains('fxe-abs')) {
          const sel = el.parentElement.querySelector('[data-fxe-arg]')
          if (sel && (sel.value === '__abs' || sel.value === '__code')) { st.sub.args[i] = v; this._refreshSubOut(); return }
        }
        st.sub.args[i] = v
        this._refreshSubOut()
      }))
      return
    }

    // 调色板：tab 切换
    root.querySelectorAll('[data-fxe-tab]').forEach((b) => b.addEventListener('click', () => {
      st.tab = b.getAttribute('data-fxe-tab') === 'builtin' ? 'builtin' : 'fetch'
      st.search = ''
      this._render()
    }))
    // 搜索
    const search = root.querySelector('[data-fxe-search]')
    if (search) {
      search.addEventListener('input', () => {
        st.search = search.value
        this._render()
        requestAnimationFrame(() => { const nx = this.shadowRoot.querySelector('[data-fxe-search]'); if (nx) { nx.focus(); const n = nx.value.length; try { nx.setSelectionRange(n, n) } catch {} } })
      })
    }
    // 运算符
    root.querySelectorAll('[data-fxe-op]').forEach((b) => b.addEventListener('click', () => {
      this._insertAtCursor(b.getAttribute('data-fxe-op') || '', b.getAttribute('data-fxe-inside') === '1')
    }))
    // 插入单元格
    root.querySelector('[data-fxe-cell]')?.addEventListener('click', () => this._insertAtCursor(this._currentCell || 'A1'))
    // 内置函数 → 逐参
    root.querySelectorAll('[data-fxe-builtin]').forEach((b) => b.addEventListener('click', () => {
      const fn = builtinCatalogFn(b.getAttribute('data-fxe-builtin'))
      st.sub = { fn, args: wizardParamList(fn).map((p) => p.default || '') }
      this._render()
    }))
    // 取数函数 → 逐参（用注入 prototype）
    root.querySelectorAll('[data-fxe-fetch]').forEach((b) => b.addEventListener('click', () => {
      const name = b.getAttribute('data-fxe-fetch')
      const fn = (this._fetchFns || []).find((f) => f.name === name)
      if (!fn || !fn.prototype) { this._insertAtCursor(`${name}()`, true); return }
      st.sub = { fn, args: wizardParamList(fn).map((p) => p.default || '') }
      this._render()
    }))
  }

  /** 清理拖拽时挂到 document 上的 mousemove / mouseup 监听器。 */
  _teardownDoc () {
    if (this._docMove) { document.removeEventListener('mousemove', this._docMove); this._docMove = null }
    if (this._docUp) { document.removeEventListener('mouseup', this._docUp); document.body.style.userSelect = ''; this._docUp = null }
  }

  /**
   * 提交：吐原始 DSL 裸串给使用方（组件绝不碰画布/后端）。
   * 空表达式派发 cmx-fx-invalid；否则派发 cmx-fx-commit 后关闭浮层。
   */
  _commit () {
    const st = this._state
    if (!st) return
    const expr = String(st.expr || '').trim().replace(/^=+/, '')
    if (!expr) { this._emit('cmx-fx-invalid', { reason: 'empty' }); return }
    const target = st.target || this._currentCell || 'A1'
    this._emit('cmx-fx-commit', { expr, target })
    this.close()
  }
}

if (!customElements.get('cmx-fx-editor')) {
  customElements.define('cmx-fx-editor', CmxFxEditor)
}
