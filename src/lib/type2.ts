/**
 * NFC Forum Type 2 tag commands (NXP NTAG21x / MIFARE Ultralight family).
 * All functions expect an open NfcA session (see nfc.withTag).
 * References: NTAG213/215/216 datasheet rev 3.2, MF0ULx1 datasheet rev 3.2.
 */
import { Bytes, fnv1a, fromHex, toHex, u32ToBytes, utf8Encode } from './bytes';
import { ndefTlv } from './ndef';
import { isAndroid, reconnectAndroid, transceiveA, NfcTech } from './nfc';

export interface ChipSpec {
  name: string;
  totalPages: number;
  /** First configuration page (CFG0). Undefined for chips without a config area we understand. */
  cfg0?: number;
  userBytes: number;
  password: boolean;
  counter: boolean;
  mirror: boolean;
}

const CHIPS: Record<string, ChipSpec> = {
  '04-0B': { name: 'NTAG210', totalPages: 20, cfg0: 0x10, userBytes: 48, password: true, counter: false, mirror: false },
  '04-0E': { name: 'NTAG212', totalPages: 41, cfg0: 0x25, userBytes: 128, password: true, counter: false, mirror: false },
  '04-0F': { name: 'NTAG213', totalPages: 45, cfg0: 0x29, userBytes: 144, password: true, counter: true, mirror: true },
  '04-11': { name: 'NTAG215', totalPages: 135, cfg0: 0x83, userBytes: 504, password: true, counter: true, mirror: true },
  '04-13': { name: 'NTAG216', totalPages: 231, cfg0: 0xe3, userBytes: 888, password: true, counter: true, mirror: true },
  '03-0B': { name: 'MIFARE Ultralight EV1 (MF0UL11)', totalPages: 20, cfg0: 0x10, userBytes: 48, password: true, counter: false, mirror: false },
  '03-0E': { name: 'MIFARE Ultralight EV1 (MF0UL21)', totalPages: 41, cfg0: 0x25, userBytes: 128, password: true, counter: false, mirror: false },
};

export interface Chip {
  spec: ChipSpec | null;
  version: Bytes | null;
  name: string;
}

const CMD = {
  GET_VERSION: 0x60,
  READ: 0x30,
  WRITE: 0xa2,
  PWD_AUTH: 0x1b,
  READ_CNT: 0x39,
  READ_SIG: 0x3c,
};

function checkAck(res: Bytes) {
  // WRITE answers with a 4-bit ACK (0xA). Anything else in a 1-byte reply is a NAK.
  if (res.length === 1 && (res[0] & 0x0f) !== 0x0a) {
    throw new Error(`Tag refused the write (NAK 0x${res[0].toString(16)}). It may be locked or password protected.`);
  }
}

/** After a NAK, Android drops the RF connection; reconnect so later commands still work. */
async function recover() {
  if (isAndroid) await reconnectAndroid(NfcTech.NfcA);
}

export async function getVersion(): Promise<Bytes | null> {
  try {
    const v = await transceiveA([CMD.GET_VERSION]);
    return v.length >= 8 ? v.slice(0, 8) : null;
  } catch {
    await recover();
    return null;
  }
}

export async function identify(): Promise<Chip> {
  const version = await getVersion();
  if (!version) {
    // Original Ultralight / Ultralight C / NTAG203 don't implement GET_VERSION.
    let name = 'MIFARE Ultralight / NTAG203 (legacy)';
    try {
      const cc = await readPages(3);
      const bytes = cc[2] * 8;
      name += ` · ${bytes} byte data area`;
    } catch {
      await recover();
      name = 'ISO 14443-A tag';
    }
    return { spec: null, version: null, name };
  }
  const key = `${version[2].toString(16).padStart(2, '0')}-${version[6].toString(16).padStart(2, '0')}`.toUpperCase();
  const spec = version[1] === 0x04 ? CHIPS[key] ?? null : null;
  let name = spec?.name;
  if (!name) {
    const vendor = version[1] === 0x04 ? 'NXP' : `Vendor 0x${version[1].toString(16)}`;
    if (version[1] === 0x04 && version[2] === 0x04 && version[3] === 0x05) name = 'NTAG I²C';
    else name = `${vendor} type 0x${version[2].toString(16)} / storage 0x${version[6].toString(16)}`;
  }
  return { spec, version, name };
}

/** READ returns 4 pages (16 bytes) starting at `page`. */
export async function readPages(page: number): Promise<Bytes> {
  const r = await transceiveA([CMD.READ, page & 0xff]);
  if (r.length < 16) throw new Error(`Page ${page} is not readable`);
  return r.slice(0, 16);
}

export async function writePage(page: number, data: Bytes) {
  if (data.length !== 4) throw new Error('A page is exactly 4 bytes');
  checkAck(await transceiveA([CMD.WRITE, page & 0xff, ...data]));
}

export async function readSignature(): Promise<Bytes | null> {
  try {
    const r = await transceiveA([CMD.READ_SIG, 0x00]);
    return r.length >= 32 ? r.slice(0, 32) : null;
  } catch {
    await recover();
    return null;
  }
}

