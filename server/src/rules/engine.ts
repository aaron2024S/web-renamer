import vm from 'node:vm';
import type { Rule, Scope } from '../types.js';
import { escapeRegExp } from './util.js';
import { applyRearrange } from './rearrange.js';
import { applyPinyin } from './pinyin.js';
import { applyDate } from './date.js';

/* ============================== 基础工具 ============================== */

export interface FileParts {
  name: string;
  ext: string;
}

export interface EvalCtx {
  /** 在整个列表里的序号（从 1 开始） */
  index: number;
  total: number;
  /** 在同一目录里的序号（从 1 开始，用于「按目录重置」） */
  dirIndex: number;
  dirTotal: number;
  dir: string;
  path: string;
  meta: Record<string, string>;
  /** 可复现的随机源：同一次预览与执行结果一致 */
  random: () => number;
}

export class RuleError extends Error {
  ruleId: string;
  constructor(ruleId: string, message: string) {
    super(message);
    this.name = 'RuleError';
    this.ruleId = ruleId;
  }
}

/** 拆分文件名为主名 + 扩展名（不含点）。`.gitignore` 这类点开头文件视为无扩展名。 */
export function splitName(filename: string): FileParts {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0) return { name: filename, ext: '' };
  return { name: filename.slice(0, idx), ext: filename.slice(idx + 1) };
}

export function joinName(p: FileParts): string {
  return p.ext ? `${p.name}.${p.ext}` : p.name;
}

/** 展开正则替换模板中的 $1 / $<name> / $& / $$ */
function expandTemplate(template: string, match: RegExpExecArray | RegExpMatchArray): string {
  return template.replace(
    /\$(\$|&|`|'|\d{1,2}|<[^>]+>)/g,
    (_m, token: string) => {
      if (token === '$') return '$';
      if (token === '&') return match[0];
      if (token === '`') return (match as any).input?.slice(0, match.index) ?? '';
      if (token === "'") return (match as any).input?.slice((match.index ?? 0) + match[0].length) ?? '';
      if (token.startsWith('<')) {
        const g = (match as any).groups ?? {};
        return g[token.slice(1, -1)] ?? '';
      }
      const i = Number(token);
      return (match as any)[i] ?? '';
    },
  );
}

function replaceWithCount(
  s: string,
  re: RegExp,
  replacement: string,
  occurrences: number,
): string {
  if (occurrences === Infinity) {
    return s.replace(re, replacement);
  }
  let out = s;
  let done = 0;
  while (done < occurrences) {
    const single = new RegExp(re.source, re.flags.replace('g', ''));
    const m = single.exec(out);
    if (!m) break;
    out = out.slice(0, m.index) + expandTemplate(replacement, m) + out.slice(m.index + m[0].length);
    done++;
    if (m[0] === '') break; // 防止零宽匹配死循环
  }
  return out;
}

/** 转义路径中的非法字符（Windows 规则 + 控制字符） */
const ILLEGAL_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

/* ============================== 各规则实现 ============================== */

function applyInsert(s: string, params: any): string {
  const text = String(params.text ?? '');
  const position = params.position ?? 'prefix';
  if (position === 'prefix') return text + s;
  if (position === 'suffix') return s + text;
  let at = Number(params.at ?? 0);
  if (Number.isNaN(at)) at = 0;
  if (at < 0) at = Math.max(0, s.length + at);
  at = Math.min(at, s.length);
  return s.slice(0, at) + text + s.slice(at);
}

function applyReplace(s: string, params: any): string {
  const find = String(params.find ?? '');
  if (!find) return s;
  const replacement = String(params.replaceWith ?? '');
  const caseSensitive = params.caseSensitive !== false;
  const isRegex = !!params.regex;
  const wholeWord = !!params.wholeWord;

  let source = isRegex ? find : escapeRegExp(find);
  if (wholeWord && !isRegex) source = `\\b${source}\\b`;
  const flags = 'g' + (caseSensitive ? '' : 'i');

  let re: RegExp;
  try {
    re = new RegExp(source, flags);
  } catch (e: any) {
    throw new Error(`正则表达式无效: ${e.message}`);
  }

  const occ = params.occurrences;
  let occurrences = Infinity;
  if (occ === 'first') occurrences = 1;
  else if (typeof occ === 'number' && occ > 0) occurrences = occ;

  // 非正则模式下，替换文本里的 $ 需要当作字面量
  const repl = isRegex ? replacement : replacement;
  return replaceWithCount(s, re, repl, occurrences);
}

