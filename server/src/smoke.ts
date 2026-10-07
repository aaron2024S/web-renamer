/**
 * 规则引擎 / 执行器冒烟测试：node --import tsx src/smoke.ts
 * 覆盖：基础规则、序列号、仅改大小写、交换（成环）、冲突检测、撤销。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { initDb, getJournal, markJournalUndone } from './db.js';
import { buildPlan } from './rename/planner.js';
import { applyPlan, undoJournal } from './rename/executor.js';
import type { PlanItem, Rule } from './types.js';
import type { RuleType } from './types.js';

let passed = 0;
function ok(name: string) {
  passed++;
  console.log(`  \u2713 ${name}`);
}

function rule(type: RuleType, params: Record<string, any>, extra: Partial<Rule> = {}): Rule {
  return { id: `${type}-${Math.random().toString(16).slice(2)}`, type, enabled: true, scope: extra.scope ?? 'name', params, ...extra };
}

async function newWorkspace(): Promise<{ dir: string; roots: string[] }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'renamer-smoke-'));
  return { dir, roots: [dir] };
}

function touch(dir: string, ...names: string[]): string[] {
  return names.map((n) => {
    const p = path.join(dir, n);
    fs.writeFileSync(p, 'x');
    return p;
  });
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'renamer-cfg-'));
  initDb(tmpRoot);

  /* ---------- 1. 基础规则：替换 + 大小写 + 扩展名 ---------- */
  console.log('1) 基础规则（替换 / 大小写 / 扩展名）');
  {
    const { dir, roots } = await newWorkspace();
    const files = touch(dir, 'Hello World.TXT');
    const rules: Rule[] = [
      rule('replace', { find: 'World', replaceWith: 'ReNamer', regex: false, caseSensitive: true }),
      rule('case', { mode: 'lower' }),
      rule('extension', { mode: 'lower' }),
    ];
    const plan = await buildPlan(files, rules, roots);
    assert.strictEqual(plan.items[0].dstName, 'hello renamer.txt');
    assert.strictEqual(plan.summary.canApply, true);
    const res = applyPlan(plan.items, plan.root, true);
    assert.strictEqual(res.renamed.length, 1);
    assert.ok(fs.existsSync(path.join(dir, 'hello renamer.txt')));
    ok('替换 + 小写 + 扩展名 → hello renamer.txt');
  }

  /* ---------- 2. 序列号 ---------- */
  console.log('2) 序列号（补零 / 后缀）');
  {
    const { dir, roots } = await newWorkspace();
    const files = touch(dir, 'a.txt', 'b.txt', 'c.txt');
    const rules: Rule[] = [rule('serialize', { mode: 'suffix', start: 1, step: 1, padding: 3 })];
    const plan = await buildPlan(files, rules, roots);
    const names = plan.items.map((i) => i.dstName).sort();
    assert.deepStrictEqual(names, ['a001.txt', 'b002.txt', 'c003.txt']);
    ok('a/b/c.txt → a001/b002/c003.txt');
  }

  /* ---------- 3. 仅改大小写（需要两阶段） ---------- */
  console.log('3) 仅改大小写（大小写不敏感文件系统陷阱）');
  {
    const { dir, roots } = await newWorkspace();
    const files = touch(dir, 'Report.TXT');
    const rules: Rule[] = [rule('case', { mode: 'lower' }), rule('extension', { mode: 'lower' })];
    const plan = await buildPlan(files, rules, roots);
    const res = applyPlan(plan.items, plan.root, false);
    assert.strictEqual(res.usedStaging, true, '应走两阶段');
    assert.strictEqual(res.failed.length, 0);
    const entries = fs.readdirSync(dir);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0], 'report.txt');
    ok('Report.TXT → report.txt（两阶段）');
  }

  /* ---------- 4. 交换（成环） ---------- */
  console.log('4) 文件交换（A↔B 成环）');
  {
    const { dir, roots } = await newWorkspace();
    const [a, b] = touch(dir, 'A.txt', 'B.txt');
    const items: PlanItem[] = [
      { src: a, dst: path.join(dir, 'B.txt'), srcName: 'A.txt', dstName: 'B.txt', status: 'ok' },
      { src: b, dst: path.join(dir, 'A.txt'), srcName: 'B.txt', dstName: 'A.txt', status: 'ok' },
    ];
    const res = applyPlan(items, dir, false);
    assert.strictEqual(res.usedStaging, true);
    assert.strictEqual(res.renamed.length, 2);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['A.txt', 'B.txt']);
    ok('A.txt ↔ B.txt 无覆盖丢失');
  }

  /* ---------- 5. 冲突检测 ---------- */
  console.log('5) 冲突检测（多个文件撞名）');
  {
    const { dir, roots } = await newWorkspace();
    const files = touch(dir, 'x-1.txt', 'x-2.txt');
    // 把数字抹掉后两个文件都会变成 x-.txt → 撞名
    const rules: Rule[] = [rule('regex', { pattern: '\\d+', replacement: '', flags: 'g' })];
    const plan = await buildPlan(files, rules, roots);
    assert.strictEqual(plan.summary.conflict, 2);
    assert.strictEqual(plan.summary.canApply, false);
    ok('撞名时阻止执行');
  }

  /* ---------- 6. 正则捕获组 ---------- */
  console.log('6) 正则捕获组');
  {
    const { dir, roots } = await newWorkspace();
    const files = touch(dir, 'S01E05.mkv');
    const rules: Rule[] = [rule('regex', { pattern: '^S(\\d+)E(\\d+)$', replacement: '第$1季-第$2集', flags: 'i' })];
    const plan = await buildPlan(files, rules, roots);
    assert.strictEqual(plan.items[0].dstName, '第01季-第05集.mkv');
    ok('S01E05.mkv → 第01季-第05集.mkv');
  }

  /* ---------- 7. 撤销 ---------- */
  console.log('7) 撤销');
  {
    const { dir, roots } = await newWorkspace();
    const files = touch(dir, 'one.txt', 'two.txt');
    const rules: Rule[] = [rule('insert', { position: 'prefix', text: 'new_' })];
    const plan = await buildPlan(files, rules, roots);
    const res = applyPlan(plan.items, plan.root, true);
    assert.ok(res.journalId);
    assert.ok(fs.existsSync(path.join(dir, 'new_one.txt')));

    const journal = getJournal(res.journalId!);
    assert.ok(journal);
    const undone = undoJournal(journal!.entries);
    markJournalUndone(journal!.id);
    assert.strictEqual(undone.renamed.length, 2);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['one.txt', 'two.txt']);
    ok('执行后可完整还原');
  }

  /* ---------- 8. 重排 ---------- */
  console.log('8) 重排（片段模板 / 倒序）');
  {
    const { dir, roots } = await newWorkspace();
    const files = touch(dir, '会议纪要 2024.txt');
    const rules: Rule[] = [
      rule('rearrange', { mode: 'template', delimiter: ' ', pattern: '$2 $1', appendRest: true }),
    ];
    const plan = await buildPlan(files, rules, roots);
    assert.strictEqual(plan.items[0].dstName, '2024 会议纪要.txt');

    const files2 = touch(dir, 'a-b-c.txt');
    const rules2: Rule[] = [rule('rearrange', { mode: 'reverse', delimiter: '-', join: '-' })];
    const plan2 = await buildPlan(files2, rules2, roots);
    assert.strictEqual(plan2.items[0].dstName, 'c-b-a.txt');

    // 片段不足：保留原名，而不是拼出带悬空分隔符的坏名字
    const files3 = touch(dir, '你好世界.txt');
    const plan3 = await buildPlan(files3, rules, roots);
    assert.strictEqual(plan3.items[0].status, 'unchanged');
    ok('「会议纪要 2024」→「2024 会议纪要」；a-b-c → c-b-a；片段不足不动');
  }

  /* ---------- 9. 拼音转写 ---------- */
  console.log('9) 拼音转写（全拼 / 首字母）');
  {
    const { dir, roots } = await newWorkspace();
    const files = touch(dir, '你好世界.txt');
    const full = await buildPlan(
      files,
      [rule('pinyin', { mode: 'full', tone: 'none', separator: ' ', keepNonChinese: true, lowercase: true, v: true })],
      roots,
    );
    assert.strictEqual(full.items[0].dstName, 'ni hao shi jie.txt');

    const initials = await buildPlan(
      files,
      [rule('pinyin', { mode: 'initials', tone: 'none', keepNonChinese: true, lowercase: true })],
      roots,
    );
    assert.strictEqual(initials.items[0].dstName, 'nhsj.txt');
    ok('你好世界 → ni hao shi jie / nhsj');
  }

  /* ---------- 10. 日期重格式化 ---------- */
  console.log('10) 日期重格式化（自动识别 / 自定义源格式）');
  {
    const { dir, roots } = await newWorkspace();
    const files = touch(dir, 'IMG_20241007_draft.jpg');
    const auto = await buildPlan(files, [rule('date', { mode: 'replace', pattern: '', output: 'YYYY-MM-DD' })], roots);
    assert.strictEqual(auto.items[0].dstName, 'IMG_2024-10-07_draft.jpg');

    const cn = touch(dir, '会议2024年10月7日纪要.txt');
    const custom = await buildPlan(
      cn,
      [rule('date', { mode: 'replace', pattern: 'YYYY年M月D日', output: 'YYYY-MM-DD' })],
      roots,
    );
    assert.strictEqual(custom.items[0].dstName, '会议2024-10-07纪要.txt');

    const prefix = touch(dir, 'holiday 2024-10-07.txt');
    const moved = await buildPlan(
      prefix,
      [rule('date', { mode: 'prefix', pattern: 'YYYY-MM-DD', output: 'YYYY-MM-DD', join: '_' })],
      roots,
    );
    assert.strictEqual(moved.items[0].dstName, '2024-10-07_holiday.txt');
    ok('20241007 → 2024-10-07；中文日期 → 2024-10-07；日期移到开头');
  }

  console.log(`\n全部通过：${passed} 项\n`);
}

main().catch((e) => {
  console.error('\n冒烟测试失败：', e);
  process.exit(1);
});
