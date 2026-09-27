import { Bytes, isPrintable, toHex, utf8Decode } from './bytes';
import { NdefRec, TNF, TNF_NAMES, decodeMessage, decodeText, decodeUri, typeString } from './ndef';
import { WIFI_AUTH } from './records';

export interface Described {
  title: string;
  icon: string;
  value: string;
  /** Something Linking.openURL can handle. */
  action?: string;
  details: { label: string; value: string }[];
}

function uriDetails(uri: string): Omit<Described, 'details'> & { details?: Described['details'] } {
  const lower = uri.toLowerCase();
  if (lower.startsWith('tel:')) return { title: 'Phone', icon: 'call', value: uri.slice(4), action: uri };
  if (lower.startsWith('facetime')) return { title: 'FaceTime', icon: 'videocam', value: uri.replace(/^facetime(-audio)?:/i, ''), action: uri };
  if (lower.startsWith('mailto:')) {
    const [addr, q] = uri.slice(7).split('?');
    const params = new URLSearchParamsLite(q);
    const details = [
      params.get('subject') && { label: 'Subject', value: params.get('subject')! },
      params.get('body') && { label: 'Body', value: params.get('body')! },
    ].filter(Boolean) as Described['details'];
    return { title: 'Email', icon: 'mail', value: addr, action: uri, details };
  }
  if (lower.startsWith('sms:') || lower.startsWith('smsto:')) {
    const [num, q] = uri.replace(/^sms(to)?:/i, '').split('?');
    const body = new URLSearchParamsLite(q).get('body');
    return { title: 'SMS', icon: 'chatbubble', value: num, action: uri, details: body ? [{ label: 'Message', value: body }] : [] };
  }
  if (lower.startsWith('geo:')) return { title: 'Location', icon: 'location', value: decodeURIComponent(uri.slice(4)), action: uri };
  if (lower.startsWith('shortcuts://')) {
    const name = new URLSearchParamsLite(uri.split('?')[1]).get('name');
    return { title: 'iOS Shortcut', icon: 'layers', value: name ?? uri, action: uri };
  }
  if (lower.includes('home-assistant.io/tag/')) {
    return { title: 'Home Assistant tag', icon: 'home', value: uri.split('/tag/')[1], action: uri };
  }
  if (lower.includes('maps.google.com/?q=')) {
    return { title: 'Location', icon: 'map', value: decodeURIComponent(uri.split('?q=')[1] ?? ''), action: uri };
  }
  if (/^https?:\/\//i.test(uri)) return { title: 'URL', icon: 'link', value: uri, action: uri };
  return { title: 'URI', icon: 'code-slash', value: uri, action: uri };
}

/** Minimal query parser — Hermes' URLSearchParams is incomplete on some RN versions. */
class URLSearchParamsLite {
  private map = new Map<string, string>();
  constructor(q?: string) {
    for (const part of (q ?? '').split('&')) {
      if (!part) continue;
      const [k, v = ''] = part.split('=');
      try {
        this.map.set(decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, ' ')));
      } catch {
        this.map.set(k, v);
      }
    }
  }
  get(k: string) {
    return this.map.get(k) ?? null;
  }
}

function parseWsc(payload: Bytes) {
  const out: { ssid?: string; key?: string; auth?: number; enc?: number } = {};
  const walk = (b: Bytes) => {
    let i = 0;
    while (i + 4 <= b.length) {
      const type = (b[i] << 8) | b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      const v = b.slice(i + 4, i + 4 + len);
      i += 4 + len;
      if (type === 0x100e) walk(v);
      else if (type === 0x1045) out.ssid = utf8Decode(v);
      else if (type === 0x1027) out.key = utf8Decode(v);
      else if (type === 0x1003) out.auth = (v[0] << 8) | v[1];
      else if (type === 0x100f) out.enc = (v[0] << 8) | v[1];
    }
  };
  walk(payload);
  return out;
}

function parseVCard(text: string) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const details: Described['details'] = [];
  let name = '';
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).split(';')[0].toUpperCase();
    const val = line.slice(idx + 1).replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, '\n');
    const labels: Record<string, string> = {
      TEL: 'Phone',
      EMAIL: 'Email',
      ORG: 'Company',
      TITLE: 'Title',
      URL: 'Website',
      NOTE: 'Note',
      ADR: 'Address',
    };
    if (key === 'FN') name = val;
    else if (key === 'N' && !name) name = val.split(';').reverse().filter(Boolean).join(' ');
    else if (labels[key]) details.push({ label: labels[key], value: key === 'ADR' ? val.split(';').filter(Boolean).join(', ') : val });
  }
  return { name, details };
}

