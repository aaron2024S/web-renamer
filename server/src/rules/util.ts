/** 规则实现共用的小工具 */

/** 把字符串转成可安全放进正则的字面量 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
