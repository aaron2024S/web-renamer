/**
 * 拼音转写规则：把文件名里的中文转成拼音（全拼 / 首字母），非中文内容可选保留。
 * 例：`你好世界 2024` → `ni hao shi jie 2024`
 */
import { pinyin } from 'pinyin-pro';

export function applyPinyin(s: string, params: any): string {
  if (!s) return s;

  const mode = params.mode ?? 'full';
  const tone = params.tone ?? 'none';
  const keepNonChinese = params.keepNonChinese !== false;
  const lower = params.lowercase !== false;
  const useV = params.v !== false;

  const toneType = tone === 'mark' ? 'symbol' : tone === 'number' ? 'num' : 'none';
  const separator = String(params.separator ?? ' ');

  let out: string;
  try {
    out = pinyin(s, {
      toneType: toneType as any,
      type: 'string',
      // 首字母模式（你好 → nh），其余为全拼
      pattern: (mode === 'initials' ? 'first' : 'pinyin') as any,
      separator: mode === 'initials' ? '' : separator,
      nonZh: keepNonChinese ? 'consecutive' : 'removed',
      v: useV,
    } as any);
  } catch {
    return s;
  }

  if (mode === 'full' && separator) {
    // 非中文内容被原样保留时会带来多余空格，收敛一下
    out = out.split(separator).filter((x) => x !== '').join(separator);
  }
  out = out.trim();

  if (lower) out = out.toLowerCase();
  return out || s;
}
