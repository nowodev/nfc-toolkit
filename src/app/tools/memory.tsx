import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { mono, space, useColors } from '@/components/theme';
import { Button, Card, Field, IconButton, Notice, Screen, SectionTitle, Txt } from '@/components/ui';
import { useNfcAction } from '@/components/useNfcAction';
import { asciiPreview, fromHex, toHex } from '@/lib/bytes';
import { isIOS } from '@/lib/nfc';
import { MemoryDump, dumpMemory } from '@/lib/tagops';

export default function MemoryTool() {
  const c = useColors();
  const { busy, run } = useNfcAction();
  const [pass, setPass] = useState('');
  const [keys, setKeys] = useState('');
  const [dump, setDump] = useState<MemoryDump | null>(null);

  const read = async () => {
    let extra: number[][] = [];
    try {
      extra = keys
        .split(/[\n,]/)
        .map((k) => k.trim())
        .filter(Boolean)
        .map(fromHex)
        .filter((k) => k.length === 6);
    } catch {
      extra = [];
    }
    const r = await run(() => dumpMemory(pass || undefined, extra));
    if (r) setDump(r);
  };

  const asText = (d: MemoryDump) =>
    [
      `${d.chipName} · UID ${d.uid}`,
      ...d.rows.map((r) => `${d.unit} ${String(r.index).padStart(3, ' ')}: ${r.bytes ? toHex(r.bytes) : '?? (locked)'}${r.label ? '  ; ' + r.label : ''}`),
    ].join('\n');

  const readable = dump?.rows.filter((r) => r.bytes).length ?? 0;

  return (
    <Screen>
      <Notice>
        Reads raw memory {isIOS ? 'from NTAG / Ultralight and ISO 15693 tags' : 'from NTAG / Ultralight, ISO 15693 and MIFARE Classic tags (tries common default keys)'}. Hold the phone still — large tags take a few seconds.
      </Notice>
      <Card>
        <View style={{ gap: space.lg }}>
          <Field label="Tag password (optional)" value={pass} onChangeText={setPass} secureTextEntry autoCapitalize="none" help="For password-protected NTAG / Ultralight EV1 tags." />
          {!isIOS && (
            <Field label="Extra MIFARE Classic keys (optional)" value={keys} onChangeText={setKeys} autoCapitalize="characters" placeholder="A0A1A2A3A4A5, FFFFFFFFFFFF" help="6-byte keys in hex, comma or line separated." />
          )}
        </View>
      </Card>
      <Button icon="grid" title="Read memory" onPress={read} loading={busy} />

      {dump && (
        <>
          <SectionTitle right={<IconButton icon="share-outline" label="Share dump" onPress={() => Share.share({ message: asText(dump) })} />}>
            {dump.chipName}
          </SectionTitle>
          <Txt dim size={13}>
            {readable}/{dump.rows.length} {dump.unit.toLowerCase()}s readable · UID {dump.uid}
          </Txt>
          <Card padded={false}>
            {dump.rows.map((r) => (
              <View key={r.index} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 6, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
                <Text style={[mono, { color: c.textFaint, fontSize: 12, width: 34 }]}>{r.index.toString(16).toUpperCase().padStart(2, '0')}</Text>
                <Text selectable style={[mono, { color: r.bytes ? c.mono : c.danger, fontSize: 12, flex: 1 }]}>
                  {r.bytes ? toHex(r.bytes) : '?? locked / no key'}
                </Text>
                {r.bytes && dump.unit === 'Page' && <Text style={[mono, { color: c.textDim, fontSize: 12, width: 40 }]}>{asciiPreview(r.bytes)}</Text>}
                {r.label && <Text style={{ color: c.primary, fontSize: 11, maxWidth: 110 }} numberOfLines={1}>{r.label}</Text>}
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