/** NFC scan counter (NTAG213/215/216). Returns null when disabled or unsupported. */
export async function readCounter(): Promise<number | null> {
  try {
    const r = await transceiveA([CMD.READ_CNT, 0x02]);
    if (r.length < 3) return null;
    return r[0] | (r[1] << 8) | (r[2] << 16);
  } catch {
    await recover();
    return null;
  }
}

export async function pwdAuth(pwd: Bytes): Promise<Bytes> {
  try {
    const pack = await transceiveA([CMD.PWD_AUTH, ...pwd]);
    if (pack.length < 2) throw new Error();
    return pack.slice(0, 2);
  } catch {
    await recover();
    throw new Error('Wrong password (the tag rejected authentication).');
  }
}

// ─── Password helpers ───────────────────────────────────────────────────────
export interface TagPassword {
  pwd: Bytes;
  pack: Bytes;
}

/**
 * Turns user input into a 4-byte PWD + 2-byte PACK. Exactly 8 hex digits are used verbatim
 * (for interop with other apps); anything else is hashed so any phrase works.
 */
export function derivePassword(input: string): TagPassword {
  const t = input.trim();
  if (/^[0-9a-fA-F]{8}$/.test(t)) {
    const pwd = fromHex(t);
    return { pwd, pack: u32ToBytes(fnv1a(pwd, 0x1234567)).slice(0, 2) };
  }
  const bytes = utf8Encode(t);
  return {
    pwd: u32ToBytes(fnv1a(bytes)),
    pack: u32ToBytes(fnv1a(bytes, 0x1234567)).slice(0, 2),
  };
}

export function describePassword(p: TagPassword) {
  return `PWD ${toHex(p.pwd, '')} · PACK ${toHex(p.pack, '')}`;
}

async function readConfig(spec: ChipSpec) {
  const r = await readPages(spec.cfg0!);
  return { cfg0: r.slice(0, 4), cfg1: r.slice(4, 8) };
}

function requireConfig(chip: Chip): ChipSpec {
  if (!chip.spec?.cfg0) throw new Error(`${chip.name} is not supported for this operation. Use an NTAG21x or Ultralight EV1 tag.`);
  return chip.spec;
}

export interface ProtectOptions {
  /** Protect reads too (otherwise only writes need the password). */
  protectReads: boolean;
  /** First page that requires auth. 4 = all user memory. */
  fromPage?: number;
  /** Password currently on the tag, if already protected. */
  current?: TagPassword;
}

export async function setPassword(chip: Chip, next: TagPassword, opts: ProtectOptions) {
  const spec = requireConfig(chip);
  if (!spec.password) throw new Error(`${chip.name} does not support passwords.`);
  if (opts.current) await pwdAuth(opts.current.pwd);
  const { cfg0, cfg1 } = await readConfig(spec);
  if (cfg1[0] & 0x40) throw new Error('Configuration is permanently locked (CFGLCK) on this tag.');
  const base = spec.cfg0!;
  await writePage(base + 2, next.pwd);
  await writePage(base + 3, [next.pack[0], next.pack[1], 0x00, 0x00]);
  const access = (cfg1[0] & ~0x80) | (opts.protectReads ? 0x80 : 0x00);
  await writePage(base + 1, [access, cfg1[1], cfg1[2], cfg1[3]]);
  // AUTH0 last: from here on the password is enforced.
  await writePage(base, [cfg0[0], cfg0[1], cfg0[2], (opts.fromPage ?? 4) & 0xff]);
}

export async function removePassword(chip: Chip, current: TagPassword) {
  const spec = requireConfig(chip);
  await pwdAuth(current.pwd);
  const { cfg0, cfg1 } = await readConfig(spec);
  const base = spec.cfg0!;
  await writePage(base, [cfg0[0], cfg0[1], cfg0[2], 0xff]);
  await writePage(base + 1, [cfg1[0] & ~0x80, cfg1[1], cfg1[2], cfg1[3]]);
  await writePage(base + 2, [0xff, 0xff, 0xff, 0xff]);
  await writePage(base + 3, [0x00, 0x00, 0x00, 0x00]);
}

export async function readProtection(chip: Chip): Promise<{ auth0: number; protectReads: boolean; counterEnabled: boolean } | null> {
  if (!chip.spec?.cfg0) return null;
  try {
    const { cfg0, cfg1 } = await readConfig(chip.spec);
    return { auth0: cfg0[3], protectReads: (cfg1[0] & 0x80) !== 0, counterEnabled: (cfg1[0] & 0x10) !== 0 };
  } catch {
    await recover();
    return null;
  }
}

export async function setCounterEnabled(chip: Chip, enabled: boolean, pwd?: TagPassword) {
  const spec = requireConfig(chip);
  if (!spec.counter) throw new Error(`${chip.name} has no NFC scan counter.`);
  if (pwd) await pwdAuth(pwd.pwd);
  const { cfg1 } = await readConfig(spec);
  await writePage(spec.cfg0! + 1, [enabled ? cfg1[0] | 0x10 : cfg1[0] & ~0x10, cfg1[1], cfg1[2], cfg1[3]]);
}

