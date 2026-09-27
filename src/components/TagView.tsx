import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Share, Text, View } from 'react-native';
import { describe } from '@/lib/describe';
import { NdefRec, encodeMessage } from '@/lib/ndef';
import { copyBuffer, draftStore } from '@/lib/storage';
import { toHex, uid } from '@/lib/bytes';
import type { TagInfo } from '@/lib/tagops';
import { Button, Card, IconBadge, IconButton, KV, Meter, MonoBlock, Notice, Pill, SectionTitle, Txt, copy } from './ui';
import { space, useColors } from './theme';

export function RecordCard({ record, index }: { record: NdefRec; index: number }) {
  const c = useColors();
  const d = describe(record);
  const [open, setOpen] = useState(false);
  return (
    <Card padded={false}>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ padding: space.lg, gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <IconBadge icon={d.icon as any} />
          <View style={{ flex: 1 }}>
            <Txt size={13} dim>
              Record {index + 1} · {d.title}
            </Txt>
            <Txt size={16} weight="500" selectable numberOfLines={open ? undefined : 3}>
              {d.value || '—'}
            </Txt>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.textFaint} />
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {d.action && <Button compact variant="secondary" icon="open-outline" title="Open" onPress={() => Linking.openURL(d.action!).catch(() => {})} />}
          <Button compact variant="ghost" icon="copy-outline" title="Copy" onPress={() => copy(d.value)} />
        </View>
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm }}>
          {d.details.map((x, i) => (
            <KV key={x.label + i} label={x.label} value={x.value} last={i === d.details.length - 1} />
          ))}
          <MonoBlock text={toHex(record.payload) || '(no payload)'} />
        </View>
      )}
    </Card>
  );
}

export function TagView({ info, onSave }: { info: TagInfo; onSave?: () => void }) {
  const c = useColors();
  const messageBytes = info.records.length ? encodeMessage(info.records) : [];

  const shareAll = () => {
    const lines = [
      `UID: ${info.uid}`,
      `Tech: ${info.techTypes.join(', ')}`,
      info.chip && `Chip: ${info.chip.name}`,
      info.ndefType && `Type: ${info.ndefType}`,
      info.maxSize != null && `Memory: ${info.usedSize}/${info.maxSize} bytes`,
      '',
      ...info.records.map((r, i) => {
        const d = describe(r);
        return `#${i + 1} ${d.title}: ${d.value}`;
      }),
      '',
      info.messageHex && `NDEF: ${info.messageHex}`,
    ].filter((x) => x !== false && x !== undefined);
    Share.share({ message: lines.join('\n') });
  };

  const cloneToWriter = () => {
    draftStore.set([{ id: uid('d'), kind: 'raw', data: { hex: toHex(messageBytes) } }]);
    router.navigate('/write');
  };

  const stageCopy = () => {
    copyBuffer.set({ bytes: messageBytes, source: info.uid });
    router.push('/tools/copy');
  };

  return (
    <View style={{ gap: space.lg }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md }}>
          <IconBadge icon="radio-outline" size={44} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt size={18} weight="700">
              {info.chip?.name ?? info.ndefType ?? info.techTypes[0] ?? 'NFC tag'}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {info.ndefSupported ? <Pill text="NDEF" tone="info" /> : <Pill text="Not NDEF" tone="neutral" />}
              {info.writable === true && <Pill text="Writable" tone="success" />}
              {info.writable === false && <Pill text="Read-only" tone="danger" />}
              {info.chip?.passwordProtected && <Pill text={info.chip.readProtected ? 'Password (R/W)' : 'Password (W)'} tone="warning" />}
            </View>
          </View>
          <IconButton icon="share-outline" label="Share" onPress={shareAll} />
        </View>
        <KV label="Serial / UID" value={info.uid || '—'} monospace onCopy />
        <KV label="Technologies" value={info.techTypes.join(', ')} />
        <KV label="Tag type" value={info.ndefType} />
        <KV label="Chip" value={info.chip?.name} />
        <KV label="Can lock" value={info.canMakeReadOnly == null ? undefined : info.canMakeReadOnly ? 'Yes' : 'No'} />
        <KV label="Scan counter" value={info.chip?.counter ?? undefined} />
        <KV label="Records" value={info.records.length} last />
        {info.maxSize != null && info.maxSize > 0 && (
          <View style={{ marginTop: space.md }}>
            <Meter used={info.usedSize} total={info.maxSize} />
          </View>
        )}
      </Card>

      {info.records.length > 0 ? (
        <>
          <SectionTitle>Data</SectionTitle>
          {info.records.map((r, i) => (
            <RecordCard key={i} record={r} index={i} />
          ))}
        </>
      ) : (
        <Notice tone="info">{info.ndefSupported ? 'This tag is empty — no NDEF records.' : 'This tag does not contain NDEF data. See the technical details below, or use Tools → Memory to inspect raw memory.'}</Notice>
      )}

      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        {onSave && <Button compact variant="secondary" icon="bookmark-outline" title="Rename / save" onPress={onSave} />}
        {messageBytes.length > 0 && <Button compact variant="secondary" icon="duplicate-outline" title="Copy to tags" onPress={stageCopy} />}
        {messageBytes.length > 0 && <Button compact variant="ghost" icon="create-outline" title="Edit & rewrite" onPress={cloneToWriter} />}
      </View>

      <SectionTitle>Technical details</SectionTitle>
      <Card>
        <KV label="UID (hex)" value={info.uid.replace(/:/g, '')} monospace onCopy />
        <KV label="UID (decimal)" value={uidDecimal(info.uid)} monospace onCopy />
        <KV label="UID (reversed)" value={info.uid.split(':').reverse().join(':')} monospace onCopy />
        <KV label="GET_VERSION" value={info.chip?.version} monospace />
        <KV label="User memory" value={info.chip?.userBytes ? `${info.chip.userBytes} bytes · ${info.chip.totalPages} pages` : undefined} />
        <KV label="NDEF capacity" value={info.maxSize ? `${info.maxSize} bytes` : undefined} />
        <KV label="Signature" value={info.chip?.signature} monospace onCopy />
        <KV label="ISO15693 blocks" value={info.iso15693?.blockCount ? `${info.iso15693.blockCount} × ${info.iso15693.blockSize} bytes` : undefined} />
        <KV label="DSFID / AFI" value={info.iso15693 && info.iso15693.dsfid != null ? `${info.iso15693.dsfid} / ${info.iso15693.afi ?? '—'}` : undefined} />
        <KV label="IC reference" value={info.iso15693?.icReference} />
        <KV label="Selected AID" value={info.iso7816?.initialSelectedAID} monospace />
        <KV label="Historical bytes" value={info.iso7816?.historicalBytes} monospace />
        <KV label="FeliCa IDm" value={info.felica?.idm} monospace />
        <KV label="System code" value={info.felica?.systemCode} monospace last />
        {!!info.messageHex && (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Txt dim size={13}>
              NDEF message · {messageBytes.length} bytes (long-press to copy)
            </Txt>
            <MonoBlock text={info.messageHex} />
          </View>
        )}
      </Card>
      <Text style={{ color: c.textFaint, fontSize: 12, textAlign: 'center' }}>Tap a value to copy it.</Text>
    </View>
  );
}

function uidDecimal(uidStr: string): string | undefined {
  const hex = uidStr.replace(/:/g, '');
  if (!hex || hex.length > 26) return undefined;
  try {
    return BigInt('0x' + hex).toString(10);
  } catch {
    return undefined;
  }
}
