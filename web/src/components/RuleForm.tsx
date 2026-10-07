import type { Rule, RuleTypeMeta } from '../types';
import { Field, Toggle } from './ui';

function fieldVisible(type: string, key: string, params: Record<string, any>): boolean {
  if (type === 'remove') {
    if (key === 'chars') return params.mode === 'chars';
    if (key === 'from' || key === 'count' || key === 'fromEnd') return params.mode === 'range';
    if (key === 'open' || key === 'close' || key === 'inclusive') return params.mode === 'between';
  }
  if (type === 'extension' && key === 'value') return params.mode === 'set';
  if (type === 'insert' && key === 'at') return params.position === 'index';
  if (type === 'replace' && key === 'wholeWord') return !params.regex;
  if (type === 'rearrange') {
    if (key === 'pattern' || key === 'appendRest' || key === 'keepIfShort') return params.mode === 'template';
    if (key === 'join') return params.mode !== 'template';
  }
  if (type === 'pinyin' && key === 'separator') return params.mode === 'full';
  if (type === 'date' && key === 'join') return params.mode === 'prefix' || params.mode === 'suffix';
  return true;
}

export function RuleForm({
  rule,
  meta,
  onChange,
}: {
  rule: Rule;
  meta: RuleTypeMeta;
  onChange: (key: string, value: any) => void;
}) {
  const fields = meta.fields.filter((f) => fieldVisible(rule.type, f.key, rule.params));

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 pt-1">
      {fields.map((f) => {
        const value = rule.params[f.key];
        const isWide =
          f.type === 'textarea' || f.type === 'text' || f.width === 'full' || f.type === 'select';
        const wrap = isWide ? 'col-span-2' : 'col-span-1';

        if (f.type === 'checkbox') {
          return (
            <label
              key={f.key}
              className="col-span-1 flex cursor-pointer select-none items-center gap-2 py-1 text-[13px]"
            >
              <Toggle on={!!value} onChange={(v) => onChange(f.key, v)} />
              <span>{f.label}</span>
            </label>
          );
        }

        if (f.type === 'select') {
          return (
            <Field key={f.key} label={f.label} help={f.help} className={wrap}>
              <select
                className="field"
                value={value ?? ''}
                onChange={(e) => onChange(f.key, e.target.value)}
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          );
        }

        if (f.type === 'textarea') {
          return (
            <Field key={f.key} label={f.label} help={f.help} className={wrap}>
              <textarea
                className="field"
                rows={f.key === 'code' ? 5 : 3}
                placeholder={f.placeholder}
                value={value ?? ''}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            </Field>
          );
        }

        if (f.type === 'number') {
          return (
            <Field key={f.key} label={f.label} help={f.help} className={wrap}>
              <input
                type="number"
                className="field"
                placeholder={f.placeholder}
                value={value ?? ''}
                onChange={(e) => onChange(f.key, e.target.value === '' ? '' : Number(e.target.value))}
              />
            </Field>
          );
        }

        return (
          <Field key={f.key} label={f.label} help={f.help} className={wrap}>
            <input
              type="text"
              className="field"
              placeholder={f.placeholder}
              value={value ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          </Field>
        );
      })}
    </div>
  );
}
