/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromHex, toHex, utf8Decode, utf8Encode, indexOfSeq } from '../src/lib/bytes';
import { describe } from '../src/lib/describe';
import { decodeMessage, encodeMessage, ndefTlv, textRecord, uriRecord, decodeText } from '../src/lib/ndef';
import { RECORD_DEFS, RecordKind, applyCounter, buildRecords, defaultData } from '../src/lib/records';

test('URI record matches NFC Forum reference bytes', () => {
  assert.equal(toHex(encodeMessage([uriRecord('https://example.com')])), 'D1 01 0C 55 04 65 78 61 6D 70 6C 65 2E 63 6F 6D');
  // Longest prefix wins: https://www. (0x02) over https:// (0x04)
  assert.equal(uriRecord('https://www.a.com').payload[0], 0x02);
  assert.equal(uriRecord('tel:+15551234').payload[0], 0x05);
  assert.equal(uriRecord('spotify:track:1').payload[0], 0x00);
});

test('Text record matches reference bytes', () => {
  assert.equal(toHex(encodeMessage([textRecord('hello', 'en')])), 'D1 01 08 54 02 65 6E 68 65 6C 6C 6F');
});

test('UTF-8 round trip incl. emoji and accents', () => {
  const s = 'Héllo 👋 世界';
  assert.equal(utf8Decode(utf8Encode(s)), s);
  assert.equal(decodeText(textRecord(s).payload).text, s);
});

test('Multi-record and long (>255 byte) payloads round trip', () => {
  const long = 'x'.repeat(600);
  const recs = [uriRecord('https://a.io'), textRecord(long), textRecord('end')];
  const bytes = encodeMessage(recs);
  assert.equal(bytes[0] & 0x80, 0x80, 'first record has MB');
  const back = decodeMessage(bytes);
  assert.equal(back.length, 3);
  assert.equal(decodeText(back[1].payload).text, long);
  assert.equal(back[2].payload.length, recs[2].payload.length);
});

test('Chunked records are reassembled', () => {
  // Two chunks of a text record: "ab" + "cd" (payload incl. status+lang only in first chunk)
  const first = [0xb1, 0x01, 0x05, 0x54, 0x02, 0x65, 0x6e, 0x61, 0x62]; // MB|CF|SR|TNF1
  const last = [0x56, 0x00, 0x02, 0x63, 0x64]; // ME|SR|TNF6 (unchanged)
  const recs = decodeMessage([...first, ...last]);
  assert.equal(recs.length, 1);
  assert.equal(decodeText(recs[0].payload).text, 'abcd');
});

test('TLV wrapping for Type 2 tags', () => {
  assert.deepEqual(ndefTlv([1, 2, 3]), [0x03, 0x03, 1, 2, 3, 0xfe]);
  const big = ndefTlv(new Array(300).fill(0));
  assert.deepEqual(big.slice(0, 4), [0x03, 0xff, 0x01, 0x2c]);
});

const SAMPLES: Partial<Record<RecordKind, Record<string, string>>> = {
  text: { text: 'Hello', lang: 'en' },
  url: { url: 'example.com/path' },
  search: { engine: 'google', query: 'nfc tags' },
  location: { lat: '37.7749', lng: '-122.4194', format: 'maps' },
  address: { address: '1 Main St, Springfield', format: 'geo' },
  contact: { firstName: 'Ada', lastName: 'Lovelace', phone: '+15551234', email: 'ada@example.com', org: 'Analytical, Inc.' },
  email: { to: 'hi@example.com', subject: 'Hi there', body: 'Line 1' },
  phone: { number: '+1 (555) 123-4567', type: 'tel' },
  sms: { number: '+15551234', body: 'On my way' },
  social: { network: 'instagram', username: '@someone' },
  wifi: { ssid: 'HomeNet', auth: 'wpa2', password: 'supersecret' },
  bluetooth: { mac: '00:11:22:AA:BB:CC', name: 'Speaker' },
  shortcut: { name: 'Lights On' },
  app: { pkg: 'com.spotify.music' },
  homeassistant: { tagId: 'abc-123' },
  uri: { uri: 'spotify:playlist:1' },
  smartposter: { url: 'https://example.com', title: 'Example' },
  mime: { mime: 'application/json', encoding: 'text', payload: '{"a":1}' },
  external: { type: 'example.com:thing', encoding: 'hex', payload: 'DEAD BEEF' },
  raw: { hex: 'D1 01 0C 55 04 65 78 61 6D 70 6C 65 2E 63 6F 6D' },
  empty: {},
};

