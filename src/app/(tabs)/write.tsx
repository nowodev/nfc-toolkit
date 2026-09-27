import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { space, useColors } from '@/components/theme';
import {
  Button,
  Card,
  Empty,
  Field,
  IconButton,
  ListItem,
  Notice,
  SectionTitle,
  Screen,
  ToggleRow,
  Txt,
  confirm,
} from '@/components/ui';
import { useNfcAction } from '@/components/useNfcAction';
import { encodeMessage, tlvSize } from '@/lib/ndef';
import { buildRecords, getDef, hasCounter } from '@/lib/records';
import {
  addHistory,
  deleteTemplate,
  draftStore,
  moveDraft,
  removeDraft,
  saveTemplate,
  settingsStore,
  useDraft,
  useSettings,
  useTemplates,
} from '@/lib/storage';
import { writeMessage } from '@/lib/tagops';

const COMMON_SIZES = [
  { name: 'NTAG213', bytes: 144 },
  { name: 'NTAG215', bytes: 504 },
  { name: 'NTAG216', bytes: 888 },
];

export default function WriteScreen() {
  const c = useColors();
  const drafts = useDraft();
  const templates = useTemplates();
  const settings = useSettings();
  const { busy, run } = useNfcAction();
  const [lock, setLock] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [templateName, setTemplateName] = useState<string | null>(null);

  const { bytes, error } = useMemo(() => {
    try {
      return { bytes: encodeMessage(buildRecords(drafts)), error: null as string | null };
    } catch (e: any) {
      return { bytes: [] as number[], error: e?.message ?? 'Invalid record' };
    }
  }, [drafts]);

  const size = drafts.length ? tlvSize(bytes.length) : 0;

  const write = async () => {
    if (!drafts.length) return;
    if (error) return Alert.alert('Fix the records first', error);
    const lockIt = lock && !usePassword;
    if (lockIt && !(await confirm('Lock after writing?', 'Locking is PERMANENT. The tag can never be changed or erased again.', 'Write & lock', true))) return;
    if (usePassword && !password) return Alert.alert('Password needed', 'Enter the tag password, or turn off “Tag is password protected”.');
    const records = buildRecords(drafts);
    const result = await run(() =>
      writeMessage(records, { lock: lockIt, verify: settings.verifyAfterWrite, password: usePassword ? password : undefined }),
    );
    if (result) {
      addHistory('write', {
        uid: result.uid,
        techTypes: [],
        ndefSupported: true,
        records,
        usedSize: result.bytes,
        maxSize: result.capacity,
        messageHex: '',
        writable: !lockIt,
      });
      Alert.alert('Written ✓', `${result.bytes} bytes written${result.capacity ? ` of ${result.capacity}` : ''}${result.verified ? ' and verified' : ''}.${lockIt ? '\nThe tag is now locked.' : ''}`);
    }
  };

  return (
    <Screen>
      {drafts.length === 0 ? (
        <Card>
          <Empty icon="create-outline" title="What should the tag do?" subtitle="Add one or more records — a link, Wi-Fi login, contact card, text and more. Phones handle the first record when scanned.">
            <Button title="Add a record" icon="add" onPress={() => router.push('/add-record')} />
          </Empty>
        </Card>
      ) : (
        <>
          <SectionTitle right={<IconButton icon="trash-outline" label="Clear all" onPress={async () => (await confirm('Clear all records?', '', 'Clear', true)) && draftStore.set([])} />}>
            Records ({drafts.length})
          </SectionTitle>
          <Card padded={false}>
            {drafts.map((d, i) => {
              const def = getDef(d.kind);
              let summary = '';
              try {
                summary = def.summary(d.data);
              } catch {
                summary = '(invalid)';
              }
              return (
                <ListItem
                  key={d.id}
                  icon={def.icon as any}
                  title={def.label}
                  subtitle={summary}
                  onPress={() => router.push({ pathname: '/add-record', params: { id: d.id } })}
                  right={
                    <View style={{ flexDirection: 'row' }}>
                      {i > 0 && <IconButton icon="arrow-up" label="Move up" onPress={() => moveDraft(d.id, -1)} />}
                      <IconButton icon="close" label="Remove" color={c.danger} onPress={() => removeDraft(d.id)} />
                    </View>
                  }
                  last={i === drafts.length - 1}
                />
              );
            })}
          </Card>
          <Button variant="secondary" icon="add" title="Add another record" onPress={() => router.push('/add-record')} />

          <Card>
            <Txt weight="600">Size: {size} bytes</Txt>
            <Txt dim size={13}>
              {COMMON_SIZES.map((s) => `${s.name} ${size <= s.bytes ? '✓' : '✗'}`).join('   ·   ')}
            </Txt>
            {error && (
              <View style={{ marginTop: space.sm }}>
                <Notice tone="danger">{error}</Notice>
              </View>
            )}
            {hasCounter(drafts) && (
              <View style={{ marginTop: space.sm }}>
                <Notice>{'{n}'} placeholders are filled in by Batch write. A single write uses the text as-is.</Notice>
              </View>
            )}
          </Card>

          <Card padded={false}>
            <ToggleRow title="Verify after writing" subtitle="Reads the tag back to confirm" value={settings.verifyAfterWrite} onValueChange={(v) => settingsStore.set((s) => ({ ...s, verifyAfterWrite: v }))} />
            {!usePassword && <ToggleRow title="Lock tag after writing" subtitle="Permanent — makes the tag read-only" value={lock} onValueChange={setLock} />}
            <ToggleRow title="Tag is password protected" subtitle="NTAG21x / Ultralight EV1 only" value={usePassword} onValueChange={setUsePassword} last={!usePassword} />
            {usePassword && (
              <View style={{ padding: space.lg, paddingTop: 0 }}>
                <Field value={password} onChangeText={setPassword} placeholder="Tag password" secureTextEntry autoCapitalize="none" />
              </View>
            )}
          </Card>

          <Button title={busy ? 'Waiting for tag…' : 'Write to tag'} icon="radio-outline" onPress={write} loading={busy} disabled={!!error} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button style={{ flex: 1 }} compact variant="ghost" icon="copy-outline" title="Batch write" onPress={() => router.push('/tools/batch')} />
            <Button style={{ flex: 1 }} compact variant="ghost" icon="bookmark-outline" title="Save template" onPress={() => setTemplateName('')} />
          </View>
          {templateName !== null && (
            <Card>
              <View style={{ gap: space.md }}>
                <Field label="Template name" value={templateName} onChangeText={setTemplateName} placeholder="e.g. Guest Wi-Fi" autoFocus />
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button style={{ flex: 1 }} compact variant="ghost" title="Cancel" onPress={() => setTemplateName(null)} />
                  <Button
                    style={{ flex: 1 }}
                    compact
                    title="Save"
                    disabled={!templateName.trim()}
                    onPress={() => {
                      saveTemplate(templateName.trim(), drafts);
                      setTemplateName(null);
                    }}
                  />
                </View>
              </View>
            </Card>
          )}
        </>
      )}

      {templates.length > 0 && (
        <>
          <SectionTitle>Saved templates</SectionTitle>
          <Card padded={false}>
            {templates.map((t, i) => (
              <ListItem
                key={t.id}
                icon="bookmark"
                title={t.name}
                subtitle={t.drafts.map((d) => getDef(d.kind).label).join(' + ')}
                onPress={async () => {
                  if (drafts.length && !(await confirm('Load template?', 'This replaces the records you are editing.', 'Load'))) return;
                  draftStore.set(t.drafts);
                }}
                right={<IconButton icon="trash-outline" label="Delete template" onPress={async () => (await confirm(`Delete “${t.name}”?`, '', 'Delete', true)) && deleteTemplate(t.id)} />}
                last={i === templates.length - 1}
              />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
