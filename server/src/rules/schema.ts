import type { RuleType } from '../types.js';

/**
 * 规则元数据 —— 前端据此动态渲染表单，保证前后端字段一致。
 */
export type FieldType = 'text' | 'number' | 'select' | 'checkbox' | 'textarea';

export interface RuleField {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  width?: 'full' | 'half';
}

export interface RuleTypeMeta {
  type: RuleType;
  label: string;
  description: string;
  /** 是否支持作用域（主名 / 扩展名 / 整体） */
  scope: boolean;
  defaults: Record<string, any>;
  fields: RuleField[];
}

export const RULE_TYPES: RuleTypeMeta[] = [
  {
    type: 'insert',
    label: '插入',
    description: '在文件名前 / 后或指定位置插入固定文本',
    scope: true,
    defaults: { position: 'prefix', text: '', anchor: '', at: 0 },
    fields: [
      {
        key: 'position',
        label: '位置',
        type: 'select',
        options: [
          { value: 'prefix', label: '前缀（最前）' },
          { value: 'suffix', label: '后缀（最后）' },
          { value: 'index', label: '指定位置' },
          { value: 'afterText', label: '在文本之后' },
          { value: 'beforeText', label: '在文本之前' },
          { value: 'replace', label: '替换当前主名' },
        ],
      },
      { key: 'text', label: '文本', type: 'text', placeholder: '要插入的文字' },
      {
        key: 'anchor',
        label: '定位文本',
        type: 'text',
        help: '「在文本之前 / 之后」时，插入到这段文字的前面 / 后面',
      },
      { key: 'at', label: '位置索引', type: 'number', help: '仅「指定位置」时生效，负数从末尾算（等同 ReNamer 的 Right-to-left）' },
    ],
  },
  {
    type: 'replace',
    label: '替换',
    description: '查找并替换文本，可开启正则与全词匹配',
    scope: true,
    defaults: {
      find: '',
      replaceWith: '',
      regex: false,
      caseSensitive: true,
      wholeWord: false,
      occurrences: 'all',
    },
    fields: [
      { key: 'find', label: '查找', type: 'text', placeholder: '要查找的内容' },
      { key: 'replaceWith', label: '替换为', type: 'text', placeholder: '留空即删除' },
      { key: 'regex', label: '使用正则', type: 'checkbox' },
      { key: 'wholeWord', label: '全词匹配', type: 'checkbox' },
      { key: 'caseSensitive', label: '区分大小写', type: 'checkbox' },
      {
        key: 'occurrences',
        label: '替换范围',
        type: 'select',
        options: [
          { value: 'all', label: '全部' },
          { value: 'first', label: '仅第一个' },
          { value: 'last', label: '仅最后一个' },
        ],
      },
    ],
  },
  {
    type: 'regex',
    label: '正则替换',
    description: '用正则表达式重写文件名，支持捕获组 $1、$<name>',
    scope: true,
    defaults: { pattern: '', replacement: '', flags: 'g' },
    fields: [
      { key: 'pattern', label: '正则表达式', type: 'text', placeholder: '例如 ^S(\\d+)E(\\d+)' },
      { key: 'replacement', label: '替换为', type: 'text', placeholder: '例如 第$1季第$2集' },
      { key: 'flags', label: '标志', type: 'text', placeholder: 'g / gi / gsu 等' },
    ],
  },
  {
    type: 'remove',
    label: '移除',
    description: '删除指定文本（全部/首个/末个）、一段区间或两个分隔符之间的内容',
    scope: true,
    defaults: {
      mode: 'chars',
      text: '',
      occurrences: 'all',
      caseSensitive: true,
      wholeWord: false,
      chars: '',
      from: 1,
      count: 1,
      fromEnd: false,
      open: '(',
      close: ')',
      inclusive: false,
    },
    fields: [
      {
        key: 'mode',
        label: '方式',
        type: 'select',
        options: [
          { value: 'text', label: '指定文本' },
          { value: 'chars', label: '按字符集' },
          { value: 'range', label: '按区间' },
          { value: 'between', label: '分隔符之间' },
        ],
      },
      { key: 'text', label: '要删除的文本', type: 'text', help: '方式=指定文本' },
      {
        key: 'occurrences',
        label: '删除范围',
        type: 'select',
        options: [
          { value: 'all', label: '全部' },
          { value: 'first', label: '仅第一个' },
          { value: 'last', label: '仅最后一个' },
        ],
      },
      { key: 'caseSensitive', label: '区分大小写', type: 'checkbox' },
      { key: 'wholeWord', label: '全词匹配', type: 'checkbox' },
      { key: 'chars', label: '字符集', type: 'text', help: '方式=按字符集：这些字符都会被删除' },
      { key: 'from', label: '起始位置', type: 'number', help: '方式=按区间：从第几个字符开始（1 起）' },
      { key: 'count', label: '长度', type: 'number', help: '留空或 0 表示一直删到末尾' },
      { key: 'fromEnd', label: '从末尾计算', type: 'checkbox' },
      { key: 'open', label: '起始分隔符', type: 'text', placeholder: '(' },
      { key: 'close', label: '结束分隔符', type: 'text', placeholder: ')' },
      { key: 'inclusive', label: '连分隔符一起删', type: 'checkbox' },
    ],
  },
  {
    type: 'case',
    label: '大小写',
    description: '转换为小写 / 大写 / 首字母大写 / 句首大写 / 反转',
    scope: true,
    defaults: { mode: 'lower', separators: ' \t_-' },
    fields: [
      {
        key: 'mode',
        label: '模式',
        type: 'select',
        options: [
          { value: 'lower', label: '全部小写' },
          { value: 'upper', label: '全部大写' },
          { value: 'title', label: '每词首字母大写' },
          { value: 'capitalize', label: '首字母大写（保留其余）' },
          { value: 'sentence', label: '句首大写' },
          { value: 'invert', label: '反转大小写' },
        ],
      },
      { key: 'separators', label: '分词符号', type: 'text', help: '「每词首字母大写」时用于切词的字符' },
    ],
  },
  {
    type: 'extension',
    label: '扩展名',
    description: '设置 / 删除扩展名，或改变其大小写',
    scope: false,
    defaults: { mode: 'set', value: '' },
    fields: [
      {
        key: 'mode',
        label: '方式',
        type: 'select',
        options: [
          { value: 'set', label: '设置为' },
          { value: 'append', label: '追加到原名后' },
          { value: 'remove', label: '删除扩展名' },
          { value: 'lower', label: '转为小写' },
          { value: 'upper', label: '转为大写' },
        ],
      },
      { key: 'value', label: '新扩展名', type: 'text', placeholder: '不含点，例如 txt', help: '「追加」时保留原扩展名，新扩展名接在后面' },
    ],
  },
  {
    type: 'serialize',
    label: '序列号',
    description: '按顺序添加自增编号，可补零、按目录重置',
    scope: true,
    defaults: {
      mode: 'suffix',
      start: 1,
      step: 1,
      repeat: 1,
      padding: 3,
      system: 'decimal',
      resetPerDir: false,
    },
    fields: [
      {
        key: 'mode',
        label: '位置',
        type: 'select',
        options: [
          { value: 'prefix', label: '前缀' },
          { value: 'suffix', label: '后缀' },
          { value: 'index', label: '指定位置' },
          { value: 'replace', label: '替换主名' },
        ],
      },
      { key: 'start', label: '起始值', type: 'number' },
      { key: 'step', label: '步长', type: 'number' },
      { key: 'repeat', label: '重复次数', type: 'number', help: '每个编号重复用在几个文件上（ReNamer 的 Repeat）' },
      { key: 'padding', label: '补零位数', type: 'number' },
      {
        key: 'system',
        label: '编号系统',
        type: 'select',
        options: [
          { value: 'decimal', label: '十进制（1, 2, 3）' },
          { value: 'hex', label: '十六进制（1, 2, a, f, 10）' },
          { value: 'hexUpper', label: '十六进制大写（A, B, F, 10）' },
          { value: 'letters', label: '字母（a, b, … z, aa）' },
          { value: 'roman', label: '罗马数字（I, II, III）' },
        ],
      },
      { key: 'resetPerDir', label: '按目录重置', type: 'checkbox' },
    ],
  },
  {
    type: 'strip',
    label: '清理空白',
    description: '去除首尾空白、合并连续空格、删除指定字符',
    scope: true,
    defaults: {
      trim: true,
      collapseSpaces: true,
      removeChars: '',
      where: 'everywhere',
      removeDiacritics: false,
    },
    fields: [
      { key: 'trim', label: '去除首尾空白', type: 'checkbox' },
      { key: 'collapseSpaces', label: '合并连续空格', type: 'checkbox' },
      { key: 'removeChars', label: '删除字符', type: 'text', help: '这里列出的每个字符都会被删掉' },
      {
        key: 'where',
        label: '删除字符位置',
        type: 'select',
        options: [
          { value: 'everywhere', label: '任意位置' },
          { value: 'leading', label: '仅开头' },
          { value: 'trailing', label: '仅结尾' },
        ],
      },
      { key: 'removeDiacritics', label: '去除变音符号', type: 'checkbox', help: '如 café → cafe' },
    ],
  },
  {
    type: 'cleanup',
    label: '清理非法字符',
    description: '替换掉文件名中不被系统允许的字符（跨平台安全）',
    scope: true,
    defaults: {
      replaceWith: '_',
      collapse: true,
      trimEnds: true,
      stripBrackets: false,
      camelSpace: false,
    },
    fields: [
      { key: 'replaceWith', label: '替换为', type: 'text', placeholder: '_' },
      { key: 'collapse', label: '合并连续替换符', type: 'checkbox' },
      { key: 'trimEnds', label: '去除结尾的点/空格', type: 'checkbox' },
      { key: 'stripBrackets', label: '删除括号及内容', type: 'checkbox', help: '删除 (…)、[…]、{…} 连同括号本身' },
      { key: 'camelSpace', label: '驼峰前加空格', type: 'checkbox', help: '如 CamelCase → Camel Case' },
    ],
  },
  {
    type: 'padding',
    label: '补位',
    description: '把文件名补齐到指定长度，或截断',
    scope: true,
    defaults: { length: 8, char: '0', align: 'left', truncate: false, stripZeros: false },
    fields: [
      { key: 'length', label: '目标长度', type: 'number' },
      { key: 'char', label: '填充字符', type: 'text', placeholder: '0' },
      {
        key: 'align',
        label: '对齐',
        type: 'select',
        options: [
          { value: 'left', label: '左侧填充' },
          { value: 'right', label: '右侧填充' },
        ],
      },
      { key: 'truncate', label: '超长时截断', type: 'checkbox' },
      { key: 'stripZeros', label: '去除前导零', type: 'checkbox', help: '如 007 → 7（ReNamer 的 Remove zero padding）' },
    ],
  },
  {
    type: 'randomize',
    label: '随机字符串',
    description: '用随机字符替换 / 拼接文件名',
    scope: true,
    defaults: { length: 8, charset: 'alnum', custom: '', mode: 'replace' },
    fields: [
      { key: 'length', label: '长度', type: 'number' },
      {
        key: 'charset',
        label: '字符集',
        type: 'select',
        options: [
          { value: 'alnum', label: '字母 + 数字' },
          { value: 'alpha', label: '仅字母' },
          { value: 'lower', label: '仅小写字母' },
          { value: 'digit', label: '仅数字' },
          { value: 'hex', label: '十六进制' },
        ],
      },
      {
        key: 'custom',
        label: '自定义字符集',
        type: 'text',
        placeholder: '如 ABC123',
        help: '填了则优先使用这里的字符（ReNamer 的 User defined）',
      },
      {
        key: 'mode',
        label: '方式',
        type: 'select',
        options: [
          { value: 'replace', label: '替换整个名字' },
          { value: 'prefix', label: '作为前缀' },
          { value: 'suffix', label: '作为后缀' },
        ],
      },
    ],
  },
  {
    type: 'rearrange',
    label: '重排',
    description: '按分隔符拆成片段后重新组合，可模板重排 / 倒序 / 排序',
    scope: true,
    defaults: { mode: 'template', delimiter: ' -_', pattern: '$2 $1', join: ' ', appendRest: true, keepIfShort: true },
    fields: [
      {
        key: 'mode',
        label: '方式',
        type: 'select',
        options: [
          { value: 'template', label: '按模板重排' },
          { value: 'reverse', label: '片段倒序' },
          { value: 'sortAsc', label: '升序排序' },
          { value: 'sortDesc', label: '降序排序' },
        ],
      },
      {
        key: 'delimiter',
        label: '分隔符',
        type: 'text',
        placeholder: ' -_',
        help: '这里列出的每个字符都算作分隔符；留空则按空白切分',
      },
      {
        key: 'pattern',
        label: '新顺序模板',
        type: 'text',
        placeholder: '$2 $1',
        help: '$1 $2… 引用片段，$-1 $-2… 从末尾往前引用，$0 表示原始整名',
      },
      { key: 'join', label: '拼接字符', type: 'text', placeholder: '空格', help: '连接各片段用的字符' },
      { key: 'appendRest', label: '追加未被引用的片段', type: 'checkbox' },
      { key: 'keepIfShort', label: '片段不足时保留原名', type: 'checkbox', help: '避免拼出带悬空分隔符的坏名字' },
    ],
  },
  {
    type: 'pinyin',
    label: '拼音转写',
    description: '把中文转成拼音（全拼 ni hao / 首字母 nh），可带声调',
    scope: true,
    defaults: { mode: 'full', tone: 'none', separator: ' ', keepNonChinese: true, lowercase: true, v: true },
    fields: [
      {
        key: 'mode',
        label: '形式',
        type: 'select',
        options: [
          { value: 'full', label: '全拼（ni hao）' },
          { value: 'initials', label: '首字母（nh）' },
        ],
      },
      {
        key: 'tone',
        label: '声调',
        type: 'select',
        options: [
          { value: 'none', label: '不标声调' },
          { value: 'mark', label: '声调符号（nǐ hǎo）' },
          { value: 'number', label: '声调数字（ni3 hao3）' },
        ],
      },
      { key: 'separator', label: '音节分隔符', type: 'text', placeholder: '空格', help: '仅全拼模式生效' },
      { key: 'keepNonChinese', label: '保留非中文内容', type: 'checkbox', help: '关闭则只留拼音' },
      { key: 'lowercase', label: '转为小写', type: 'checkbox', help: '英文与拼音统一小写' },
      { key: 'v', label: 'ü 写作 v', type: 'checkbox' },
    ],
  },
  {
    type: 'date',
    label: '日期重格式化',
    description: '识别文件名里的日期并按新格式重写，如 20241007 → 2024-10-07',
    scope: true,
    defaults: { mode: 'replace', pattern: '', output: 'YYYY-MM-DD', dayFirst: true, join: '_' },
    fields: [
      {
        key: 'mode',
        label: '处理方式',
        type: 'select',
        options: [
          { value: 'replace', label: '原地替换' },
          { value: 'prefix', label: '移到开头' },
          { value: 'suffix', label: '移到结尾' },
          { value: 'remove', label: '删除日期' },
        ],
      },
      {
        key: 'pattern',
        label: '源格式',
        type: 'text',
        placeholder: '留空自动识别',
        help: '可用 YYYY YY MM M DD D HH mm SS，例如 YYYYMMDD',
      },
      {
        key: 'output',
        label: '目标格式',
        type: 'text',
        placeholder: 'YYYY-MM-DD',
        help: '可用 YYYY YY MM M DD D HH mm SS，其余字符原样输出',
      },
      {
        key: 'dayFirst',
        label: '自动识别时「日」在「月」前',
        type: 'checkbox',
        help: '处理 07-10-2024 这类有歧义的日期',
      },
      { key: 'join', label: '拼接字符', type: 'text', placeholder: '_', help: '移到开头 / 结尾时用于连接' },
    ],
  },
  {
    type: 'meta',
    label: '元标签',
    description: '从音乐 / 图片文件中读取标签写入文件名，如 {artist} - {title}',
    scope: true,
    defaults: { pattern: '{artist} - {title}', keepIfMissing: true },
    fields: [
      {
        key: 'pattern',
        label: '命名模板',
        type: 'textarea',
        placeholder: '{artist} - {title}',
        help: '可用字段：{title} {artist} {album} {track} {year} {genre} {dateTime} {make} {model}',
      },
      { key: 'keepIfMissing', label: '缺字段时保留原名', type: 'checkbox' },
    ],
  },
  {
    type: 'userinput',
    label: '用户输入',
    description: '为每个文件指定新名字：每行一个，按文件顺序一一对应',
    scope: true,
    defaults: { mode: 'replace', lines: '' },
    fields: [
      {
        key: 'lines',
        label: '名字列表',
        type: 'textarea',
        placeholder: '每行一个名字，按文件顺序对应',
        help: '第 1 行 → 第 1 个文件，第 2 行 → 第 2 个文件…；行数不够的文件保留原名',
      },
      {
        key: 'mode',
        label: '方式',
        type: 'select',
        options: [
          { value: 'replace', label: '替换当前名' },
          { value: 'prefix', label: '插到最前' },
          { value: 'suffix', label: '插到最后' },
        ],
      },
    ],
  },
  {
    type: 'script',
    label: '脚本',
    description: '用 JavaScript 自定义逻辑（沙箱执行，可用 name / ext / index / total / dir / meta）',
    scope: true,
    defaults: { code: '// 例：把名字改成小写并加序号\nresult = name.toLowerCase();' },
    fields: [
      {
        key: 'code',
        label: '脚本代码',
        type: 'textarea',
        help: '给 result 赋值，或 return 一个字符串',
      },
    ],
  },
];

export function getRuleTypeMeta(type: RuleType): RuleTypeMeta | undefined {
  return RULE_TYPES.find((r) => r.type === type);
}

export function defaultParams(type: RuleType): Record<string, any> {
  return { ...(getRuleTypeMeta(type)?.defaults ?? {}) };
}
