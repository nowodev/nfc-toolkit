import { Bytes, fromHex, toBytes, toHex, utf8Encode, indexOfSeq } from './bytes';
import { NdefRec, decodeMessage, encodeMessage, fromNative, EMPTY_RECORD, uriRecord } from './ndef';
import {
  NfcManager,
  NfcTech,
  TECHS,
  isAndroid,
  isIOS,
  setScanMessage,
  transceiveA,
  transceiveIsoDep,
  transceiveV,
  withTag,
} from './nfc';
import * as t2 from './type2';

// ─── Types ──────────────────────────────────────────────────────────────────
export interface TagInfo {
  uid: string;
  techTypes: string[];
  ndefType?: string;
  maxSize?: number;
  usedSize: number;
  writable?: boolean;
  canMakeReadOnly?: boolean;
  ndefSupported: boolean;
  records: NdefRec[];
  messageHex: string;
  chip?: {
    name: string;
    version?: string;
    signature?: string;
    counter?: number | null;
    totalPages?: number;
    userBytes?: number;
    passwordProtected?: boolean;
    readProtected?: boolean;
  };
  iso15693?: { blockCount?: number; blockSize?: number; dsfid?: number; afi?: number; icReference?: number };
  iso7816?: { historicalBytes?: string; applicationData?: string; initialSelectedAID?: string };
  felica?: { idm?: string; systemCode?: string };
}

function shortTech(t: string) {
  return t.replace('android.nfc.tech.', '');
}

const IOS_TECH_NAMES: Record<string, string> = {
  mifare: 'ISO 14443-A (MIFARE)',
  iso15693: 'ISO 15693 (NfcV)',
  IsoDep: 'ISO 14443-4 (IsoDep)',
  felica: 'FeliCa (NfcF)',
};

const NDEF_TYPE_NAMES: Record<string, string> = {
  'org.nfcforum.ndef.type1': 'NFC Forum Type 1',
  'org.nfcforum.ndef.type2': 'NFC Forum Type 2',
  'org.nfcforum.ndef.type3': 'NFC Forum Type 3',
  'org.nfcforum.ndef.type4': 'NFC Forum Type 4',
  'com.nxp.ndef.mifareclassic': 'MIFARE Classic',
};

// ─── Read ───────────────────────────────────────────────────────────────────
async function probeType2(info: TagInfo) {
  const chip = await t2.identify();
  info.chip = {
    name: chip.name,
    version: chip.version ? toHex(chip.version) : undefined,
    totalPages: chip.spec?.totalPages,
    userBytes: chip.spec?.userBytes,
  };
  const prot = await t2.readProtection(chip);
  if (prot) {
    info.chip.passwordProtected = prot.auth0 < (chip.spec?.totalPages ?? 0);
    info.chip.readProtected = info.chip.passwordProtected && prot.protectReads;
  }
  const sig = chip.version ? await t2.readSignature() : null;
  if (sig) info.chip.signature = toHex(sig, '');
  if (chip.spec?.counter && (prot?.counterEnabled ?? true)) info.chip.counter = await t2.readCounter();
}

async function probeIso15693Android(info: TagInfo) {
  try {
    // Get System Info, high data rate
    const r = await transceiveV([0x02, 0x2b]);
    if (r[0] & 0x01) return;
    const infoFlags = r[1];
    let i = 10; // flags + infoFlags + 8 byte UID
    const out: TagInfo['iso15693'] = {};
    if (infoFlags & 0x01) out.dsfid = r[i++];
    if (infoFlags & 0x02) out.afi = r[i++];
    if (infoFlags & 0x04) {
      out.blockCount = r[i++] + 1;
      out.blockSize = (r[i++] & 0x1f) + 1;
    }
    if (infoFlags & 0x08) out.icReference = r[i++];
    info.iso15693 = out;
  } catch {
    /* not every NfcV tag supports this */
  }
}

