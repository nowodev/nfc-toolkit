import { Platform } from 'react-native';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import { Bytes, toBytes } from './bytes';

export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';

// ─── Scan UI bridge ──────────────────────────────────────────────────────────
// iOS shows its own system sheet. Android has none, so ScanOverlay subscribes here.
type ScanUiState = { visible: boolean; message: string };
type Listener = (s: ScanUiState) => void;
const listeners = new Set<Listener>();
let uiState: ScanUiState = { visible: false, message: '' };

export function subscribeScanUi(l: Listener) {
  listeners.add(l);
  l(uiState);
  return () => {
    listeners.delete(l);
  };
}

function setUi(s: ScanUiState) {
  uiState = s;
  listeners.forEach((l) => l(s));
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

let cancelRequested = false;

export async function cancelScan() {
  cancelRequested = true;
  setUi({ visible: false, message: '' });
  await NfcManager.cancelTechnologyRequest().catch(() => {});
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────
let started: Promise<boolean> | null = null;

export async function initNfc(): Promise<{ supported: boolean; enabled: boolean }> {
  if (!started) {
    started = (async () => {
      try {
        const supported = await NfcManager.isSupported();
        if (supported) await NfcManager.start();
        return supported;
      } catch {
        return false;
      }
    })();
  }
  const supported = await started;
  const enabled = supported ? await NfcManager.isEnabled().catch(() => false) : false;
  return { supported, enabled };
}

export function openNfcSettings() {
  if (isAndroid) NfcManager.goToNfcSetting().catch(() => {});
}

// ─── Sessions ───────────────────────────────────────────────────────────────
/** Everything a tag session can be opened with, per platform. */
export const TECHS = {
  // iOS: a tag-reader session covering every tag family we can talk to. NfcA maps to MIFARE/ISO14443-A.
  iosAll: [NfcTech.NfcA, NfcTech.IsoDep, NfcTech.NfcV, NfcTech.FelicaIOS],
  // Android: connect to the most informative tech first.
  androidRead: [
    NfcTech.NfcA,
    NfcTech.NfcV,
    NfcTech.IsoDep,
    NfcTech.NfcB,
    NfcTech.NfcF,
    NfcTech.Ndef,
    NfcTech.NdefFormatable,
    NfcTech.MifareClassic,
  ],
  androidWrite: [NfcTech.Ndef, NfcTech.NdefFormatable],
};

export interface SessionOptions {
  message: string;
  success?: string | ((result: unknown) => string);
}

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string') return e;
  return 'Something went wrong talking to the tag';
}

export function isCancel(e: unknown): boolean {
  if (e instanceof CancelledError) return true;
  const name = (e as any)?.constructor?.name ?? '';
  const msg = String((e as any)?.message ?? e ?? '').toLowerCase();
  return name === 'UserCancel' || msg.includes('cancel') || msg.includes('user_canceled');
}

/**
 * Opens a tag session with the given techs, runs `fn` against the connected tag and tears
 * everything down. Returns the value from fn, throws CancelledError if the user bailed.
 */
export async function withTag<T>(techs: NfcTech[], opts: SessionOptions, fn: (tech: string) => Promise<T>): Promise<T> {
  const { supported, enabled } = await initNfc();
  if (!supported) throw new Error('This device does not support NFC.');
  if (!enabled) throw new Error('NFC is turned off. Enable it in system settings and try again.');

  cancelRequested = false;
  if (isAndroid) setUi({ visible: true, message: opts.message });
  try {
    let tech: string | null;
    try {
      tech = await NfcManager.requestTechnology(techs, { alertMessage: opts.message });
    } catch (e) {
      if (cancelRequested || isCancel(e)) throw new CancelledError();
      throw e;
    }
    if (cancelRequested) throw new CancelledError();
    const result = await fn(tech ?? '');
    if (isIOS) {
      const msg = typeof opts.success === 'function' ? opts.success(result) : opts.success ?? 'Done ✓';
      await NfcManager.setAlertMessageIOS(msg).catch(() => {});
    }
    return result;
  } catch (e) {
    if (cancelRequested || e instanceof CancelledError) throw new CancelledError();
    if (isIOS) await NfcManager.invalidateSessionWithErrorIOS(errorMessage(e)).catch(() => {});
    throw e instanceof Error ? e : new Error(errorMessage(e));
  } finally {
    if (isAndroid) setUi({ visible: false, message: '' });
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

/** Updates the prompt mid-session (iOS sheet or Android overlay). */
export async function setScanMessage(message: string) {
  if (isIOS) await NfcManager.setAlertMessageIOS(message).catch(() => {});
  else if (uiState.visible) setUi({ visible: true, message });
}

// ─── Low-level I/O ──────────────────────────────────────────────────────────
export async function transceiveA(cmd: Bytes): Promise<Bytes> {
  return toBytes(await NfcManager.nfcAHandler.transceive(cmd));
}

export async function transceiveV(cmd: Bytes): Promise<Bytes> {
  return toBytes(await NfcManager.nfcVHandler.transceive(cmd));
}

export async function transceiveIsoDep(apdu: Bytes): Promise<Bytes> {
  if (isIOS) {
    const r = await NfcManager.sendCommandAPDUIOS(apdu);
    return [...toBytes(r.response), r.sw1 & 0xff, r.sw2 & 0xff];
  }
  return toBytes(await NfcManager.isoDepHandler.transceive(apdu));
}

/** Android only: swap the live connection to another tech on the same tag. */
export async function reconnectAndroid(tech: NfcTech): Promise<boolean> {
  if (!isAndroid) return false;
  try {
    await NfcManager.close();
  } catch {
    /* already closed */
  }
  try {
    await NfcManager.connect([tech]);
    return true;
  } catch {
    return false;
  }
}

export { NfcManager, NfcTech };