const EXPECTED_VALUE: Partial<Record<RecordKind, string>> = {
  text: 'Hello',
  url: 'https://example.com/path',
  search: 'https://www.google.com/search?q=nfc%20tags',
  location: '37.7749,-122.4194',
  address: '0,0?q=1 Main St, Springfield',
  contact: 'Ada Lovelace',
  email: 'hi@example.com',
  phone: '+15551234567',
  sms: '+15551234',
  social: 'https://instagram.com/someone',
  wifi: 'HomeNet',
  bluetooth: 'Speaker',
  shortcut: 'Lights On',
  app: 'com.spotify.music',
  homeassistant: 'abc-123',
  uri: 'spotify:playlist:1',
  smartposter: 'Example',
  mime: '{"a":1}',
  external: 'DE AD BE EF',
  raw: 'https://example.com',
  empty: '(empty)',
};

for (const def of RECORD_DEFS) {
  test(`record type "${def.kind}" builds, validates and decodes`, () => {
    const data = { ...defaultData(def.kind), ...SAMPLES[def.kind] };
    assert.equal(def.validate?.(data) ?? null, null, 'sample data should be valid');
    const bytes = encodeMessage(def.build(data));
    const back = decodeMessage(bytes);
    assert.ok(back.length >= 1);
    const d = describe(back[0]);
    assert.equal(d.value, EXPECTED_VALUE[def.kind], `${def.kind} → ${d.title}`);
  });
}

test('Wi-Fi record exposes password and security type', () => {
  const d = describe(decodeMessage(encodeMessage(buildRecords([{ id: '1', kind: 'wifi', data: SAMPLES.wifi! }])))[0]);
  assert.equal(d.details.find((x) => x.label === 'Password')?.value, 'supersecret');
  assert.equal(d.details.find((x) => x.label === 'Security')?.value, 'WPA2-Personal');
});

test('Validation rejects bad input', () => {
  const byKind = Object.fromEntries(RECORD_DEFS.map((d) => [d.kind, d]));
  assert.ok(byKind.wifi.validate!({ ssid: 'x', auth: 'wpa2', password: 'short' }));
  assert.ok(byKind.email.validate!({ to: 'not-an-email' }));
  assert.ok(byKind.location.validate!({ lat: '100', lng: '0' }));
  assert.ok(byKind.bluetooth.validate!({ mac: '00:11' }));
  assert.ok(byKind.app.validate!({ pkg: 'nodots' }));
  assert.ok(byKind.raw.validate!({ hex: 'ZZ' }));
});

test('Batch numbering placeholders', () => {
  const drafts = [{ id: '1', kind: 'url' as const, data: { url: 'https://x.io/{n:000}?b={n}' } }];
  assert.equal(applyCounter(drafts, 7)[0].data.url, 'https://x.io/007?b=7');
});

test('Dynamic URL placeholder offset is findable in the TLV', () => {
  const msg = encodeMessage([uriRecord('https://example.com/s?id=00000000000000')]);
  const idx = indexOfSeq(msg, utf8Encode('00000000000000'));
  const tlv = ndefTlv(msg);
  assert.equal(utf8Decode(tlv.slice(2 + idx, 2 + idx + 14)), '00000000000000');
});

test('Hex parsing accepts common formats', () => {
  assert.deepEqual(fromHex('04:a2 0xFF,10'), [0x04, 0xa2, 0xff, 0x10]);
  assert.throws(() => fromHex('ABC'));
});
