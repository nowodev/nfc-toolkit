import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { CancelledError, isCancel, isIOS } from '@/lib/nfc';
import { feedback } from './ui';

/**
 * Wraps an NFC operation: tracks busy state, fires haptics and shows errors.
 * Cancellations are silent. Returns undefined when the action failed or was cancelled.
 */
export function useNfcAction() {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>, opts: { errorTitle?: string; silentError?: boolean } = {}): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      const result = await fn();
      feedback.success();
      return result;
    } catch (e) {
      if (e instanceof CancelledError || isCancel(e)) return undefined;
      feedback.error();
      if (!opts.silentError) {
        const msg = e instanceof Error ? e.message : String(e);
        // iOS already shows the error inside the NFC sheet; still surface it once it closes.
        setTimeout(() => Alert.alert(opts.errorTitle ?? 'NFC error', friendly(msg)), isIOS ? 600 : 0);
      }
      return undefined;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}

export function friendly(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('tag was lost') || m.includes('tag_lost') || m.includes('taglost') || m.includes('connection lost'))
    return 'The tag moved away before the operation finished. Hold your phone still against the tag and try again.';
  if (m.includes('transceive fail') || m.includes('ioexception'))
    return 'Communication with the tag failed. Keep the phone still on the tag and try again.';
  if (m.includes('session timeout') || m.includes('timeout')) return 'Timed out waiting for a tag.';
  if (m.includes('system busy')) return 'The NFC system is busy. Wait a second and try again.';
  return msg;
}
