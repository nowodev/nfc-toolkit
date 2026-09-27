import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Bytes, fromHex, toHex, uid } from './bytes';
import { NdefRec } from './ndef';
import { RecordDraft } from './records';
import type { TagInfo } from './tagops';

// ─── Tiny persisted store ───────────────────────────────────────────────────
function createStore<T>(key: string, initial: T) {
  let state = initial;
  let loaded = false;
  const listeners = new Set<() => void>();

  const load = AsyncStorage.getItem(key)
    .then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Merge objects so newly added settings get their defaults.
      state = Array.isArray(initial) ? parsed : { ...initial, ...parsed };
    })
    .catch(() => {})
    .finally(() => {
      loaded = true;
      listeners.forEach((l) => l());
    });

  return {
    get: () => state,
    ready: () => load,
    isLoaded: () => loaded,
    set(next: T | ((prev: T) => T)) {
      state = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      listeners.forEach((l) => l());
      AsyncStorage.setItem(key, JSON.stringify(state)).catch(() => {});
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

function useStore<T>(store: ReturnType<typeof createStore<T>>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

// ─── Settings ───────────────────────────────────────────────────────────────
export interface Settings {
  haptics: boolean;
  saveHistory: boolean;
  verifyAfterWrite: boolean;
  autoOpenUrls: boolean;
  continuousRead: boolean;
}

export const settingsStore = createStore<Settings>('settings.v1', {
  haptics: true,
  saveHistory: true,
  verifyAfterWrite: false,
  autoOpenUrls: false,
  continuousRead: false,
});
export const useSettings = () => useStore(settingsStore);

// ─── Scan history ───────────────────────────────────────────────────────────
export interface StoredRecord {
  tnf: number;
  type: string; // hex
  id: string; // hex
  payload: string; // hex
}

export interface HistoryEntry {
  id: string;
  time: number;
  kind: 'read' | 'write';
  name?: string;
  info: Omit<TagInfo, 'records'> & { records: StoredRecord[] };
}

export function packRecords(r: NdefRec[]): StoredRecord[] {
  return r.map((x) => ({ tnf: x.tnf, type: toHex(x.type, ''), id: toHex(x.id, ''), payload: toHex(x.payload, '') }));
}

export function unpackRecords(r: StoredRecord[]): NdefRec[] {
  return r.map((x) => ({ tnf: x.tnf, type: fromHex(x.type), id: fromHex(x.id), payload: fromHex(x.payload) }));
}

export const historyStore = createStore<HistoryEntry[]>('history.v1', []);
export const useHistory = () => useStore(historyStore);

const MAX_HISTORY = 500;

export function addHistory(kind: HistoryEntry['kind'], info: TagInfo): HistoryEntry | null {
  if (!settingsStore.get().saveHistory) return null;
  const entry: HistoryEntry = { id: uid('h'), time: Date.now(), kind, info: { ...info, records: packRecords(info.records) } };
  historyStore.set((h) => [entry, ...h].slice(0, MAX_HISTORY));
  return entry;
}

export function renameHistory(id: string, name: string) {
  historyStore.set((h) => h.map((e) => (e.id === id ? { ...e, name } : e)));
}

export function deleteHistory(id: string) {
  historyStore.set((h) => h.filter((e) => e.id !== id));
}

export function clearHistory() {
  historyStore.set([]);
}

// ─── Saved templates (record sets) ──────────────────────────────────────────
export interface Template {
  id: string;
  name: string;
  time: number;
  drafts: RecordDraft[];
}

export const templatesStore = createStore<Template[]>('templates.v1', []);
export const useTemplates = () => useStore(templatesStore);

export function saveTemplate(name: string, drafts: RecordDraft[]): Template {
  const t: Template = { id: uid('t'), name, time: Date.now(), drafts };
  templatesStore.set((all) => [t, ...all]);
  return t;
}

export function deleteTemplate(id: string) {
  templatesStore.set((all) => all.filter((t) => t.id !== id));
}

// ─── Write draft (the record list being composed) ───────────────────────────
export const draftStore = createStore<RecordDraft[]>('draft.v1', []);
export const useDraft = () => useStore(draftStore);

export function upsertDraft(d: RecordDraft) {
  draftStore.set((all) => (all.some((x) => x.id === d.id) ? all.map((x) => (x.id === d.id ? d : x)) : [...all, d]));
}

export function removeDraft(id: string) {
  draftStore.set((all) => all.filter((x) => x.id !== id));
}

export function moveDraft(id: string, dir: -1 | 1) {
  draftStore.set((all) => {
    const i = all.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= all.length) return all;
    const copy = [...all];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });
}

/** A raw message staged for copy/clone. Not persisted across launches on purpose. */
let clipboardMessage: { bytes: Bytes; source: string } | null = null;
export const copyBuffer = {
  get: () => clipboardMessage,
  set: (v: typeof clipboardMessage) => {
    clipboardMessage = v;
  },
};

// ─── Backup ─────────────────────────────────────────────────────────────────
export interface Backup {
  app: 'nfc-toolkit';
  version: 1;
  exportedAt: string;
  history: HistoryEntry[];
  templates: Template[];
}

export function makeBackup(): Backup {
  return {
    app: 'nfc-toolkit',
    version: 1,
    exportedAt: new Date().toISOString(),
    history: historyStore.get(),
    templates: templatesStore.get(),
  };
}

export function restoreBackup(raw: string): { history: number; templates: number } {
  const b = JSON.parse(raw) as Partial<Backup>;
  if (b.app !== 'nfc-toolkit') throw new Error('This file is not an NFC Toolkit backup.');
  const hist = Array.isArray(b.history) ? b.history : [];
  const tmpl = Array.isArray(b.templates) ? b.templates : [];
  const hIds = new Set(historyStore.get().map((h) => h.id));
  const tIds = new Set(templatesStore.get().map((t) => t.id));
  const newH = hist.filter((h) => !hIds.has(h.id));
  const newT = tmpl.filter((t) => !tIds.has(t.id));
  historyStore.set((h) => [...newH, ...h].sort((a, b2) => b2.time - a.time).slice(0, MAX_HISTORY));
  templatesStore.set((t) => [...newT, ...t]);
  return { history: newH.length, templates: newT.length };
}
