import { Platform } from 'react-native';
import NfcManager, { NfcError, NfcEvents, NfcTech } from 'react-native-nfc-manager';
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

// ─── Diagnostics ────────────────────────────────────────────────────────────
// A small timeline of session events, viewable in Settings, for debugging on device.
export interface DiagEntry {
  t: number;
  msg: string;
}
let diag: DiagEntry[] = [];
const diagListeners = new Set<() => void>();

export function logDiag(msg: string) {
  diag = [...diag.slice(-299), { t: Date.now(), msg }];
  diagListeners.forEach((l) => l());
}
export const getDiag = () => diag;
export function clearDiag() {
  diag = [];
  diagListeners.forEach((l) => l());
}
export function subscribeDiag(l: () => void) {
  diagListeners.add(l);
  return () => {
    diagListeners.delete(l);
  };
}

// ─── iOS session gate ───────────────────────────────────────────────────────
// Cancelling an iOS session returns immediately, but UIKit only reports it closed
// (didInvalidateWithError) after the sheet animates away. The library's handler for that
// late event resets its state and fails whatever request is pending, and iOS 27 also
// terminates (error 202) a session begun while the previous sheet is still going away.
// So each new iOS session waits for the previous one to report closed, then settles.
const SETTLE_MS = 700;
let sessionClosed: Promise<void> = Promise.resolve();
let resolveSessionClosed: (() => void) | null = null;
let lastClosedAt = 0;

function markSessionOpening() {
  sessionClosed = new Promise((resolve) => {
    resolveSessionClosed = resolve;
  });
}

function onSessionClosed() {
  lastClosedAt = Date.now();
  resolveSessionClosed?.();
  resolveSessionClosed = null;
}

/** Releases the gate if UIKit never reports the close. Bound to the current session. */
function armCloseFallback() {
  const thisSession = resolveSessionClosed;
  setTimeout(() => {
    if (thisSession && resolveSessionClosed === thisSession) {
      logDiag('no close event after 4s; releasing gate');
      onSessionClosed();
    }
  }, 4000);
}

async function waitForPreviousSession() {
  await sessionClosed;
  const wait = lastClosedAt + SETTLE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────
let started: Promise<boolean> | null = null;

export async function initNfc(): Promise<{ supported: boolean; enabled: boolean }> {
  if (!started) {
    started = (async () => {
      try {
        const supported = await NfcManager.isSupported();
        if (supported) await NfcManager.start();
        if (supported && isIOS)
          NfcManager.setEventListener(NfcEvents.SessionClosed, (err?: unknown) => {
            logDiag(`session closed${err ? `: ${errorName(err)}` : ''}`);
            onSessionClosed();
          });
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

// iOS errors arrive as NfcError subclasses with no message, so name them by type.
// (instanceof, not constructor.name: release builds minify class names.)
const ERRORS: [new (...args: any[]) => Error, string, string][] = [
  [NfcError.UserCancel, 'UserCancel', 'Cancelled.'],
  [NfcError.Timeout, 'Timeout', 'Timed out waiting for a tag.'],
  [NfcError.SystemBusy, 'SystemBusy', 'The NFC system is busy. Wait a moment and try again.'],
  [NfcError.TagConnectionLost, 'TagConnectionLost', 'The tag moved away before the operation finished. Hold your phone still against the tag and try again.'],
  [NfcError.SessionInvalidated, 'SessionInvalidated', 'The NFC session ended unexpectedly. Try again.'],
  [NfcError.TagNotConnected, 'TagNotConnected', 'Lost connection to the tag. Try again.'],
  [NfcError.RetryExceeded, 'RetryExceeded', 'The tag stopped responding. Try again.'],
  [NfcError.TagResponseError, 'TagResponseError', 'The tag returned an error for that command.'],
  [NfcError.TagNotWritable, 'TagNotWritable', 'This tag is read-only.'],
  [NfcError.TagSizeTooSmall, 'TagSizeTooSmall', 'The data is too large for this tag.'],
  [NfcError.TagUpdateFailure, 'TagUpdateFailure', 'Writing to the tag failed. Hold still and try again.'],
  [NfcError.ZeroLengthMessage, 'ZeroLengthMessage', 'There is no data to write.'],
  [NfcError.FirstNdefInvalid, 'FirstNdefInvalid', 'The tag’s data is invalid or corrupted.'],
  [NfcError.UnsupportedFeature, 'UnsupportedFeature', 'This tag doesn’t support that operation.'],
  [NfcError.SecurityViolation, 'SecurityViolation', 'The tag refused the operation.'],
  [NfcError.RadioDisabled, 'RadioDisabled', 'NFC is turned off.'],
  [NfcError.Unexpected, 'Unexpected (202)', 'The NFC system hit an unexpected error. Try again.'],
];

function errorName(e: unknown): string {
  for (const [type, name] of ERRORS) if (e instanceof type) return name;
  return (e instanceof Error && e.message) || String(e);
}

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  for (const [type, , text] of ERRORS) if (e instanceof type) return text;
  if (typeof e === 'string' && e) return e;
  return 'Something went wrong talking to the tag.';
}

export function isCancel(e: unknown): boolean {
  if (e instanceof CancelledError || e instanceof NfcError.UserCancel) return true;
  const msg = String((e as any)?.message ?? e ?? '').toLowerCase();
  return msg.includes('cancel');
}

const START_RETRIES = 2;
const QUICK_FAIL_MS = 3000;

/**
 * iOS: begins a tag-reader session. A session that iOS kills straight away (202 / busy)
 * never reached a tag, so it's retried rather than reported.
 */
async function requestIOS(techs: NfcTech[], message: string): Promise<string | null> {
  for (let attempt = 1; ; attempt++) {
    await waitForPreviousSession();
    markSessionOpening();
    const t0 = Date.now();
    logDiag(`session start #${attempt}`);
    try {
      const tech = await NfcManager.requestTechnology(techs, { alertMessage: message });
      logDiag(`tag connected (${tech}) after ${Date.now() - t0}ms`);
      return tech;
    } catch (e) {
      const elapsed = Date.now() - t0;
      logDiag(`session start failed after ${elapsed}ms: ${errorName(e)}`);
      const transient = e instanceof NfcError.Unexpected || e instanceof NfcError.SystemBusy;
      if (!cancelRequested && transient && elapsed < QUICK_FAIL_MS && attempt <= START_RETRIES) {
        armCloseFallback();
        continue;
      }
      throw e;
    }
  }
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
      tech = isIOS ? await requestIOS(techs, opts.message) : await NfcManager.requestTechnology(techs, { alertMessage: opts.message });
    } catch (e) {
      if (cancelRequested || isCancel(e)) throw new CancelledError();
      throw e;
    }
    if (cancelRequested) throw new CancelledError();
    const result = await fn(tech ?? '');
    logDiag('operation succeeded');
    if (isIOS) {
      const msg = typeof opts.success === 'function' ? opts.success(result) : opts.success ?? 'Done ✓';
      await NfcManager.setAlertMessageIOS(msg).catch(() => {});
    }
    return result;
  } catch (e) {
    if (cancelRequested || e instanceof CancelledError) {
      logDiag('cancelled');
      throw new CancelledError();
    }
    logDiag(`operation failed: ${errorName(e)}`);
    if (isIOS) await NfcManager.invalidateSessionWithErrorIOS(errorMessage(e)).catch(() => {});
    throw new Error(errorMessage(e));
  } finally {
    if (isAndroid) setUi({ visible: false, message: '' });
    await NfcManager.cancelTechnologyRequest().catch(() => {});
    if (isIOS) armCloseFallback();
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
