import { useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  FolderDown,
  Layers,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { Empty, Field, Panel, Toggle } from './ui';
import { RuleForm } from './RuleForm';
import type { RuleType, Scope } from '../types';

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: 'name', label: '主名' },
  { value: 'ext', label: '扩展名' },
  { value: 'full', label: '整体' },
];

function AddRuleMenu({ onPick }: { onPick: (t: RuleType) => void }) {
  const ruleTypes = useStore((s) => s.ruleTypes);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-sm btn-primary" onClick={() => setOpen((v) => !v)}>
        <Plus size={14} /> 添加规则
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="panel animate-in absolute right-0 z-40 mt-2 max-h-[420px] w-[290px] overflow-y-auto p-1.5"
            style={{ borderColor: 'var(--border-strong)' }}
          >
            {ruleTypes.map((r) => (
              <button
                key={r.type}
                className="row-hover flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left"
                onClick={() => {
                  onPick(r.type);
                  setOpen(false);
                }}
              >
                <span className="text-[13px] font-medium">{r.label}</span>
                <span className="muted text-[11px] leading-snug">{r.description}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function RuleStack() {
  const rules = useStore((s) => s.rules);
  const ruleTypes = useStore((s) => s.ruleTypes);
  const presets = useStore((s) => s.presets);
  const presetId = useStore((s) => s.presetId);
  const presetName = useStore((s) => s.presetName);
  const addRule = useStore((s) => s.addRule);
  const updateRule = useStore((s) => s.updateRule);
  const updateParam = useStore((s) => s.updateParam);
  const moveRule = useStore((s) => s.moveRule);
  const duplicateRule = useStore((s) => s.duplicateRule);
  const removeRule = useStore((s) => s.removeRule);
  const openPreset = useStore((s) => s.openPreset);
  const savePreset = useStore((s) => s.savePreset);
  const deletePreset = useStore((s) => s.deletePreset);
  const newRuleSet = useStore((s) => s.newRuleSet);

  const [savingAs, setSavingAs] = useState(false);
  const [nameInput, setNameInput] = useState(presetName);
  const [folderInput, setFolderInput] = useState('');
  // 折叠状态：记录被折叠的规则 id
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const allCollapsed = rules.length >= 2 && rules.every((r) => collapsed.has(r.id));
  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // 新增/复制的规则自动展开
  const addAndExpand = <T extends string>(fn: (arg: T) => void, arg: T) => {
    const before = new Set(rules.map((r) => r.id));
    fn(arg);
    const added = useStore.getState().rules.find((r) => !before.has(r.id));
    if (added)
      setCollapsed((prev) => {
        const n = new Set(prev);
        n.delete(added.id);
        return n;
      });
  };

  const grouped = useMemo(() => {
    const map = new Map<string, typeof presets>();
    for (const p of presets) {
      const key = p.folder ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [presets]);

  const handleSave = async () => {
    if (presetId) {
      await savePreset(presetName, presets.find((p) => p.id === presetId)?.folder ?? null);
    } else {
      setNameInput(presetName === '未命名预设' ? '' : presetName);
      setSavingAs(true);
    }
  };

  const submitSaveAs = async () => {
    const name = nameInput.trim();
    if (!name) return;
    await savePreset(name, folderInput.trim() || null);
    setSavingAs(false);
  };

  return (
    <Panel
      className="flex-1"
      title="规则链"
      icon={<Layers size={15} />}
      subtitle={rules.length ? `${rules.filter((r) => r.enabled).length}/${rules.length} 启用` : undefined}
      actions={
        <>
          <button
            className="btn btn-sm"
            title="新建空白规则集"
            onClick={() => {
              newRuleSet();
              setNameInput('');
            }}
          >
            <Sparkles size={13} /> 新建
          </button>
          <button className="btn btn-sm" onClick={handleSave}>
            <Save size={13} /> {presetId ? '保存' : '另存为'}
          </button>
          {rules.length >= 2 && (
            <button
              className="btn btn-sm"
              title={allCollapsed ? '全部展开' : '全部折叠'}
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(rules.map((r) => r.id)))}
            >
              {allCollapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
            </button>
          )}
          <AddRuleMenu onPick={(t) => addAndExpand(addRule, t)} />
        </>
      }
      bodyClassName="flex min-h-0 flex-col"    >
      {/* 预设栏 */}
      <div className="flex flex-none flex-col gap-2 border-b p-2.5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <FolderDown size={14} className="muted flex-none" />
          <select
            className="field !py-1.5"
            value={presetId ?? ''}
            onChange={(e) => e.target.value && openPreset(e.target.value)}
          >
            <option value="">选择预设…</option>
            {grouped.map(([folder, list]) => (
              <optgroup key={folder || '__root'} label={folder || '未分组'}>
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{p.rules.length} 条规则）
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="flex flex-none items-center gap-1">
            <div className="mono muted max-w-[110px] truncate text-[12px]" title={presetName}>
              {presetName}
            </div>
            {presetId && (
              <button
                className="icon-btn h-7 w-7"
                title="删除该预设"
                onClick={() => deletePreset(presetId)}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {savingAs && (
          <div className="animate-in grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <Field label="预设名称">
              <input
                className="field"
                autoFocus
                value={nameInput}
                placeholder="例如 照片按日期改名"
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitSaveAs()}
              />
            </Field>
            <Field label="分组（可选）">
              <input
                className="field"
                value={folderInput}
                placeholder="例如 照片"
                onChange={(e) => setFolderInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitSaveAs()}
              />
            </Field>
            <div className="flex gap-1 pb-0.5">
              <button className="btn btn-sm" onClick={() => setSavingAs(false)}>
                <X size={13} />
              </button>
              <button className="btn btn-sm btn-primary" onClick={submitSaveAs}>
                保存
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 规则列表 */}
      <div className="scroll-area min-h-0 flex-1 p-2.5">
        {rules.length === 0 ? (
          <Empty
            icon={<Layers size={26} />}
            title="规则链是空的"
            hint="点击右上角「添加规则」，从插入、替换、正则、序列号、重排、拼音转写、日期重格式化、元标签等里挑一个开始。规则按从上到下的顺序依次作用。"
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {rules.map((rule, i) => {
              const meta = ruleTypes.find((r) => r.type === rule.type);
              if (!meta) return null;
              const isCollapsed = collapsed.has(rule.id);
              return (
                <div
                  key={rule.id}
                  className={clsx('panel !shadow-none transition-opacity', !rule.enabled && 'opacity-55')}
                  style={{ background: 'var(--panel-2)' }}
                >
                  <div
                    className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1.5 px-2.5 py-2 select-none"
                    title={isCollapsed ? '展开' : '折叠'}
                    onClick={() => toggleCollapsed(rule.id)}
                  >
                    <span
                      className="mono flex h-5 w-5 flex-none items-center justify-center rounded-md text-[11px]"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      {i + 1}
                    </span>
                    <span className="whitespace-nowrap text-[13px] font-semibold">
                      {rule.label || meta.label}
                    </span>
                    <span className="muted min-w-0 flex-1 truncate text-[11px]">
                      · {meta.description}
                    </span>

                    <div
                      className="ml-auto flex flex-none items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {meta.scope && (
                        <select
                          className="field !w-auto !pl-2.5 !pr-7 !py-1 !text-[11px]"
                          value={rule.scope}
                          title="作用对象"
                          onChange={(e) => updateRule(rule.id, { scope: e.target.value as Scope })}
                        >
                          {SCOPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <button className="icon-btn h-6 w-6" title="上移" disabled={i === 0} onClick={() => moveRule(rule.id, -1)}>
                        <ChevronUp size={14} />
                      </button>
                      <button
                        className="icon-btn h-6 w-6"
                        title="下移"
                        disabled={i === rules.length - 1}
                        onClick={() => moveRule(rule.id, 1)}
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button className="icon-btn h-6 w-6" title="复制" onClick={() => addAndExpand(duplicateRule, rule.id)}>
                        <Copy size={13} />
                      </button>
                      <button className="icon-btn h-6 w-6" title="删除" onClick={() => removeRule(rule.id)}>
                        <Trash2 size={13} />
                      </button>
                      <Toggle
                        on={rule.enabled}
                        title={rule.enabled ? '停用' : '启用'}
                        onChange={(v) => updateRule(rule.id, { enabled: v })}
                      />
                      <button
                        className="icon-btn h-6 w-6"
                        title={isCollapsed ? '展开参数' : '折叠参数'}
                        onClick={() => toggleCollapsed(rule.id)}
                      >
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="px-2.5 pb-3">
                      <RuleForm
                        rule={rule}
                        meta={meta}
                        onChange={(key, value) => updateParam(rule.id, key, value)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}
