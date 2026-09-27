import { Bytes, toBytes, utf16Decode, utf8Decode, utf8Encode } from './bytes';

export const TNF = {
  EMPTY: 0,
  WELL_KNOWN: 1,
  MIME: 2,
  ABSOLUTE_URI: 3,
  EXTERNAL: 4,
  UNKNOWN: 5,
  UNCHANGED: 6,
  RESERVED: 7,
} as const;

export const TNF_NAMES = [
  'Empty',
  'NFC Forum well-known',
  'Media (MIME)',
  'Absolute URI',
  'NFC Forum external',
  'Unknown',
  'Unchanged',
  'Reserved',
];

export interface NdefRec {
  tnf: number;
  type: Bytes;
  id: Bytes;
  payload: Bytes;
}

export const URI_PREFIXES = [
  '',
  'http://www.',
  'https://www.',
  'http://',
  'https://',
  'tel:',
  'mailto:',
  'ftp://anonymous:anonymous@',
  'ftp://ftp.',
  'ftps://',
  'sftp://',
  'smb://',
  'nfs://',
  'ftp://',
  'dav://',
  'news:',
  'telnet://',
  'imap:',
  'rtsp://',
  'urn:',
  'pop:',
  'sip:',
  'sips:',
  'tftp:',
  'btspp://',
  'btl2cap://',
  'btgoep://',
  'tcpobex://',
  'irdaobex://',
  'file://',
  'urn:epc:id:',
  'urn:epc:tag:',
  'urn:epc:pat:',
  'urn:epc:raw:',
  'urn:epc:',
  'urn:nfc:',
];

export function rec(tnf: number, type: string | Bytes, payload: Bytes | string, id: Bytes = []): NdefRec {
  return {
    tnf,
    type: typeof type === 'string' ? utf8Encode(type) : type,
    payload: typeof payload === 'string' ? utf8Encode(payload) : payload,
    id,
  };
}

export function textRecord(text: string, lang = 'en'): NdefRec {
  const langBytes = utf8Encode(lang);
  return rec(TNF.WELL_KNOWN, 'T', [langBytes.length & 0x3f, ...langBytes, ...utf8Encode(text)]);
}

export function uriRecord(uri: string): NdefRec {
  // Pick the longest matching abbreviation to save tag space.
  let best = 0;
  for (let i = 1; i < URI_PREFIXES.length; i++) {
    if (uri.startsWith(URI_PREFIXES[i]) && URI_PREFIXES[i].length > URI_PREFIXES[best].length) best = i;
  }
  return rec(TNF.WELL_KNOWN, 'U', [best, ...utf8Encode(uri.slice(URI_PREFIXES[best].length))]);
}

export function mimeRecord(mime: string, payload: Bytes | string): NdefRec {
  return rec(TNF.MIME, mime, payload);
}

export function externalRecord(type: string, payload: Bytes | string): NdefRec {
  return rec(TNF.EXTERNAL, type, payload);
}

export function smartPosterRecord(uri: string, title?: string, lang = 'en'): NdefRec {
  const inner = [uriRecord(uri)];
  if (title) inner.push(textRecord(title, lang));
  return rec(TNF.WELL_KNOWN, 'Sp', encodeMessage(inner));
}

export const EMPTY_RECORD: NdefRec = { tnf: TNF.EMPTY, type: [], id: [], payload: [] };

export function encodeMessage(records: NdefRec[]): Bytes {
  if (records.length === 0) records = [EMPTY_RECORD];
  const out: Bytes = [];
  records.forEach((r, i) => {
    const short = r.payload.length < 256;
    let header = r.tnf & 0x07;
    if (i === 0) header |= 0x80; // MB
    if (i === records.length - 1) header |= 0x40; // ME
    if (short) header |= 0x10; // SR
    if (r.id.length > 0) header |= 0x08; // IL
    out.push(header, r.type.length);
    if (short) out.push(r.payload.length);
    else {
      const n = r.payload.length;
      out.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
    }
    if (r.id.length > 0) out.push(r.id.length);
    out.push(...r.type, ...r.id, ...r.payload);
  });
  return out;
}

export function decodeMessage(bytes: Bytes): NdefRec[] {
  const records: NdefRec[] = [];
  let i = 0;
  let chunk: NdefRec | null = null;
  while (i < bytes.length) {
    const header = bytes[i++];
    const cf = (header & 0x20) !== 0;
    const sr = (header & 0x10) !== 0;
    const il = (header & 0x08) !== 0;
    const tnf = header & 0x07;
    const typeLen = bytes[i++];
    let payloadLen: number;
    if (sr) payloadLen = bytes[i++];
    else {
      payloadLen = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
      i += 4;
    }
    const idLen = il ? bytes[i++] : 0;
    const type = bytes.slice(i, (i += typeLen));
    const id = bytes.slice(i, (i += idLen));
    const payload = bytes.slice(i, (i += payloadLen));
    if (i > bytes.length) throw new Error('Truncated NDEF message');

    if (chunk) {
      chunk.payload.push(...payload);
      if (!cf) {
        records.push(chunk);
        chunk = null;
      }
    } else if (cf) {
      chunk = { tnf, type, id, payload: [...payload] };
    } else {
      records.push({ tnf, type, id, payload });
    }
    if (header & 0x40) break; // ME
  }
  return records;
}

/** Converts the loosely-typed records from react-native-nfc-manager into our shape. */
export function fromNative(records: unknown): NdefRec[] {
  if (!Array.isArray(records)) return [];
  return records.map((r: any) => ({
    tnf: Number(r?.tnf ?? 0) & 0x07,
    type: toBytes(r?.type),
    // Android reports the record id as a hex string.
    id: typeof r?.id === 'string' ? hexish(r.id) : toBytes(r?.id),
    payload: toBytes(r?.payload),
  }));
}

function hexish(s: string): Bytes {
  if (!s) return [];
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
    const out: Bytes = [];
    for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
    return out;
  }
  return utf8Encode(s);
}

export function typeString(r: NdefRec): string {
  return utf8Decode(r.type);
}

export function decodeText(payload: Bytes): { text: string; lang: string; utf16: boolean } {
  if (payload.length === 0) return { text: '', lang: '', utf16: false };
  const status = payload[0];
  const utf16 = (status & 0x80) !== 0;
  const langLen = status & 0x3f;
  const lang = utf8Decode(payload.slice(1, 1 + langLen));
  const body = payload.slice(1 + langLen);
  return { text: utf16 ? utf16Decode(body) : utf8Decode(body), lang, utf16 };
}

export function decodeUri(payload: Bytes): string {
  if (payload.length === 0) return '';
  return (URI_PREFIXES[payload[0]] ?? '') + utf8Decode(payload.slice(1));
}

/** Wraps an NDEF message in a Type 2 tag TLV (used for raw page writes). */
export function ndefTlv(message: Bytes): Bytes {
  const len = message.length;
  const header = len < 0xff ? [0x03, len] : [0x03, 0xff, (len >> 8) & 0xff, len & 0xff];
  return [...header, ...message, 0xfe];
}

/** Bytes an NDEF message occupies on a Type 2 tag including TLV framing. */
export function tlvSize(messageLength: number): number {
  return messageLength + (messageLength < 0xff ? 2 : 4) + 1;
}
