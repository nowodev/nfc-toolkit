import { Bytes, fromHex, utf8Encode, uuidv4 } from './bytes';
import {
  EMPTY_RECORD,
  NdefRec,
  decodeMessage,
  externalRecord,
  mimeRecord,
  smartPosterRecord,
  textRecord,
  uriRecord,
} from './ndef';

export type RecordKind =
  | 'text'
  | 'url'
  | 'search'
  | 'social'
  | 'email'
  | 'phone'
  | 'sms'
  | 'contact'
  | 'location'
  | 'address'
  | 'wifi'
  | 'bluetooth'
  | 'app'
  | 'shortcut'
  | 'homeassistant'
  | 'smartposter'
  | 'uri'
  | 'mime'
  | 'external'
  | 'raw'
  | 'empty';

export interface RecordDraft {
  id: string;
  kind: RecordKind;
  data: Record<string, string>;
}

export interface FieldOption {
  label: string;
  value: string;
}

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboard?: 'default' | 'email-address' | 'phone-pad' | 'url' | 'numeric' | 'decimal-pad' | 'numbers-and-punctuation';
  options?: FieldOption[];
  secure?: boolean;
  help?: string;
  defaultValue?: string | (() => string);
  autoCapitalize?: 'none' | 'sentences' | 'words';
}

export interface RecordDef {
  kind: RecordKind;
  label: string;
  icon: string; // Ionicons name
  group: 'Common' | 'Contact & Social' | 'Connectivity' | 'Automation' | 'Advanced';
  description: string;
  fields: FieldDef[];
  build: (d: Record<string, string>) => NdefRec[];
  summary: (d: Record<string, string>) => string;
  validate?: (d: Record<string, string>) => string | null;
}

const enc = encodeURIComponent;

function normaliseUrl(u: string): string {
  const t = u.trim();
  if (!t) return t;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
  return 'https://' + t;
}

