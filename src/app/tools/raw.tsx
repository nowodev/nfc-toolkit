import { useState } from 'react';
import { Alert, View } from 'react-native';
import { mono, space, useColors } from '@/components/theme';
import { Button, Card, Chips, Field, ListItem, Notice, Screen, SectionTitle, Txt } from '@/components/ui';
import { useNfcAction } from '@/components/useNfcAction';
import { fromHex } from '@/lib/bytes';
import { isIOS } from '@/lib/nfc';
import { RawResult, RawTech, runRawCommands } from '@/lib/tagops';

const PRESETS: Record<RawTech, { label: string; cmd: string }[]> = {
  NfcA: [
    { label: 'GET_VERSION', cmd: '60' },
    { label: 'READ pages 0–3', cmd: '30 00' },
    { label: 'READ pages 4–7', cmd: '30 04' },
    { label: 'READ_SIG (originality)', cmd: '3C 00' },
    { label: 'READ_CNT (NFC counter)', cmd: '39 02' },
    { label: 'PWD_AUTH FFFFFFFF', cmd: '1B FF FF FF FF' },
  ],
  IsoDep: [
    { label: 'SELECT NDEF app', cmd: '00 A4 04 00 07 D2 76 00 00 85 01 01 00' },
    { label: 'SELECT CC file', cmd: '00 A4 00 0C 02 E1 03' },
    { label: 'READ BINARY 15 bytes', cmd: '00 B0 00 00 0F' },
    { label: 'GET CHALLENGE', cmd: '00 84 00 00 08' },
  ],
  NfcV: [
    { label: 'Get System Info', cmd: '02 2B' },
    { label: 'Read block 0', cmd: '02 20 00' },
    { label: 'Read blocks 0–3', cmd: '02 23 00 03' },
  ],
};

export default function RawTool() {
  const c = useColors();
  const { busy, run } = useNfcAction();
  const [tech, setTech] = useState<RawTech>('NfcA');
  const [script, setScript] = useState('60');
  const [results, setResults] = useState<RawResult[]>([]);

  const send = async () => {
    let cmds: number[][];
    try {
      cmds = script
        .split('\n')
        .map((l) => l.replace(/[#;].*$/, '').trim())
        .filter(Boolean)
        .map(fromHex);
    } catch (e: any) {
      return Alert.alert('Invalid hex', e.message);
    }
    if (!cmds.length) return;
    const r = await run(() => runRawCommands(tech, cmds));
    if (r) setResults(r);
  };

  return (
    <Screen>
      <Notice tone="warning">For experts. Raw commands go straight to the chip — a wrong WRITE or lock command can permanently brick a tag.</Notice>
      <Chips
        label="Technology"
        options={[
          { label: 'NFC-A (NTAG / MIFARE)', value: 'NfcA' as RawTech },
          { label: 'ISO-DEP (APDU)', value: 'IsoDep' as RawTech },
          ...(isIOS ? [] : [{ label: 'NFC-V (ISO 15693)', value: 'NfcV' as RawTech }]),
        ]}
        value={tech}
        onChange={(t) => {
          setTech(t);
          setScript(PRESETS[t][0].cmd);
        }}
      />
      <Card>
        <Field
          label="Commands (hex, one per line)"
          value={script}
          onChangeText={setScript}
          multiline
          autoCapitalize="characters"
          autoCorrect={false}
          style={mono}
          help="All lines are sent in one tap. Text after # is a comment."
        />
      </Card>
      <Button icon="send" title={`Send ${script.split('\n').filter((l) => l.replace(/[#;].*$/, '').trim()).length || ''} command(s)`} onPress={send} loading={busy} />

      {results.length > 0 && (
        <>
          <SectionTitle>Responses</SectionTitle>
          <Card>
            <View style={{ gap: space.md }}>
              {results.map((r, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <Txt monospace size={12} dim>
                    → {r.cmd}
                  </Txt>
                  <Txt monospace size={13} selectable style={{ color: r.ok ? c.success : c.danger }}>
                    ← {r.response}
                  </Txt>
                </View>
              ))}
            </View>
          </Card>
        </>
      )}

      <SectionTitle>Presets</SectionTitle>
      <Card padded={false}>
        {PRESETS[tech].map((p, i) => (
          <ListItem key={p.cmd} title={p.label} subtitle={p.cmd} onPress={() => setScript((s) => (s.trim() ? `${s.trim()}\n${p.cmd}` : p.cmd))} right={<Txt dim size={13}>add</Txt>} last={i === PRESETS[tech].length - 1} />
        ))}
      </Card>
    </Screen>
  );
}