async function probeIso15693IOS(info: TagInfo) {
  try {
    const s = await NfcManager.iso15693HandlerIOS.getSystemInfo(0x02);
    info.iso15693 = { blockCount: s.blockCount, blockSize: s.blockSize, dsfid: s.dsfid, afi: s.afi, icReference: s.icReference };
  } catch {
    /* ignore */
  }
}

export async function readTag(): Promise<TagInfo> {
  return withTag(isIOS ? TECHS.iosAll : TECHS.androidRead, { message: 'Hold your phone near an NFC tag', success: 'Tag read ✓' }, async (tech) => {
    const tag: any = (await NfcManager.getTag()) ?? {};
    const info: TagInfo = {
      uid: (tag.id ?? '').toUpperCase().replace(/(..)(?=.)/g, '$1:'),
      techTypes: [],
      ndefSupported: false,
      records: [],
      usedSize: 0,
      messageHex: '',
    };

    if (isAndroid) {
      info.techTypes = (tag.techTypes ?? []).map(shortTech);
      info.ndefSupported = info.techTypes.includes('Ndef');
      info.ndefType = tag.type ? NDEF_TYPE_NAMES[tag.type] ?? tag.type : undefined;
      info.maxSize = tag.maxSize;
      info.writable = tag.isWritable;
      info.canMakeReadOnly = tag.canMakeReadOnly ?? undefined;
      info.records = fromNative(tag.ndefMessage);
      const t = info.techTypes;
      if (tech === NfcTech.NfcA && (t.includes('MifareUltralight') || (!t.includes('IsoDep') && !t.includes('MifareClassic')))) {
        await probeType2(info);
      } else if (tech === NfcTech.NfcV) {
        await probeIso15693Android(info);
      }
    } else {
      info.techTypes = [IOS_TECH_NAMES[tech] ?? tech];
      if (tag.historicalBytes || tag.initialSelectedAID)
        info.iso7816 = {
          historicalBytes: tag.historicalBytes ? toHex(toBytes(tag.historicalBytes)) : undefined,
          applicationData: tag.applicationData ? toHex(toBytes(tag.applicationData)) : undefined,
          initialSelectedAID: tag.initialSelectedAID,
        };
      if (tag.idm) info.felica = { idm: tag.idm, systemCode: tag.systemCode };
      if (!info.uid && tag.idm) info.uid = String(tag.idm).toUpperCase().replace(/(..)(?=.)/g, '$1:');
      try {
        const status = await NfcManager.ndefHandler.getNdefStatus();
        info.ndefSupported = status.status !== 1;
        info.writable = status.status === 2;
        info.maxSize = status.capacity;
      } catch {
        info.ndefSupported = false;
      }
      if (info.ndefSupported) {
        try {
          const msg: any = await NfcManager.ndefHandler.getNdefMessage();
          info.records = fromNative(msg?.ndefMessage);
        } catch {
          // Empty NDEF tags raise an error on iOS.
        }
      }
      if (tech === 'mifare') await probeType2(info);
      else if (tech === 'iso15693') await probeIso15693IOS(info);
    }

    if (info.records.length) {
      const bytes = encodeMessage(info.records);
      info.usedSize = bytes.length;
      info.messageHex = toHex(bytes);
    }
    return info;
  });
}

// ─── Write ──────────────────────────────────────────────────────────────────
export interface WriteOptions {
  lock?: boolean;
  verify?: boolean;
  /** When set, writes via raw Type 2 page commands after PWD_AUTH. */
  password?: string;
  message?: string;
}

export interface WriteResult {
  uid: string;
  bytes: number;
  capacity?: number;
  verified?: boolean;
}

async function currentUid() {
  const tag: any = await NfcManager.getTag().catch(() => null);
  return (tag?.id ?? '').toUpperCase().replace(/(..)(?=.)/g, '$1:');
}

