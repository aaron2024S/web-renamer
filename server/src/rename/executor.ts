import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { addJournal } from '../db.js';
import type { JournalEntry, PlanItem } from '../types.js';

export interface ApplyResult {
  journalId: string | null;
  renamed: JournalEntry[];
  failed: { from: string; to: string; error: string }[];
  /** 是否需要两阶段（交换 / 成环 / 仅改大小写） */
  usedStaging: boolean;
}

/** 判断本次改名是否存在「目标与源互相占用」的风险，需要先改到临时名 */
function needsStaging(pairs: JournalEntry[]): boolean {
  const srcSet = new Set(pairs.map((p) => p.from.toLowerCase()));
  for (const p of pairs) {
    const to = p.to.toLowerCase();
    const from = p.from.toLowerCase();
    if (from === to && p.from !== p.to) return true; // 仅大小写不同
    if (srcSet.has(to)) return true; // 目标名撞上其它源文件（交换 / 成环）
  }
  return false;
}

function tempName(dir: string, original: string): string {
  const ext = path.extname(original);
  return path.join(dir, `.wr-tmp-${randomUUID()}${ext}`);
}

/**
 * 执行改名计划。只处理 status === 'ok' 的项。
 * 涉及交换 / 成环 / 仅改大小写时走两阶段，避免互相覆盖丢文件。
 */
export function applyPlan(items: PlanItem[], root: string, recordHistory: boolean): ApplyResult {
  const okItems = items.filter((i) => i.status === 'ok');
  const pairs: JournalEntry[] = okItems.map((i) => ({ from: i.src, to: i.dst }));

  const failed: ApplyResult['failed'] = [];
  const renamed: JournalEntry[] = [];
  const staging = needsStaging(pairs);

  if (staging) {
    // 阶段一：源 → 临时名
    const staged: { tmp: string; from: string; to: string }[] = [];
    for (const p of pairs) {
      const tmp = tempName(path.dirname(p.from), p.from);
      try {
        fs.renameSync(p.from, tmp);
        staged.push({ tmp, from: p.from, to: p.to });
      } catch (e: any) {
        failed.push({ from: p.from, to: p.to, error: e.message });
      }
    }
    // 阶段二：临时名 → 目标
    for (const s of staged) {
      try {
        fs.renameSync(s.tmp, s.to);
        renamed.push({ from: s.from, to: s.to });
      } catch (e: any) {
        // 尽力回滚这一项
        try {
          fs.renameSync(s.tmp, s.from);
        } catch {
          /* 回滚失败也无法再做什么 */
        }
        failed.push({ from: s.from, to: s.to, error: e.message });
      }
    }
  } else {
    for (const p of pairs) {
      try {
        fs.renameSync(p.from, p.to);
        renamed.push({ from: p.from, to: p.to });
      } catch (e: any) {
        failed.push({ from: p.from, to: p.to, error: e.message });
      }
    }
  }

  let journalId: string | null = null;
  if (recordHistory && renamed.length > 0) {
    journalId = randomUUID();
    addJournal({
      id: journalId,
      root,
      createdAt: new Date().toISOString(),
      entries: renamed,
      undone: false,
    });
  }

  return { journalId, renamed, failed, usedStaging: staging };
}

/** 撤销一次改名：把 to 改回 from（同样走两阶段防覆盖） */
export function undoJournal(entries: JournalEntry[]): ApplyResult {
  const reversed: PlanItem[] = entries.map((e) => ({
    src: e.to,
    dst: e.from,
    srcName: path.basename(e.to),
    dstName: path.basename(e.from),
    status: 'ok',
  }));
  return applyPlan(reversed, '', false);
}
