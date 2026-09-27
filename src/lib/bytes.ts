export type Bytes = number[];

/** Normalises whatever the native layer hands back (signed bytes, strings, typed arrays) to 0–255 numbers. */
export function toBytes(input: unknown): Bytes {
  if (input == null) return [];
  if (typeof input === 'string') return utf8Encode(input);
  if (Array.isArray(input) || ArrayBuffer.isView(input)) {
    return Array.from(input as ArrayLike<number>, (b) => b & 0xff);
  }
  return [];
}

export function toHex(bytes: ArrayLike<number>, sep = ' '): string {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, '0').toUpperCase()).join(sep);
}

/** Accepts "04 A2 FF", "04:a2:ff", "0x04,0xA2" or "04a2ff". Throws on odd length / bad chars. */
export function fromHex(input: string): Bytes {
  const clean = input.replace(/0x/gi, '').replace(/[\s:,\-]/g, '');
  if (clean.length === 0) return [];
  if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error('Hex may only contain 0-9 and A-F');
  if (clean.length % 2 !== 0) throw new Error('Hex needs an even number of digits');
  const out: Bytes = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

export function isHex(input: string): boolean {
  try {
    fromHex(input);
    return true;
  } catch {
    return false;
  }
}

export function utf8Encode(str: string): Bytes {
  const out: Bytes = [];
  for (const ch of str) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
  }
  return out;
}

/** Lenient UTF-8 decode: invalid sequences become U+FFFD instead of throwing. */
export function utf8Decode(bytes: ArrayLike<number>): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++] & 0xff;
    if (b < 0x80) {
      out += String.fromCharCode(b);
      continue;
    }
    const extra = b >= 0xf0 ? 3 : b >= 0xe0 ? 2 : b >= 0xc0 ? 1 : -1;
    if (extra < 0 || i + extra > bytes.length) {
      out += '�';
      continue;
    }
    let cp = b & (0x3f >> extra);
    let ok = true;
    for (let k = 0; k < extra; k++) {
      const nb = bytes[i + k] & 0xff;
      if ((nb & 0xc0) !== 0x80) ok = false;
      cp = (cp << 6) | (nb & 0x3f);
    }
    if (!ok) {
      out += '�';
      continue;
    }
    i += extra;
    out += String.fromCodePoint(cp);
  }
  return out;
}

export function utf16Decode(bytes: ArrayLike<number>, littleEndian = false): string {
  let out = '';
  let start = 0;
  // Honour a BOM if present.
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      littleEndian = true;
      start = 2;
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      littleEndian = false;
      start = 2;
    }
  }
  for (let i = start; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode(littleEndian ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
  }
  return out;
}

export function asciiPreview(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·')).join('');
}

export function isPrintable(bytes: ArrayLike<number>): boolean {
  const s = utf8Decode(bytes);
  if (s.includes('�')) return false;
  return !/[\x00-\x08\x0E-\x1F]/.test(s);
}

export function equals(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function indexOfSeq(haystack: Bytes, needle: Bytes): number {
  outer: for (let i = haystack.length - needle.length; i >= 0; i--) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** FNV-1a 32-bit — used to derive a stable 4-byte tag password from a passphrase. */
export function fnv1a(bytes: Bytes, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function u32ToBytes(n: number): Bytes {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

export function formatBytesSize(n: number): string {
  return `${n} byte${n === 1 ? '' : 's'}`;
}

export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function uuidv4(): string {
  const r = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
    c === 'x' ? r() : ((Math.random() * 4) | 8).toString(16),
  );
}