async function writeViaNdef(bytes: Bytes, tech: string, opts: WriteOptions): Promise<WriteResult> {
  const uid = await currentUid();

  if (isAndroid && tech === NfcTech.NdefFormatable) {
    await NfcManager.ndefFormatableHandlerAndroid.formatNdef(bytes, { readOnly: !!opts.lock });
    return { uid, bytes: bytes.length };
  }

  const status = await NfcManager.ndefHandler.getNdefStatus();
  if (status.status === 1) throw new Error('This tag is not NDEF compatible and cannot be written with standard NFC data.');
  if (status.status === 3) throw new Error('This tag is read-only (locked). It can no longer be written.');
  if (status.capacity && bytes.length > status.capacity)
    throw new Error(`Data is ${bytes.length} bytes but this tag only holds ${status.capacity} bytes.`);

  await NfcManager.ndefHandler.writeNdefMessage(bytes, { reconnectAfterWrite: !!opts.verify && isAndroid });

  let verified: boolean | undefined;
  if (opts.verify) {
    try {
      const msg: any = await NfcManager.ndefHandler.getNdefMessage();
      const readBack = encodeMessage(fromNative(msg?.ndefMessage));
      verified = readBack.length === bytes.length && readBack.every((b, i) => b === bytes[i]);
    } catch {
      verified = false;
    }
    if (!verified) throw new Error('Verification failed: data read back from the tag does not match. Try again.');
  }

  if (opts.lock) await NfcManager.ndefHandler.makeReadOnly();
  return { uid, bytes: bytes.length, capacity: status.capacity, verified };
}

export async function writeMessage(records: NdefRec[], opts: WriteOptions = {}): Promise<WriteResult> {
  const bytes = encodeMessage(records);
  const message = opts.message ?? 'Hold your phone near the tag to write';
  if (opts.password) {
    const pwd = t2.derivePassword(opts.password);
    return withTag([NfcTech.NfcA], { message, success: 'Written ✓' }, async () => {
      const chip = await t2.identify();
      const { size } = await t2.writeNdefRaw(chip, bytes, pwd);
      return { uid: await currentUid(), bytes: size, capacity: chip.spec?.userBytes };
    });
  }
  return withTag(isIOS ? TECHS.iosAll : TECHS.androidWrite, { message, success: 'Written ✓' }, (tech) =>
    writeViaNdef(bytes, tech, opts),
  );
}

export async function writeRawMessage(bytes: Bytes, opts: WriteOptions = {}) {
  return writeMessage(decodeMessage(bytes), opts);
}

export function eraseTag() {
  return writeMessage([EMPTY_RECORD], { message: 'Hold the tag you want to erase' });
}

export async function lockTag() {
  return withTag(isIOS ? TECHS.iosAll : [NfcTech.Ndef], { message: 'Hold the tag to lock it permanently', success: 'Tag locked 🔒' }, async () => {
    const status = await NfcManager.ndefHandler.getNdefStatus();
    if (status.status === 3) throw new Error('This tag is already read-only.');
    if (status.status === 1) throw new Error('This tag is not NDEF formatted. Write data to it first.');
    await NfcManager.ndefHandler.makeReadOnly();
    return await currentUid();
  });
}

export async function formatTag() {
  if (!isAndroid) throw new Error('Formatting is only available on Android — iPhones can’t format tags. Most NTAG stickers and cards come pre-formatted, so you can write to them directly.');
  return withTag([NfcTech.NdefFormatable, NfcTech.Ndef], { message: 'Hold the tag to format' }, async (tech) => {
    if (tech === NfcTech.Ndef) throw new Error('This tag is already NDEF formatted. Use “Erase” to clear it.');
    await NfcManager.ndefFormatableHandlerAndroid.formatNdef(encodeMessage([EMPTY_RECORD]));
    return await currentUid();
  });
}

/** Reads the NDEF message off one tag (for copying). */
export async function readMessageBytes(): Promise<{ uid: string; bytes: Bytes; records: NdefRec[] }> {
  const info = await readTag();
  if (!info.records.length) throw new Error('The source tag has no NDEF data to copy.');
  return { uid: info.uid, bytes: encodeMessage(info.records), records: info.records };
}

