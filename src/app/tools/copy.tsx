import { useState } from 'react';
import { View } from 'react-native';
import { RecordCard } from '@/components/TagView';
import { space } from '@/components/theme';
import { Button, Card, Notice, SectionTitle, Screen, ToggleRow, Txt, confirm } from '@/components/ui';
import { useNfcAction } from '@/components/useNfcAction';
import { Bytes } from '@/lib/bytes';
import { decodeMessage } from '@/lib/ndef';
import { copyBuffer } from '@/lib/storage';
import { readMessageBytes, writeRawMessage } from '@/lib/tagops';

export default function CopyTool() {
  const { busy, run } = useNfcAction();
  const [source, setSource] = useState<{ bytes: Bytes; source: string } | null>(copyBuffer.get());
  const [copies, setCopies] = useState(0);
  const [lock, setLock] = useState(false);

  const readSource = async () => {
    const r = await run(readMessageBytes);
    if (r) {
      const s = { bytes: r.bytes, source: r.uid };
      copyBuffer.set(s);
      setSource(s);
      setCopies(0);
    }
  };

  const writeCopy = async () => {
    if (!source) return;
    if (lock && copies === 0 && !(await confirm('Lock copies?', 'Each copy will be permanently read-only.', 'Continue', true))) return;
    const r = await run(() => writeRawMessage(source.bytes, { lock, message: `Hold a blank tag to write copy #${copies + 1}` }));
    if (r) setCopies((n) => n + 1);
  };

  let records: ReturnType<typeof decodeMessage> = [];
  try {
    records = source ? decodeMessage(source.bytes) : [];
  } catch {
    records = [];
  }

  return (
    <Screen>
      <Notice>Copies the NDEF data (links, text, Wi-Fi…) to another tag. The serial number / UID of a tag can’t be changed, so apps that check UIDs will see a different tag.</Notice>

      <SectionTitle>1 · Source</SectionTitle>
      {source ? (
        <>
          <Card>
            <Txt weight="600">
              {source.bytes.length} bytes from {source.source || 'source tag'}
            </Txt>
            <Txt dim size={13}>
              {records.length} record(s)
            </Txt>
          </Card>
          {records.map((r, i) => (
            <RecordCard key={i} record={r} index={i} />
          ))}
          <Button variant="ghost" icon="scan" title="Read a different source tag" onPress={readSource} disabled={busy} />
        </>
      ) : (
        <Button icon="scan" title="Scan source tag" onPress={readSource} loading={busy} />
      )}

      {source && (
        <>
          <SectionTitle>2 · Write copies</SectionTitle>
          <Card padded={false}>
            <ToggleRow title="Lock each copy" subtitle="Permanent" value={lock} onValueChange={setLock} last />
          </Card>
          <View style={{ gap: space.sm }}>
            <Button icon="radio-outline" title={copies ? `Write copy #${copies + 1}` : 'Write copy'} onPress={writeCopy} loading={busy} />
            {copies > 0 && <Notice tone="success">{copies} cop{copies === 1 ? 'y' : 'ies'} written. Tap again for the next tag.</Notice>}
          </View>
        </>
      )}
    </Screen>
  );
}