function vEscape(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

export const SOCIAL_NETWORKS: (FieldOption & { url: (u: string) => string })[] = [
  { label: 'Instagram', value: 'instagram', url: (u) => `https://instagram.com/${u}` },
  { label: 'X / Twitter', value: 'x', url: (u) => `https://x.com/${u}` },
  { label: 'Facebook', value: 'facebook', url: (u) => `https://facebook.com/${u}` },
  { label: 'LinkedIn', value: 'linkedin', url: (u) => `https://linkedin.com/in/${u}` },
  { label: 'TikTok', value: 'tiktok', url: (u) => `https://tiktok.com/@${u}` },
  { label: 'YouTube', value: 'youtube', url: (u) => `https://youtube.com/@${u}` },
  { label: 'Threads', value: 'threads', url: (u) => `https://threads.net/@${u}` },
  { label: 'GitHub', value: 'github', url: (u) => `https://github.com/${u}` },
  { label: 'Snapchat', value: 'snapchat', url: (u) => `https://snapchat.com/add/${u}` },
  { label: 'Telegram', value: 'telegram', url: (u) => `https://t.me/${u}` },
  { label: 'WhatsApp', value: 'whatsapp', url: (u) => `https://wa.me/${u.replace(/[^\d]/g, '')}` },
  { label: 'Pinterest', value: 'pinterest', url: (u) => `https://pinterest.com/${u}` },
  { label: 'Twitch', value: 'twitch', url: (u) => `https://twitch.tv/${u}` },
  { label: 'Reddit', value: 'reddit', url: (u) => `https://reddit.com/user/${u}` },
  { label: 'Bluesky', value: 'bluesky', url: (u) => `https://bsky.app/profile/${u}` },
];

const SEARCH_ENGINES: (FieldOption & { url: (q: string) => string })[] = [
  { label: 'Google', value: 'google', url: (q) => `https://www.google.com/search?q=${enc(q)}` },
  { label: 'DuckDuckGo', value: 'ddg', url: (q) => `https://duckduckgo.com/?q=${enc(q)}` },
  { label: 'Bing', value: 'bing', url: (q) => `https://www.bing.com/search?q=${enc(q)}` },
  { label: 'YouTube', value: 'youtube', url: (q) => `https://www.youtube.com/results?search_query=${enc(q)}` },
  { label: 'Wikipedia', value: 'wikipedia', url: (q) => `https://en.wikipedia.org/w/index.php?search=${enc(q)}` },
];

// Wi-Fi Simple Configuration constants (WSC spec §12)
export const WIFI_AUTH: (FieldOption & { auth: number; enc: number })[] = [
  { label: 'WPA2-Personal', value: 'wpa2', auth: 0x0020, enc: 0x0008 },
  { label: 'WPA/WPA2 mixed', value: 'wpa-wpa2', auth: 0x0022, enc: 0x000c },
  { label: 'WPA-Personal', value: 'wpa', auth: 0x0002, enc: 0x0004 },
  { label: 'WEP (legacy)', value: 'wep', auth: 0x0001, enc: 0x0002 },
  { label: 'Open (no password)', value: 'open', auth: 0x0001, enc: 0x0001 },
];

function tlv(type: number, value: Bytes): Bytes {
  return [(type >> 8) & 0xff, type & 0xff, (value.length >> 8) & 0xff, value.length & 0xff, ...value];
}

export function wifiPayload(ssid: string, password: string, mode: string): Bytes {
  const m = WIFI_AUTH.find((a) => a.value === mode) ?? WIFI_AUTH[0];
  const cred = [
    ...tlv(0x1026, [0x01]), // network index
    ...tlv(0x1045, utf8Encode(ssid)),
    ...tlv(0x1003, [(m.auth >> 8) & 0xff, m.auth & 0xff]),
    ...tlv(0x100f, [(m.enc >> 8) & 0xff, m.enc & 0xff]),
    ...tlv(0x1027, m.value === 'open' ? [] : utf8Encode(password)),
    ...tlv(0x1020, [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), // broadcast MAC
  ];
  // WFA vendor extension: version 2.0
  return [...tlv(0x100e, cred), ...tlv(0x1049, [0x00, 0x37, 0x2a, 0x00, 0x01, 0x20])];
}

export function bluetoothPayload(mac: string, name: string): Bytes {
  const macBytes = fromHex(mac);
  if (macBytes.length !== 6) throw new Error('MAC address must be 6 bytes, e.g. 00:11:22:AA:BB:CC');
  const eir: Bytes = [];
  if (name) {
    const n = utf8Encode(name);
    eir.push(n.length + 1, 0x09, ...n);
  }
  const body = [...macBytes.slice().reverse(), ...eir];
  const total = body.length + 2;
  return [total & 0xff, (total >> 8) & 0xff, ...body];
}

function buildVCard(d: Record<string, string>): string {
  const first = d.firstName?.trim() ?? '';
  const last = d.lastName?.trim() ?? '';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEscape(last)};${vEscape(first)};;;`, `FN:${vEscape([first, last].filter(Boolean).join(' '))}`];
  if (d.org) lines.push(`ORG:${vEscape(d.org)}`);
  if (d.title) lines.push(`TITLE:${vEscape(d.title)}`);
  if (d.phone) lines.push(`TEL;TYPE=CELL:${d.phone}`);
  if (d.workPhone) lines.push(`TEL;TYPE=WORK:${d.workPhone}`);
  if (d.email) lines.push(`EMAIL;TYPE=INTERNET:${d.email}`);
  if (d.website) lines.push(`URL:${normaliseUrl(d.website)}`);
  if (d.street || d.city || d.region || d.zip || d.country)
    lines.push(
      `ADR;TYPE=WORK:;;${vEscape(d.street ?? '')};${vEscape(d.city ?? '')};${vEscape(d.region ?? '')};${vEscape(d.zip ?? '')};${vEscape(d.country ?? '')}`,
    );
  if (d.note) lines.push(`NOTE:${vEscape(d.note)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

const required =
  (...keys: string[]) =>
  (d: Record<string, string>) => {
    for (const k of keys) if (!d[k]?.trim()) return `${k} is required`;
    return null;
  };

export const RECORD_DEFS: RecordDef[] = [
  // ─── Common ───────────────────────────────────────────
  {
    kind: 'text',
    label: 'Text',
    icon: 'text',
    group: 'Common',
    description: 'Plain text in any language',
    fields: [
      { key: 'text', label: 'Text', required: true, multiline: true, placeholder: 'Hello from my tag 👋', autoCapitalize: 'sentences' },
      { key: 'lang', label: 'Language code', placeholder: 'en', defaultValue: 'en', autoCapitalize: 'none' },
    ],
    build: (d) => [textRecord(d.text, d.lang?.trim() || 'en')],
    summary: (d) => d.text,
    validate: required('text'),
  },
  {
    kind: 'url',
    label: 'URL / Website',
    icon: 'link',
    group: 'Common',
    description: 'Opens a web page',
    fields: [{ key: 'url', label: 'URL', required: true, keyboard: 'url', placeholder: 'https://example.com', autoCapitalize: 'none' }],
    build: (d) => [uriRecord(normaliseUrl(d.url))],
    summary: (d) => normaliseUrl(d.url),
    validate: required('url'),
  },
  {
    kind: 'search',
    label: 'Web search',
    icon: 'search',
    group: 'Common',
    description: 'Runs a search on Google, DuckDuckGo…',
    fields: [
      { key: 'engine', label: 'Search engine', options: SEARCH_ENGINES, defaultValue: 'google' },
      { key: 'query', label: 'Search for', required: true, placeholder: 'best coffee near me' },
    ],
    build: (d) => [uriRecord((SEARCH_ENGINES.find((e) => e.value === d.engine) ?? SEARCH_ENGINES[0]).url(d.query))],
    summary: (d) => `Search “${d.query}”`,
    validate: required('query'),
  },
  {
    kind: 'location',
    label: 'Location',
    icon: 'location',
    group: 'Common',
    description: 'GPS coordinates on a map',
    fields: [
      { key: 'lat', label: 'Latitude', required: true, keyboard: 'numbers-and-punctuation', placeholder: '37.7749' },
      { key: 'lng', label: 'Longitude', required: true, keyboard: 'numbers-and-punctuation', placeholder: '-122.4194' },
      {
        key: 'format',
        label: 'Format',
        defaultValue: 'maps',
        options: [
          { label: 'Maps link (iPhone + Android)', value: 'maps' },
          { label: 'geo: URI (Android)', value: 'geo' },
        ],
      },
    ],
    build: (d) => [
      uriRecord(
        d.format === 'geo'
          ? `geo:${d.lat.trim()},${d.lng.trim()}`
          : `https://maps.google.com/?q=${d.lat.trim()},${d.lng.trim()}`,
      ),
    ],
    summary: (d) => `${d.lat}, ${d.lng}`,
    validate: (d) => {
      const lat = Number(d.lat);
      const lng = Number(d.lng);
      if (!d.lat || isNaN(lat) || lat < -90 || lat > 90) return 'Latitude must be between -90 and 90';
      if (!d.lng || isNaN(lng) || lng < -180 || lng > 180) return 'Longitude must be between -180 and 180';
      return null;
    },
  },
  {
    kind: 'address',
    label: 'Address',
    icon: 'map',
    group: 'Common',
    description: 'Street address opened in Maps',
    fields: [
      { key: 'address', label: 'Address', required: true, multiline: true, placeholder: '1 Infinite Loop, Cupertino, CA' },
      {
        key: 'format',
        label: 'Format',
        defaultValue: 'maps',
        options: [
          { label: 'Maps link (iPhone + Android)', value: 'maps' },
          { label: 'geo: URI (Android)', value: 'geo' },
        ],
      },
    ],
    build: (d) => [
      uriRecord(d.format === 'geo' ? `geo:0,0?q=${enc(d.address)}` : `https://maps.google.com/?q=${enc(d.address)}`),
    ],
    summary: (d) => d.address,
    validate: required('address'),
  },

  // ─── Contact & social ────────────────────────────────
  {
    kind: 'contact',
    label: 'Contact card',
    icon: 'person-circle',
    group: 'Contact & Social',
    description: 'vCard — tap to save a contact',
    fields: [
      { key: 'firstName', label: 'First name', autoCapitalize: 'words' },
      { key: 'lastName', label: 'Last name', autoCapitalize: 'words' },
      { key: 'org', label: 'Company' },
      { key: 'title', label: 'Job title' },
      { key: 'phone', label: 'Mobile', keyboard: 'phone-pad' },
      { key: 'workPhone', label: 'Work phone', keyboard: 'phone-pad' },
      { key: 'email', label: 'Email', keyboard: 'email-address', autoCapitalize: 'none' },
      { key: 'website', label: 'Website', keyboard: 'url', autoCapitalize: 'none' },
      { key: 'street', label: 'Street' },
      { key: 'city', label: 'City' },
      { key: 'region', label: 'State / region' },
      { key: 'zip', label: 'Postal code' },
      { key: 'country', label: 'Country' },
      { key: 'note', label: 'Note', multiline: true },
    ],
    build: (d) => [mimeRecord('text/vcard', buildVCard(d))],
    summary: (d) => [d.firstName, d.lastName].filter(Boolean).join(' ') || d.org || d.email || 'Contact',
    validate: (d) =>
      d.firstName?.trim() || d.lastName?.trim() || d.org?.trim() ? null : 'Enter at least a name or company',
  },
  {
    kind: 'email',
    label: 'Email',
    icon: 'mail',
    group: 'Contact & Social',
    description: 'Composes an email',
    fields: [
      { key: 'to', label: 'To', required: true, keyboard: 'email-address', autoCapitalize: 'none', placeholder: 'hello@example.com' },
      { key: 'subject', label: 'Subject' },
      { key: 'body', label: 'Message', multiline: true },
    ],
    build: (d) => {
      const q = [d.subject && `subject=${enc(d.subject)}`, d.body && `body=${enc(d.body)}`].filter(Boolean).join('&');
      return [uriRecord(`mailto:${d.to.trim()}${q ? '?' + q : ''}`)];
    },
    summary: (d) => d.to,
    validate: (d) => (/^\S+@\S+\.\S+$/.test(d.to?.trim() ?? '') ? null : 'Enter a valid email address'),
  },
  {
    kind: 'phone',
    label: 'Phone call',
    icon: 'call',
    group: 'Contact & Social',
    description: 'Dials a number',
    fields: [
      { key: 'number', label: 'Phone number', required: true, keyboard: 'phone-pad', placeholder: '+1 555 123 4567' },
      {
        key: 'type',
        label: 'Call type',
        defaultValue: 'tel',
        options: [
          { label: 'Phone', value: 'tel' },
          { label: 'FaceTime (iPhone)', value: 'facetime' },
          { label: 'FaceTime Audio (iPhone)', value: 'facetime-audio' },
        ],
      },
    ],
    build: (d) => [uriRecord(`${d.type || 'tel'}:${d.number.replace(/[^\d+*#]/g, '')}`)],
    summary: (d) => d.number,
    validate: required('number'),
  },
  {
    kind: 'sms',
    label: 'SMS',
    icon: 'chatbubble',
    group: 'Contact & Social',
    description: 'Pre-filled text message',
    fields: [
      { key: 'number', label: 'Phone number', required: true, keyboard: 'phone-pad' },
      { key: 'body', label: 'Message', multiline: true },
    ],
    build: (d) => [
      uriRecord(`sms:${d.number.replace(/[^\d+]/g, '')}${d.body ? `?body=${enc(d.body)}` : ''}`),
    ],
    summary: (d) => d.number,
    validate: required('number'),
  },
  {
    kind: 'social',
    label: 'Social profile',
    icon: 'people',
    group: 'Contact & Social',
    description: 'Instagram, TikTok, LinkedIn, WhatsApp…',
    fields: [
      { key: 'network', label: 'Network', options: SOCIAL_NETWORKS, defaultValue: 'instagram' },
      { key: 'username', label: 'Username (or number for WhatsApp)', required: true, autoCapitalize: 'none' },
    ],
    build: (d) => [
      uriRecord((SOCIAL_NETWORKS.find((s) => s.value === d.network) ?? SOCIAL_NETWORKS[0]).url(d.username.trim().replace(/^@/, ''))),
    ],
    summary: (d) => `${SOCIAL_NETWORKS.find((s) => s.value === d.network)?.label ?? ''} @${d.username.replace(/^@/, '')}`,
    validate: required('username'),
  },

  // ─── Connectivity ────────────────────────────────────
  {
    kind: 'wifi',
    label: 'Wi-Fi network',
    icon: 'wifi',
    group: 'Connectivity',
    description: 'Tap to join Wi-Fi (Android)',
    fields: [
      { key: 'ssid', label: 'Network name (SSID)', required: true, autoCapitalize: 'none' },
      { key: 'auth', label: 'Security', options: WIFI_AUTH, defaultValue: 'wpa2' },
      { key: 'password', label: 'Password', secure: true, autoCapitalize: 'none' },
    ],
    build: (d) => [mimeRecord('application/vnd.wfa.wsc', wifiPayload(d.ssid, d.password ?? '', d.auth || 'wpa2'))],
    summary: (d) => d.ssid,
    validate: (d) => {
      if (!d.ssid?.trim()) return 'SSID is required';
      if (d.auth !== 'open' && !(d.password ?? '').length) return 'Password is required for secured networks';
      if (d.auth?.startsWith('wpa') && d.password.length < 8) return 'WPA passwords are at least 8 characters';
      return null;
    },
  },
  {
    kind: 'bluetooth',
    label: 'Bluetooth pairing',
    icon: 'bluetooth',
    group: 'Connectivity',
    description: 'Tap to pair a device (Android)',
    fields: [
      { key: 'mac', label: 'MAC address', required: true, placeholder: '00:11:22:AA:BB:CC', autoCapitalize: 'none' },
      { key: 'name', label: 'Device name (optional)' },
    ],
    build: (d) => [mimeRecord('application/vnd.bluetooth.ep.oob', bluetoothPayload(d.mac, d.name ?? ''))],
    summary: (d) => d.name || d.mac,
    validate: (d) => {
      try {
        bluetoothPayload(d.mac ?? '', '');
        return null;
      } catch (e: any) {
        return e.message;
      }
    },
  },

  // ─── Automation ──────────────────────────────────────
  {
    kind: 'shortcut',
    label: 'iOS Shortcut',
    icon: 'layers',
    group: 'Automation',
    description: 'Runs a Shortcut on iPhone',
    fields: [
      { key: 'name', label: 'Shortcut name (exact)', required: true, placeholder: 'Turn on lights' },
      { key: 'input', label: 'Text input (optional)' },
    ],
    build: (d) => [
      uriRecord(
        `shortcuts://run-shortcut?name=${enc(d.name)}${d.input ? `&input=text&text=${enc(d.input)}` : ''}`,
      ),
    ],
    summary: (d) => d.name,
    validate: required('name'),
  },
  {
    kind: 'app',
    label: 'Launch Android app',
    icon: 'logo-android',
    group: 'Automation',
    description: 'Android Application Record (opens / installs an app)',
    fields: [
      {
        key: 'pkg',
        label: 'Package name',
        required: true,
        autoCapitalize: 'none',
        placeholder: 'com.spotify.music',
        help: 'Put this as the LAST record so the other records are handled first.',
      },
    ],
    build: (d) => [externalRecord('android.com:pkg', d.pkg.trim())],
    summary: (d) => d.pkg,
    validate: (d) => (/^[a-zA-Z][\w]*(\.[a-zA-Z_][\w]*)+$/.test(d.pkg?.trim() ?? '') ? null : 'Invalid package name'),
  },
  {
    kind: 'homeassistant',
    label: 'Home Assistant tag',
    icon: 'home',
    group: 'Automation',
    description: 'Triggers Home Assistant automations',
    fields: [
      {
        key: 'tagId',
        label: 'Tag ID',
        required: true,
        autoCapitalize: 'none',
        defaultValue: () => uuidv4(),
        help: 'Use this ID in a Home Assistant “Tag scanned” automation.',
      },
    ],
    build: (d) => [uriRecord(`https://www.home-assistant.io/tag/${d.tagId.trim()}`)],
    summary: (d) => d.tagId,
    validate: required('tagId'),
  },
  {
    kind: 'uri',
    label: 'Custom URI / deep link',
    icon: 'code-slash',
    group: 'Automation',
    description: 'Any scheme — spotify:, maps:, myapp://…',
    fields: [{ key: 'uri', label: 'URI', required: true, autoCapitalize: 'none', placeholder: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' }],
    build: (d) => [uriRecord(d.uri.trim())],
    summary: (d) => d.uri,
    validate: required('uri'),
  },

  // ─── Advanced ────────────────────────────────────────
  {
    kind: 'smartposter',
    label: 'Smart Poster',
    icon: 'newspaper',
    group: 'Advanced',
    description: 'URL with a title',
    fields: [
      { key: 'url', label: 'URL', required: true, keyboard: 'url', autoCapitalize: 'none' },
      { key: 'title', label: 'Title' },
    ],
    build: (d) => [smartPosterRecord(normaliseUrl(d.url), d.title)],
    summary: (d) => d.title || d.url,
    validate: required('url'),
  },
  {
    kind: 'mime',
    label: 'MIME / data',
    icon: 'document',
    group: 'Advanced',
    description: 'Custom media type (text or hex)',
    fields: [
      { key: 'mime', label: 'MIME type', required: true, autoCapitalize: 'none', placeholder: 'application/json' },
      {
        key: 'encoding',
        label: 'Payload encoding',
        defaultValue: 'text',
        options: [
          { label: 'Text (UTF-8)', value: 'text' },
          { label: 'Hex bytes', value: 'hex' },
        ],
      },
      { key: 'payload', label: 'Payload', multiline: true, autoCapitalize: 'none' },
    ],
    build: (d) => [mimeRecord(d.mime.trim(), d.encoding === 'hex' ? fromHex(d.payload ?? '') : d.payload ?? '')],
    summary: (d) => d.mime,
    validate: (d) => {
      if (!/^[\w.+-]+\/[\w.+-]+$/.test(d.mime?.trim() ?? '')) return 'MIME type looks like type/subtype';
      if (d.encoding === 'hex') {
        try {
          fromHex(d.payload ?? '');
        } catch (e: any) {
          return e.message;
        }
      }
      return null;
    },
  },
  {
    kind: 'external',
    label: 'External type',
    icon: 'extension-puzzle',
    group: 'Advanced',
    description: 'NFC Forum external (domain:type)',
    fields: [
      { key: 'type', label: 'Type', required: true, autoCapitalize: 'none', placeholder: 'example.com:mytype' },
      {
        key: 'encoding',
        label: 'Payload encoding',
        defaultValue: 'text',
        options: [
          { label: 'Text (UTF-8)', value: 'text' },
          { label: 'Hex bytes', value: 'hex' },
        ],
      },
      { key: 'payload', label: 'Payload', multiline: true, autoCapitalize: 'none' },
    ],
    build: (d) => [externalRecord(d.type.trim().toLowerCase(), d.encoding === 'hex' ? fromHex(d.payload ?? '') : d.payload ?? '')],
    summary: (d) => d.type,
    validate: (d) => (/^[^:\s]+:[^:\s]+$/.test(d.type?.trim() ?? '') ? null : 'Type must look like domain:type'),
  },
  {
    kind: 'raw',
    label: 'Raw NDEF message',
    icon: 'hardware-chip',
    group: 'Advanced',
    description: 'Paste a full NDEF message in hex',
    fields: [{ key: 'hex', label: 'NDEF bytes (hex)', required: true, multiline: true, autoCapitalize: 'none', placeholder: 'D1 01 0C 55 04 65 78 61 6D 70 6C 65 2E 63 6F 6D' }],
    build: (d) => decodeMessage(fromHex(d.hex)),
    summary: (d) => `${fromHexSafe(d.hex)} bytes`,
    validate: (d) => {
      try {
        const recs = decodeMessage(fromHex(d.hex ?? ''));
        return recs.length ? null : 'No records found';
      } catch (e: any) {
        return e.message;
      }
    },
  },
  {
    kind: 'empty',
    label: 'Empty record',
    icon: 'remove-circle-outline',
    group: 'Advanced',
    description: 'A blank NDEF record',
    fields: [],
    build: () => [EMPTY_RECORD],
    summary: () => '—',
  },
];

function fromHexSafe(h: string) {
  try {
    return fromHex(h).length;
  } catch {
    return '?';
  }
}

export function getDef(kind: RecordKind): RecordDef {
  return RECORD_DEFS.find((d) => d.kind === kind)!;
}

export function defaultData(kind: RecordKind): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of getDef(kind).fields) {
    if (f.defaultValue !== undefined) out[f.key] = typeof f.defaultValue === 'function' ? f.defaultValue() : f.defaultValue;
  }
  return out;
}

export function buildRecords(drafts: RecordDraft[]): NdefRec[] {
  return drafts.flatMap((d) => getDef(d.kind).build(d.data));
}

/**
 * Replaces {n} / {n:000} placeholders with a counter so batch writes can number tags.
 * Returns the draft untouched when no placeholder is present.
 */
export function applyCounter(drafts: RecordDraft[], n: number): RecordDraft[] {
  return drafts.map((d) => ({
    ...d,
    data: Object.fromEntries(
      Object.entries(d.data).map(([k, v]) => [
        k,
        v.replace(/\{n(?::(0+))?\}/g, (_, pad?: string) => String(n).padStart(pad ? pad.length : 0, '0')),
      ]),
    ),
  }));
}

export function hasCounter(drafts: RecordDraft[]): boolean {
  return drafts.some((d) => Object.values(d.data).some((v) => /\{n(?::0+)?\}/.test(v)));
}