function applyRemove(s: string, params: any): string {
  const mode = params.mode ?? 'chars';
  if (mode === 'chars') {
    const chars = String(params.chars ?? '');
    if (!chars) return s;
    const set = new Set(chars.split(''));
    return s
      .split('')
      .filter((c) => !set.has(c))
      .join('');
  }
  if (mode === 'range') {
    const fromEnd = !!params.fromEnd;
    const from = Math.max(1, Number(params.from ?? 1)) - 1; // 1 基转 0 基
    const count = Number.isFinite(Number(params.count)) ? Number(params.count) : 0;
    if (count <= 0) return s;
    const start = fromEnd ? Math.max(0, s.length - from - count) : from;
    if (start >= s.length) return s;
    return s.slice(0, start) + s.slice(start + count);
  }
  if (mode === 'between') {
    const open = String(params.open ?? '');
    const close = String(params.close ?? '');
    if (!open || !close) return s;
    const startIdx = s.indexOf(open);
    if (startIdx === -1) return s;
    const endIdx = s.indexOf(close, startIdx + open.length);
    if (endIdx === -1) return s;
    const inclusive = !!params.inclusive;
    const cutStart = inclusive ? startIdx : startIdx + open.length;
    const cutEnd = inclusive ? endIdx + close.length : endIdx;
    return s.slice(0, cutStart) + s.slice(cutEnd);
  }
  return s;
}

