/**
 * 日期重格式化规则：从文件名里识别日期片段，按目标格式重写。
 * 例：`IMG_20241007_draft.jpg` → `IMG_2024-10-07_draft.jpg`
 */
import { escapeRegExp } from './util.js';

/** 支持的模式记号（长记号写在前面，保证优先匹配） */
const TOKENS = ['YYYY', 'YY', 'MM', 'DD', 'HH', 'mm', 'SS', 'M', 'D'] as const;
type Token = (typeof TOKENS)[number];

const WIDTH: Record<Token, string> = {
  YYYY: '\\d{4}',
  YY: '\\d{2}',
  MM: '\\d{2}',
  M: '\\d{1,2}',
  DD: '\\d{2}',
  D: '\\d{1,2}',
  HH: '\\d{2}',
  mm: '\\d{2}',
  SS: '\\d{2}',
};

interface DateParts {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
}

interface Compiled {
  re: RegExp;
  tokens: Token[];
}

/** 把模式串编译成正则（用数字边界包住，避免从一长串数字中间截取） */
function compile(pattern: string): Compiled {
  let src = '';
  const tokens: Token[] = [];
  let i = 0;
  while (i < pattern.length) {
    const token = TOKENS.find((t) => pattern.startsWith(t, i));
    if (token) {
      src += `(${WIDTH[token]})`;
      tokens.push(token);
      i += token.length;
    } else {
      src += escapeRegExp(pattern[i]);
      i += 1;
    }
  }
  return { re: new RegExp(`(?<!\\d)${src}(?!\\d)`), tokens };
}

const FIELD: Record<Token, keyof DateParts> = {
  YYYY: 'year',
  YY: 'year',
  MM: 'month',
  M: 'month',
  DD: 'day',
  D: 'day',
  HH: 'hour',
  mm: 'minute',
  SS: 'second',
};

/** 从匹配结果取出各字段；不合法（如 13 月、45 日）返回 null */
function extract(match: RegExpExecArray, tokens: Token[]): DateParts | null {
  const parts: DateParts = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const value = Number(match[i + 1]);
    if (!Number.isFinite(value)) continue;
    if (token === 'YY') parts.year = value < 70 ? 2000 + value : 1900 + value;
    else parts[FIELD[token]] = value;
  }
  if (parts.year !== undefined && (parts.year < 1900 || parts.year > 2999)) return null;
  if (parts.month !== undefined && (parts.month < 1 || parts.month > 12)) return null;
  if (parts.day !== undefined && (parts.day < 1 || parts.day > 31)) return null;
  if (parts.hour !== undefined && (parts.hour > 23)) return null;
  if (parts.minute !== undefined && (parts.minute > 59)) return null;
  if (parts.second !== undefined && (parts.second > 59)) return null;
  return parts;
}

const pad = (n: number | undefined, len = 2): string =>
  n === undefined ? '' : String(n).padStart(len, '0');

/** 按目标格式输出 */
export function formatDate(parts: DateParts, output: string): string {
  const map: Record<Token, string> = {
    YYYY: parts.year === undefined ? '' : String(parts.year),
    YY: parts.year === undefined ? '' : pad(parts.year % 100),
    MM: pad(parts.month),
    M: parts.month === undefined ? '' : String(parts.month),
    DD: pad(parts.day),
    D: parts.day === undefined ? '' : String(parts.day),
    HH: parts.hour === undefined ? '' : pad(parts.hour),
    mm: pad(parts.minute),
    SS: pad(parts.second),
  };
  return output.replace(/YYYY|YY|MM|DD|HH|mm|SS|M|D/g, (t) => map[t as Token] ?? '');
}

/** 自动识别时按优先级尝试的候选格式 */
function candidates(dayFirst: boolean): string[] {
  const ymd = [
    'YYYY-MM-DD',
    'YYYY_MM_DD',
    'YYYY.MM.DD',
    'YYYY/MM/DD',
    'YYYY MM DD',
    'YYYY-M-D',
    'YYYY年MM月DD日',
    'YYYY年M月D日',
  ];
  const compact = ['YYYYMMDDHHmmSS', 'YYYYMMDD_HHmmSS', 'YYYYMMDDHHmm', 'YYYYMMDD'];
  const dashed = dayFirst
    ? ['DD-MM-YYYY', 'DD_MM_YYYY', 'DD.MM.YYYY', 'DD/MM/YYYY', 'MM-DD-YYYY', 'MM/DD/YYYY']
    : ['MM-DD-YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'DD_MM_YYYY', 'DD.MM.YYYY', 'DD/MM/YYYY'];
  const withTime = ['YYYY-MM-DD_HH-mm-ss', 'YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH-mm-ss'];
  return [...withTime, ...ymd, ...compact, ...dashed];
}

export function applyDate(s: string, params: any): string {
  if (!s) return s;

  const mode = params.mode ?? 'replace';
  const output = String(params.output ?? 'YYYY-MM-DD');
  const custom = String(params.pattern ?? '').trim();
  const dayFirst = params.dayFirst !== false;
  const join = String(params.join ?? '_');

  type Hit = { start: number; end: number; parts: DateParts };
  let hit: Hit | null = null;

  const tryPattern = (pattern: string): Hit | null => {
    const { re, tokens } = compile(pattern);
    const m = re.exec(s);
    if (!m) return null;
    const parts = extract(m, tokens);
    if (!parts) return null;
    return { start: m.index, end: m.index + m[0].length, parts };
  };

  if (custom) {
    hit = tryPattern(custom);
  } else {
    for (const cand of candidates(dayFirst)) {
      hit = tryPattern(cand);
      if (hit) break;
    }
  }

  if (!hit) return s;

  const { start, end, parts } = hit;
  const dateText = formatDate(parts, output).replace(/^[\s\-_.]+|[\s\-_.]+$/g, '');

  if (mode === 'remove') return (s.slice(0, start) + s.slice(end)).trim();
  if (mode === 'replace') return s.slice(0, start) + dateText + s.slice(end);

  if (!dateText) return s;

  const left = s.slice(0, start).replace(/[\s\-_.]+$/, '');
  const right = s.slice(end).replace(/^[\s\-_.]+/, '');
  const rest = [left, right].filter(Boolean).join(join);

  if (mode === 'prefix') return [dateText, rest].filter(Boolean).join(join);
  return [rest, dateText].filter(Boolean).join(join); // suffix
}