function parseBtOob(payload: Bytes) {
  const mac = payload.slice(2, 8).reverse();
  let name = '';
  let i = 8;
  while (i < payload.length) {
    const len = payload[i];
    if (!len) break;
    const type = payload[i + 1];
    if (type === 0x08 || type === 0x09) name = utf8Decode(payload.slice(i + 2, i + 1 + len));
    i += len + 1;
  }
  return { mac: toHex(mac, ':'), name };
}

export function describe(r: NdefRec): Described {
  const type = typeString(r);
  const base = [
    { label: 'TNF', value: `${r.tnf} · ${TNF_NAMES[r.tnf] ?? '?'}` },
    { label: 'Type', value: type || '(none)' },
    { label: 'Payload', value: `${r.payload.length} bytes` },
  ];
  if (r.id.length) base.push({ label: 'Record ID', value: toHex(r.id) });

  const withBase = (d: Omit<Described, 'details'> & { details?: Described['details'] }): Described => ({
    ...d,
    details: [...(d.details ?? []), ...base],
  });

  if (r.tnf === TNF.EMPTY) return withBase({ title: 'Empty record', icon: 'remove-circle-outline', value: '(empty)' });

  if (r.tnf === TNF.WELL_KNOWN) {
    if (type === 'T') {
      const t = decodeText(r.payload);
      return withBase({
        title: 'Text',
        icon: 'text',
        value: t.text,
        details: [
          { label: 'Language', value: t.lang || '—' },
          { label: 'Encoding', value: t.utf16 ? 'UTF-16' : 'UTF-8' },
        ],
      });
    }
    if (type === 'U') return withBase(uriDetails(decodeUri(r.payload)));
    if (type === 'Sp') {
      try {
        const inner = decodeMessage(r.payload);
        const uri = inner.find((x) => x.tnf === TNF.WELL_KNOWN && typeString(x) === 'U');
        const title = inner.find((x) => x.tnf === TNF.WELL_KNOWN && typeString(x) === 'T');
        const u = uri ? decodeUri(uri.payload) : '';
        return withBase({
          title: 'Smart Poster',
          icon: 'newspaper',
          value: title ? decodeText(title.payload).text : u,
          action: u || undefined,
          details: [{ label: 'URL', value: u }],
        });
      } catch {
        /* fall through to generic */
      }
    }
  }

  if (r.tnf === TNF.MIME) {
    const mime = type.toLowerCase();
    if (mime === 'application/vnd.wfa.wsc') {
      const w = parseWsc(r.payload);
      const auth = WIFI_AUTH.find((a) => a.auth === w.auth && a.enc === w.enc) ?? WIFI_AUTH.find((a) => a.auth === w.auth);
      return withBase({
        title: 'Wi-Fi network',
        icon: 'wifi',
        value: w.ssid ?? '(unknown SSID)',
        details: [
          { label: 'Security', value: auth?.label ?? (w.auth != null ? `0x${w.auth.toString(16)}` : '—') },
          { label: 'Password', value: w.key || '(none)' },
        ],
      });
    }
    if (mime === 'text/vcard' || mime === 'text/x-vcard') {
      const v = parseVCard(utf8Decode(r.payload));
      return withBase({ title: 'Contact', icon: 'person-circle', value: v.name || 'Contact', details: v.details });
    }
    if (mime === 'application/vnd.bluetooth.ep.oob') {
      const b = parseBtOob(r.payload);
      return withBase({ title: 'Bluetooth', icon: 'bluetooth', value: b.name || b.mac, details: [{ label: 'MAC', value: b.mac }] });
    }
    if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || isPrintable(r.payload)) {
      return withBase({ title: `Data · ${type}`, icon: 'document-text', value: utf8Decode(r.payload) });
    }
    return withBase({ title: `Data · ${type}`, icon: 'document', value: toHex(r.payload) });
  }

  if (r.tnf === TNF.ABSOLUTE_URI) return withBase(uriDetails(type));

  if (r.tnf === TNF.EXTERNAL) {
    if (type === 'android.com:pkg')
      return withBase({
        title: 'Android app',
        icon: 'logo-android',
        value: utf8Decode(r.payload),
        action: `https://play.google.com/store/apps/details?id=${utf8Decode(r.payload)}`,
      });
    return withBase({
      title: `External · ${type}`,
      icon: 'extension-puzzle',
      value: isPrintable(r.payload) ? utf8Decode(r.payload) : toHex(r.payload),
    });
  }

  return withBase({
    title: 'Unknown record',
    icon: 'help-circle',
    value: isPrintable(r.payload) ? utf8Decode(r.payload) : toHex(r.payload),
  });
}