function applyCase(s: string, params: any): string {
  const mode = params.mode ?? 'lower';
  const seps = String(params.separators ?? ' \t_-');
  switch (mode) {
    case 'lower':
      return s.toLowerCase();
    case 'upper':
      return s.toUpperCase();
    case 'invert':
      return s
        .split('')
        .map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
        .join('');
    case 'title': {
      const sepSet = new Set(seps.split(''));
      let prevIsSep = true;
      return s
        .split('')
        .map((c) => {
          const isSep = sepSet.has(c);
          const out = prevIsSep && !isSep ? c.toUpperCase() : c.toLowerCase();
          prevIsSep = isSep;
          return out;
        })
        .join('');
    }
    case 'sentence': {
      const lower = s.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    default:
      return s;
  }
}

function applyStrip(s: string, params: any): string {
  let out = s;
  if (params.removeChars) {
    const set = new Set(String(params.removeChars).split(''));
    out = out
      .split('')
      .filter((c) => !set.has(c))
      .join('');
  }
  if (params.removeDiacritics) {
    out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  if (params.collapseSpaces) {
    out = out.replace(/\s+/g, ' ');
  }
  if (params.trim !== false) {
    out = out.trim();
  }
  return out;
}

function applyCleanup(s: string, params: any): string {
  const repl = params.replaceWith ?? '_';
  let out = s.replace(ILLEGAL_CHARS, repl);
  if (params.collapse) out = out.replace(new RegExp(`${escapeRegExp(repl)}{2,}`, 'g'), repl);
  if (params.trimEnds !== false) out = out.replace(/[. ]+$/, '');
  return out;
}

const CHARSETS: Record<string, string> = {
  alnum: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digit: '0123456789',
  hex: '0123456789abcdef',
};

function applyRandomize(s: string, params: any, ctx: EvalCtx): string {
  const length = Math.max(1, Number(params.length ?? 8));
  const charset = CHARSETS[params.charset ?? 'alnum'] ?? CHARSETS.alnum;
  let out = '';
  for (let i = 0; i < length; i++) {
    out += charset[Math.floor(ctx.random() * charset.length)];
  }
  const mode = params.mode ?? 'replace';
  if (mode === 'prefix') return out + s;
  if (mode === 'suffix') return s + out;
  return out;
}

function applyPadding(s: string, params: any): string {
  const length = Math.max(0, Number(params.length ?? 0));
  const char = String(params.char ?? '0')[0] ?? '0';
  const align = params.align ?? 'left';
  let out = s;
  if (out.length < length) {
    const pad = char.repeat(length - out.length);
    out = align === 'left' ? pad + out : out + pad;
  } else if (out.length > length && params.truncate) {
    out = align === 'left' ? out.slice(out.length - length) : out.slice(0, length);
  }
  return out;
}

function applyMeta(s: string, params: any, ctx: EvalCtx): string {
  const pattern = String(params.pattern ?? '');
  if (!pattern) return s;
  let missing = false;
  const out = pattern.replace(/\{([^}]+)\}/g, (_m, expr: string) => {
    const [key, padRaw] = String(expr).split(':');
    const value = ctx.meta[key.trim()] ?? ctx.meta[key.trim().toLowerCase()];
    if (value === undefined || value === '') {
      missing = true;
      return '';
    }
    const pad = Number(padRaw);
    return Number.isFinite(pad) && pad > 0 ? value.padStart(pad, '0') : value;
  });
  if (missing && params.keepIfMissing) return s;
  return out;
}

function applyScript(s: string, params: any, ctx: EvalCtx): string {
  const code = String(params.code ?? '');
  if (!code.trim()) return s;
  const sandbox = {
    name: s,
    ext: '',
    index: ctx.index,
    total: ctx.total,
    dir: ctx.dir,
    meta: { ...ctx.meta },
    result: s,
  };
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
  const wrapped = `(function(){ "use strict";\n${code}\n return (typeof result !== 'undefined' ? result : name); })()`;
  try {
    const value = vm.runInContext(wrapped, context, { timeout: 300 });
    if (typeof value !== 'string') {
      throw new Error('脚本必须返回字符串（或给 result 赋值）');
    }
    return value;
  } catch (e: any) {
    throw new Error(`脚本执行失败: ${e.message}`);
  }
}

/* ============================== 作用域分发 ============================== */

function withScope(parts: FileParts, scope: Scope, fn: (s: string) => string): FileParts {
  if (scope === 'ext') return { ...parts, ext: fn(parts.ext) };
  if (scope === 'full') return splitName(fn(joinName(parts)));
  return { ...parts, name: fn(parts.name) };
}

/* ============================== 主入口 ============================== */

export function applyRule(parts: FileParts, rule: Rule, ctx: EvalCtx): FileParts {
  const p = rule.params ?? {};
  const run = (fn: (s: string) => string) => withScope(parts, rule.scope ?? 'name', fn);

  try {
    switch (rule.type) {
      case 'insert':
        return run((s) => applyInsert(s, p));
      case 'replace':
        return run((s) => applyReplace(s, p));
      case 'remove':
        return run((s) => applyRemove(s, p));
      case 'case':
        return run((s) => applyCase(s, p));
      case 'strip':
        return run((s) => applyStrip(s, p));
      case 'cleanup':
        return run((s) => applyCleanup(s, p));
      case 'randomize':
        return run((s) => applyRandomize(s, p, ctx));
      case 'padding':
        return run((s) => applyPadding(s, p));
      case 'rearrange':
        return run((s) => applyRearrange(s, p));
      case 'pinyin':
        return run((s) => applyPinyin(s, p));
      case 'date':
        return run((s) => applyDate(s, p));
      case 'meta':
        return withScope(parts, rule.scope ?? 'name', (s) => applyMeta(s, p, ctx));
      case 'script':
        return withScope(parts, rule.scope ?? 'name', (s) => applyScript(s, p, ctx));
      case 'regex': {
        const pattern = String(p.pattern ?? '');
        const flags = String(p.flags ?? 'g');
        if (!pattern) return parts;
        let re: RegExp;
        try {
          re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
        } catch (e: any) {
          throw new Error(`正则表达式无效: ${e.message}`);
        }
        return run((s) => s.replace(re, String(p.replacement ?? '')));
      }
      case 'extension': {
        // 扩展名规则始终作用于扩展名，忽略 scope
        const mode = p.mode ?? 'set';
        if (mode === 'remove') return { ...parts, ext: '' };
        if (mode === 'lower') return { ...parts, ext: parts.ext.toLowerCase() };
        if (mode === 'upper') return { ...parts, ext: parts.ext.toUpperCase() };
        const value = String(p.value ?? '').replace(/^\./, '');
        return { ...parts, ext: value };
      }
      case 'serialize': {
        const start = Number(p.start ?? 1);
        const step = Number(p.step ?? 1);
        const padding = Math.max(0, Number(p.padding ?? 0));
        const resetPerDir = !!p.resetPerDir;
        const n = resetPerDir ? ctx.dirIndex : ctx.index;
        const value = String(start + (n - 1) * step).padStart(padding, '0');
        const mode = p.mode ?? 'suffix';
        return withScope(parts, rule.scope ?? 'name', (s) => {
          if (mode === 'prefix') return value + s;
          return s + value;
        });
      }
      default:
        return parts;
    }
  } catch (e: any) {
    throw new RuleError(rule.id, e.message ?? String(e));
  }
}

/** 依次应用规则，返回新的文件名 */
export function applyRules(filename: string, rules: Rule[], ctx: EvalCtx): string {
  let parts = splitName(filename);
  for (const rule of rules) {
    if (!rule.enabled) continue;
    parts = applyRule(parts, rule, ctx);
  }
  return joinName(parts);
}
