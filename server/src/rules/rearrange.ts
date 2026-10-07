/**
 * 重排规则：按分隔符把文件名拆成若干片段，再按模板 / 倒序 / 排序重新组合。
 * 例：`2024-10-07 会议纪要` 用模板 `$2 $1` → `会议纪要 2024-10-07`
 */

/** 把字符串按「分隔符字符集」切成片段（空片段丢弃） */
export function splitParts(s: string, delimiter: string): string[] {
  if (!delimiter) {
    // 未指定分隔符时按连续空白切分
    return s.split(/\s+/).filter(Boolean);
  }
  const seps = new Set(delimiter.split(''));
  const out: string[] = [];
  let cur = '';
  for (const ch of s) {
    if (seps.has(ch)) {
      if (cur) out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function applyRearrange(s: string, params: any): string {
  const delimiter = String(params.delimiter ?? '');
  const mode = params.mode ?? 'template';
  const join = String(params.join ?? ' ');

  const parts = splitParts(s, delimiter);
  if (parts.length <= 1 && mode !== 'template') return s;

  if (mode === 'reverse') return [...parts].reverse().join(join);
  if (mode === 'sortAsc') return [...parts].sort((a, b) => a.localeCompare(b, 'zh')).join(join);
  if (mode === 'sortDesc') return [...parts].sort((a, b) => b.localeCompare(a, 'zh')).join(join);

  /* ---------------------------- 模板重排 ---------------------------- */
  const pattern = String(params.pattern ?? '');
  if (!pattern) return parts.join(join);

  const refs = [...pattern.matchAll(/\$(\d+)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0);
  // 片段不够时直接保留原名，避免拼出 ' 名字' 这种带悬空分隔符的坏名字
  if (params.keepIfShort !== false && refs.some((n) => n > parts.length)) return s;

  const appendRest = params.appendRest !== false;
  const used = new Set<number>();

  const out = pattern.replace(/\$(\d+)/g, (_m, raw: string) => {
    const n = Number(raw);
    if (n === 0) return s; // $0 = 原始整名
    const part = parts[n - 1];
    if (part === undefined) return '';
    used.add(n);
    return part;
  });

  if (!appendRest) return out;

  const rest = parts.filter((_, i) => !used.has(i + 1));
  if (rest.length === 0) return out;
  return [out, ...rest].filter((x) => x !== '').join(join);
}