export type MirrorMode = 'off' | 'uid' | 'counter' | 'both';
export const MIRROR_PLACEHOLDER: Record<Exclude<MirrorMode, 'off'>, string> = {
  uid: '00000000000000', // 7-byte UID → 14 hex chars
  counter: '000000', // 3-byte counter → 6 hex chars
  both: '00000000000000x000000', // UID + 'x' + counter
};

/**
 * Points the NTAG21x ASCII mirror at `byteOffset` (counted from page 0) so the tag
 * substitutes its UID and/or scan counter into the NDEF data on every read.
 */
export async function setMirror(chip: Chip, mode: MirrorMode, byteOffset: number, pwd?: TagPassword) {
  const spec = requireConfig(chip);
  if (!spec.mirror) throw new Error(`${chip.name} does not support UID/counter mirroring. Use NTAG213/215/216.`);
  if (pwd) await pwdAuth(pwd.pwd);
  const { cfg0, cfg1 } = await readConfig(spec);
  const base = spec.cfg0!;
  const conf = { off: 0, uid: 1, counter: 2, both: 3 }[mode];
  const page = mode === 'off' ? 0 : Math.floor(byteOffset / 4);
  const byte = mode === 'off' ? 0 : byteOffset % 4;
  if (mode !== 'off' && (page < 4 || page >= base)) throw new Error('Mirror position is outside user memory.');
  if (mode === 'counter' || mode === 'both') {
    await writePage(base + 1, [cfg1[0] | 0x10, cfg1[1], cfg1[2], cfg1[3]]);
  }
  await writePage(base, [(conf << 6) | (byte << 4) | (cfg0[0] & 0x0f), cfg0[1], page, cfg0[3]]);
}

// ─── Raw NDEF write (works on password-protected tags) ─────────────────────
export async function capacityBytes(chip: Chip): Promise<number> {
  if (chip.spec) return chip.spec.userBytes;
  const cc = await readPages(3);
  return cc[2] * 8;
}

export async function writeNdefRaw(chip: Chip, message: Bytes, pwd?: TagPassword): Promise<{ tlvStart: number; size: number }> {
  if (pwd) await pwdAuth(pwd.pwd);
  const cc = await readPages(3);
  if (cc[0] !== 0xe1) throw new Error('Tag has no NDEF capability container (CC). It may not be NDEF formatted.');
  if ((cc[3] & 0xf0) !== 0x00) throw new Error('Tag is marked read-only in its capability container.');
  const capacity = chip.spec?.userBytes ?? cc[2] * 8;
  const tlv = ndefTlv(message);
  if (tlv.length > capacity) throw new Error(`Data needs ${tlv.length} bytes but the tag only holds ${capacity}.`);
  while (tlv.length % 4) tlv.push(0x00);
  for (let i = 0; i < tlv.length; i += 4) await writePage(4 + i / 4, tlv.slice(i, i + 4));
  return { tlvStart: 16, size: tlv.length };
}

// ─── Memory dump ────────────────────────────────────────────────────────────
export interface DumpRow {
  index: number;
  bytes: Bytes | null;
  label?: string;
}

function pageLabel(page: number, spec: ChipSpec | null): string | undefined {
  if (page <= 1) return 'UID';
  if (page === 2) return 'UID / Lock';
  if (page === 3) return 'CC';
  if (spec?.cfg0) {
    const c = spec.cfg0;
    if (page === c - 1) return 'Dyn lock';
    if (page === c) return 'CFG0';
    if (page === c + 1) return 'CFG1';
    if (page === c + 2) return 'PWD';
    if (page === c + 3) return 'PACK';
  }
  return undefined;
}

export async function dumpPages(chip: Chip, onProgress?: (done: number, total: number) => void, pwd?: TagPassword): Promise<DumpRow[]> {
  if (pwd) await pwdAuth(pwd.pwd);
  let total = chip.spec?.totalPages;
  if (!total) {
    try {
      const cc = await readPages(3);
      total = 4 + Math.ceil((cc[2] * 8) / 4) + 4; // header + data area + lock/config pages
    } catch {
      total = 16;
    }
  }
  const rows: DumpRow[] = [];
  for (let p = 0; p < total; p += 4) {
    let chunk: Bytes | null = null;
    try {
      chunk = await readPages(p);
    } catch {
      await recover();
      // Protected area: re-authenticate if we can, otherwise mark the rest unreadable.
      if (pwd) {
        try {
          await pwdAuth(pwd.pwd);
          chunk = await readPages(p);
        } catch {
          chunk = null;
        }
      }
    }
    for (let k = 0; k < 4 && p + k < total; k++) {
      rows.push({ index: p + k, bytes: chunk ? chunk.slice(k * 4, k * 4 + 4) : null, label: pageLabel(p + k, chip.spec) });
    }
    onProgress?.(Math.min(p + 4, total), total);
  }
  return rows;
}
