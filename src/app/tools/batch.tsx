import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { space, useColors } from '@/components/theme';
import { Button, Card, Empty, Field, Notice, SectionTitle, Screen, ToggleRow, Txt, confirm, feedback } from '@/components/ui';
import { friendly } from '@/components/useNfcAction';
import { CancelledError, isCancel } from '@/lib/nfc';
import { applyCounter, buildRecords, getDef, hasCounter } from '@/lib/records';
import { addHistory, useDraft } from '@/lib/storage';
import { writeMessage } from '@/lib/tagops';

interface LogLine {
  n: number;
  ok: boolean;
  text: string;
}

export default function BatchWrite() {
  const c = useColors();
  const drafts = useDraft();
  const [start, setStart] = useState('1');
  const [lock, setLock] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const stop = useRef(false);
  const counting = hasCounter(drafts);

  if (!drafts.length) {
    return (
      <Screen>
        <Empty icon="layers-outline" title="Nothing to write" subtitle="Add records on the Write tab first, then come back here to write them to many tags.">
          <Button title="Go to Write" onPress={() => router.navigate('/write')} />
        </Empty>
      </Screen>
    );
  }

  const begin = async () => {
    if (lock && !(await confirm('Lock every tag?', 'Each tag will be permanently read-only.', 'Start', true))) return;
    stop.current = false;
    setRunning(true);
    setLog([]);
    const seen = new Set<string>();
    let n = parseInt(start, 10) || 1;
    let written = 0;
    while (!stop.current) {
      const records = buildRecords(counting ? applyCounter(drafts, n) : drafts);
      try {
        const r = await writeMessage(records, {
          lock,
          message: counting ? `Tap tag for #${n} (${written} written)` : `Tap the next tag (${written} written)`,
        });
        if (skipDuplicates && r.uid && seen.has(r.uid)) {
          setLog((l) => [{ n, ok: false, text: `${r.uid} was already written this batch (overwritten)` }, ...l]);
        } else {
          setLog((l) => [{ n, ok: true, text: `#${n} → ${r.uid || 'tag'} (${r.bytes} bytes)` }, ...l]);
        }
        if (r.uid) seen.add(r.uid);
        addHistory('write', { uid: r.uid, techTypes: [], ndefSupported: true, records, usedSize: r.bytes, maxSize: r.capacity, messageHex: '', writable: !lock });
        feedback.success();
        written++;
        n++;
        await new Promise((res) => setTimeout(res, 700));
      } catch (e) {
        if (e instanceof CancelledError || isCancel(e)) break;
        feedback.error();
        setLog((l) => [{ n, ok: false, text: friendly(e instanceof Error ? e.message : String(e)) }, ...l]);
        const retry = await confirm('Write failed', `${friendly(e instanceof Error ? e.message : String(e))}\n\nContinue with the next tag?`, 'Continue');
        if (!retry) break;
      }
    }
    setRunning(false);
    if (written) Alert.alert('Batch finished', `${written} tag${written === 1 ? '' : 's'} written.`);
  };

  return (
    <Screen>
      <SectionTitle>Data</SectionTitle>
      <Card>
        {drafts.map((d) => {
          const def = getDef(d.kind);
          let s = '';
          try {
            s = def.summary(d.data);
          } catch {
            /* ignore */
          }
          return (
            <Txt key={d.id} numberOfLines={1}>
              • {def.label}: <Txt dim>{s}</Txt>
            </Txt>
          );
        })}
      </Card>

      {counting ? (
        <Card>
          <View style={{ gap: space.md }}>
            <Notice tone="success">Numbering is on: {'{n}'} in your records becomes 1, 2, 3… Use {'{n:000}'} for zero-padding (001, 002…).</Notice>
            <Field label="Start at" value={start} onChangeText={setStart} keyboardType="number-pad" />
          </View>
        </Card>
      ) : (
        <Notice>Tip: put {'{n}'} anywhere in a text or URL (e.g. https://example.com/item/{'{n}'}) to number each tag.</Notice>
      )}

      <Card padded={false}>
        <ToggleRow title="Lock each tag" subtitle="Permanent" value={lock} onValueChange={setLock} />
        <ToggleRow title="Warn on repeated tags" subtitle="Flags a tag scanned twice in this batch" value={skipDuplicates} onValueChange={setSkipDuplicates} last />
      </Card>

      {running ? (
        <Button
          variant="danger"
          icon="stop"
          title="Stop after this tag"
          onPress={() => {
            stop.current = true;
          }}
        />
      ) : (
        <Button icon="play" title="Start batch" onPress={begin} />
      )}
      {running && <Txt dim size={13}>Cancel the scan sheet to stop immediately.</Txt>}

      {log.length > 0 && (
        <>
          <SectionTitle>Log</SectionTitle>
          <Card>
            {log.map((l, i) => (
              <Txt key={i} size={14} style={{ color: l.ok ? c.success : c.danger }}>
                {l.ok ? '✓' : '✗'} {l.text}
              </Txt>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
