import path from 'node:path';
import { parseFile } from 'music-metadata';
import exifr from 'exifr';
import type { Rule } from '../types.js';

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma', '.aiff', '.ape']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.heic', '.heif', '.avif', '.webp', '.dng', '.cr2', '.nef', '.arw']);

const cache = new Map<string, Record<string, string>>();

function pad(n: number | null | undefined, len = 2): string {
  return n === undefined || n === null || Number.isNaN(n) ? '' : String(n).padStart(len, '0');
}

function fmtDate(d: Date | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDateTime(d: Date | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${fmtDate(d)} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function extractAudio(file: string): Promise<Record<string, string>> {
  const { common } = await parseFile(file, { duration: false, skipCovers: true });
  const out: Record<string, string> = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = String(v).trim();
  };
  set('title', common.title);
  set('artist', common.artist);
  set('album', common.album);
  set('albumartist', common.albumartist);
  set('genre', common.genre?.join(', '));
  set('year', common.year);
  set('track', common.track?.no !== undefined && common.track?.no !== null ? pad(common.track.no) : undefined);
  set('disc', common.disk?.no !== undefined && common.disk?.no !== null ? pad(common.disk.no) : undefined);
  set('comment', typeof common.comment?.[0] === 'string' ? common.comment[0] : (common.comment?.[0] as any)?.text);
  set('composer', common.composer?.join(', '));
  set('dateTime', fmtDate(common.date ? new Date(common.date) : undefined));
  return out;
}

async function extractImage(file: string): Promise<Record<string, string>> {
  const raw: any = await exifr.parse(file, {
    pick: [
      'DateTimeOriginal',
      'CreateDate',
      'ModifyDate',
      'Make',
      'Model',
      'ISO',
      'FNumber',
      'ExposureTime',
      'FocalLength',
      'ExifImageWidth',
      'ExifImageHeight',
      'LensModel',
    ],
  });
  const out: Record<string, string> = {};
  if (!raw) return out;
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = String(v).trim();
  };
  const d: Date | undefined = raw.DateTimeOriginal ?? raw.CreateDate ?? raw.ModifyDate;
  set('dateTime', fmtDate(d));
  set('dateTimeFull', fmtDateTime(d));
  set('make', raw.Make);
  set('model', raw.Model);
  set('iso', raw.ISO);
  set('fnumber', raw.FNumber);
  set('exposure', raw.ExposureTime);
  set('focal', raw.FocalLength);
  set('width', raw.ExifImageWidth);
  set('height', raw.ExifImageHeight);
  set('lens', raw.LensModel);
  return out;
}

export async function extractMeta(file: string): Promise<Record<string, string>> {
  if (cache.has(file)) return cache.get(file)!;
  const ext = path.extname(file).toLowerCase();
  let out: Record<string, string> = {};
  try {
    if (AUDIO_EXTS.has(ext)) out = await extractAudio(file);
    else if (IMAGE_EXTS.has(ext)) out = await extractImage(file);
  } catch {
    out = {};
  }
  cache.set(file, out);
  return out;
}

export function clearMetaCache(): void {
  cache.clear();
}

/** 判断规则集里是否需要读取元标签（避免无谓的 IO） */
export function rulesNeedMeta(rules: Rule[]): boolean {
  return rules.some((r) => {
    if (!r.enabled) return false;
    if (r.type === 'meta') return true;
    if (r.type === 'script') return /\bmeta\b/.test(String(r.params?.code ?? ''));
    return false;
  });
}