// ─── Password / chip features ───────────────────────────────────────────────
export async function withType2<T>(message: string, fn: (chip: t2.Chip) => Promise<T>, success?: string): Promise<T> {
  return withTag([NfcTech.NfcA], { message, success }, async () => fn(await t2.identify()));
}

export function setTagPassword(newPass: string, protectReads: boolean, currentPass?: string) {
  return withType2(
    'Hold an NTAG / Ultralight EV1 tag to set its password',
    (chip) =>
      t2.setPassword(chip, t2.derivePassword(newPass), {
        protectReads,
        current: currentPass ? t2.derivePassword(currentPass) : undefined,
      }).then(() => chip.name),
    'Password set 🔐',
  );
}

export function removeTagPassword(pass: string) {
  return withType2('Hold the protected tag', (chip) => t2.removePassword(chip, t2.derivePassword(pass)).then(() => chip.name), 'Password removed ✓');
}

export function setScanCounter(enabled: boolean, pass?: string) {
  return withType2(
    'Hold an NTAG213/215/216 tag',
    async (chip) => {
      await t2.setCounterEnabled(chip, enabled, pass ? t2.derivePassword(pass) : undefined);
      return enabled ? await t2.readCounter() : null;
    },
    enabled ? 'Counter enabled ✓' : 'Counter disabled ✓',
  );
}

/**
 * Writes a URL with a placeholder and turns on the NTAG21x mirror so every scan
 * yields a unique URL containing the tag UID and/or scan count.
 */
export function writeDynamicUrl(baseUrl: string, param: string, mode: Exclude<t2.MirrorMode, 'off'>, pass?: string) {
  const placeholder = t2.MIRROR_PLACEHOLDER[mode];
  const sep = baseUrl.includes('?') ? '&' : '?';
  const url = `${baseUrl}${sep}${param}=${placeholder}`;
  const message = encodeMessage([uriRecord(url)]);
  const idx = indexOfSeq(message, utf8Encode(placeholder));
  return withType2(
    'Hold an NTAG213/215/216 tag',
    async (chip) => {
      const pwd = pass ? t2.derivePassword(pass) : undefined;
      const { tlvStart } = await t2.writeNdefRaw(chip, message, pwd);
      const header = message.length < 0xff ? 2 : 4;
      await t2.setMirror(chip, mode, tlvStart + header + idx, pwd);
      return { url, chip: chip.name };
    },
    'Dynamic URL written ✓',
  );
}

// ─── Memory dump ────────────────────────────────────────────────────────────
export interface MemoryDump {
  uid: string;
  chipName: string;
  unit: 'Page' | 'Block';
  rows: t2.DumpRow[];
}

const CLASSIC_KEYS = [
  'FFFFFFFFFFFF',
  'A0A1A2A3A4A5',
  'D3F7D3F7D3F7',
  '000000000000',
  'B0B1B2B3B4B5',
  'AABBCCDDEEFF',
  '4D3A99C351DD',
  '1A982C7E459A',
].map(fromHex);

export async function dumpMemory(password?: string, extraKeys: Bytes[] = []): Promise<MemoryDump> {
  const techs = isIOS ? [NfcTech.NfcA, NfcTech.NfcV] : [NfcTech.MifareClassic, NfcTech.NfcA, NfcTech.NfcV];
  return withTag(techs, { message: 'Hold the tag still while memory is read…', success: 'Memory read ✓' }, async (tech) => {
    const uid = await currentUid();

    if (tech === NfcTech.MifareClassic) {
      const h = NfcManager.mifareClassicHandlerAndroid;
      const sectors = await h.mifareClassicGetSectorCount();
      const rows: t2.DumpRow[] = [];
      const keys = [...extraKeys, ...CLASSIC_KEYS];
      for (let s = 0; s < sectors; s++) {
        await setScanMessage(`Reading sector ${s + 1}/${sectors}…`);
        const first = s < 32 ? s * 4 : 128 + (s - 32) * 16;
        const count = s < 32 ? 4 : 16;
        let data: Bytes | null = null;
        let usedKey = '';
        for (const k of keys) {
          try {
            await h.mifareClassicAuthenticateA(s, k);
            data = toBytes(await (h as any).mifareClassicReadSector(s));
            usedKey = `Key A ${toHex(k, '')}`;
            break;
          } catch {
            try {
              await h.mifareClassicAuthenticateB(s, k);
              data = toBytes(await (h as any).mifareClassicReadSector(s));
              usedKey = `Key B ${toHex(k, '')}`;
              break;
            } catch {
              /* try next key */
            }
          }
        }
        for (let b = 0; b < count; b++) {
          rows.push({
            index: first + b,
            bytes: data ? data.slice(b * 16, b * 16 + 16) : null,
            label: b === 0 ? `S${s}${usedKey ? ' · ' + usedKey : ' · no key'}` : b === count - 1 ? 'Trailer' : undefined,
          });
        }
      }
      return { uid, chipName: `MIFARE Classic ${sectors === 16 ? '1K' : sectors === 5 ? 'Mini' : '4K'}`, unit: 'Block', rows };
    }

    if (tech === NfcTech.NfcV || tech === 'iso15693') {
      let blockCount = 64;
      let blockSize = 4;
      if (isIOS) {
        try {
          const s = await NfcManager.iso15693HandlerIOS.getSystemInfo(0x02);
          blockCount = s.blockCount;
          blockSize = s.blockSize;
        } catch {
          /* defaults */
        }
      } else {
        const probe: TagInfo = { uid, techTypes: [], ndefSupported: false, records: [], usedSize: 0, messageHex: '' };
        await probeIso15693Android(probe);
        blockCount = probe.iso15693?.blockCount ?? blockCount;
        blockSize = probe.iso15693?.blockSize ?? blockSize;
      }
      const rows: t2.DumpRow[] = [];
      for (let b = 0; b < blockCount; b++) {
        if (b % 8 === 0) await setScanMessage(`Reading block ${b + 1}/${blockCount}…`);
        try {
          const data = isIOS
            ? toBytes(await NfcManager.iso15693HandlerIOS.readSingleBlock({ flags: 0x02, blockNumber: b }))
            : (await transceiveV([0x02, 0x20, b])).slice(1, 1 + blockSize);
          rows.push({ index: b, bytes: data });
        } catch {
          rows.push({ index: b, bytes: null });
        }
      }
      return { uid, chipName: `ISO 15693 · ${blockCount} × ${blockSize} bytes`, unit: 'Block', rows };
    }

    const chip = await t2.identify();
    const pwd = password ? t2.derivePassword(password) : undefined;
    const rows = await t2.dumpPages(chip, (done, total) => setScanMessage(`Reading page ${done}/${total}…`), pwd);
    return { uid, chipName: chip.name, unit: 'Page', rows };
  });
}

// ─── Raw commands ───────────────────────────────────────────────────────────
export type RawTech = 'NfcA' | 'IsoDep' | 'NfcV';

export interface RawResult {
  cmd: string;
  ok: boolean;
  response: string;
}

export async function runRawCommands(tech: RawTech, commands: Bytes[]): Promise<RawResult[]> {
  const nfcTech = { NfcA: NfcTech.NfcA, IsoDep: NfcTech.IsoDep, NfcV: NfcTech.NfcV }[tech];
  return withTag([nfcTech], { message: `Hold a tag (${tech}) to send ${commands.length} command(s)` }, async () => {
    const out: RawResult[] = [];
    for (const cmd of commands) {
      try {
        const res =
          tech === 'NfcA' ? await transceiveA(cmd) : tech === 'IsoDep' ? await transceiveIsoDep(cmd) : await transceiveV(cmd);
        out.push({ cmd: toHex(cmd), ok: true, response: res.length ? toHex(res) : '(empty / ACK)' });
      } catch (e: any) {
        out.push({ cmd: toHex(cmd), ok: false, response: e?.message ?? String(e) });
      }
    }
    return out;
  });
}
