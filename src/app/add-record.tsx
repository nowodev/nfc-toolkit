import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { space } from '@/components/theme';
import { Button, Card, Chips, Field, ListItem, Notice, SectionTitle, Screen, Txt } from '@/components/ui';
import { uid } from '@/lib/bytes';
import { encodeMessage } from '@/lib/ndef';
import { RECORD_DEFS, RecordDef, RecordKind, defaultData, getDef } from '@/lib/records';
import { draftStore, upsertDraft } from '@/lib/storage';

const GROUPS: RecordDef['group'][] = ['Common', 'Contact & Social', 'Connectivity', 'Automation', 'Advanced'];

export default function AddRecord() {
  const params = useLocalSearchParams<{ id?: string; kind?: RecordKind }>();
  const existing = params.id ? draftStore.get().find((d) => d.id === params.id) : undefined;
  const [kind, setKind] = useState<RecordKind | null>(existing?.kind ?? params.kind ?? null);
  const [data, setData] = useState<Record<string, string>>(existing?.data ?? (kind ? defaultData(kind) : {}));
  const [touched, setTouched] = useState(false);

  const pick = (k: RecordKind) => {
    setKind(k);
    setData(defaultData(k));
  };

  if (!kind) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Add record' }} />
        {GROUPS.map((g) => {
          const defs = RECORD_DEFS.filter((d) => d.group === g);
          return (
            <View key={g} style={{ gap: space.md }}>
              <SectionTitle>{g}</SectionTitle>
              <Card padded={false}>
                {defs.map((d, i) => (
                  <ListItem key={d.kind} icon={d.icon as any} title={d.label} subtitle={d.description} onPress={() => pick(d.kind)} last={i === defs.length - 1} />
                ))}
              </Card>
            </View>
          );
        })}
      </Screen>
    );
  }

  return <RecordForm def={getDef(kind)} data={data} setData={setData} touched={touched} setTouched={setTouched} existingId={existing?.id} onBack={existing ? undefined : () => setKind(null)} />;
}

function RecordForm({ def, data, setData, touched, setTouched, existingId, onBack }: {
  def: RecordDef;
  data: Record<string, string>;
  setData: (d: Record<string, string>) => void;
  touched: boolean;
  setTouched: (t: boolean) => void;
  existingId?: string;
  onBack?: () => void;
}) {
  const error = def.validate?.(data) ?? null;
  const size = useMemo(() => {
    if (error) return null;
    try {
      return encodeMessage(def.build(data)).length;
    } catch {
      return null;
    }
  }, [def, data, error]);

  const save = () => {
    setTouched(true);
    if (error) return;
    upsertDraft({ id: existingId ?? uid('d'), kind: def.kind, data });
    router.back();
  };

  const set = (k: string, v: string) => setData({ ...data, [k]: v });

  return (
    <Screen>
      <Stack.Screen options={{ title: def.label }} />
      <Txt dim>{def.description}</Txt>
      {def.kind === 'wifi' && <Notice>Android joins the network on tap. iPhones can’t auto-join Wi-Fi from NFC — use an iOS Shortcut record for that.</Notice>}
      {def.kind === 'bluetooth' && <Notice>Android pairs on tap. iPhones don’t support NFC Bluetooth pairing.</Notice>}
      {def.kind === 'shortcut' && <Notice>Create the Shortcut in the Shortcuts app first; the name must match exactly. For no-prompt automations, use Shortcuts → Automation → NFC instead.</Notice>}
      {def.kind === 'app' && <Notice>Android only. Opens the app, or its Play Store page if it isn’t installed.</Notice>}

      <Card>
        <View style={{ gap: space.lg }}>
          {def.fields.length === 0 && <Txt dim>No settings for this record.</Txt>}
          {def.fields.map((f) =>
            f.options ? (
              <Chips key={f.key} label={f.label} options={f.options} value={data[f.key] ?? f.options[0].value} onChange={(v) => set(f.key, v)} />
            ) : (
              <Field
                key={f.key}
                label={f.label + (f.required ? ' *' : '')}
                value={data[f.key] ?? ''}
                onChangeText={(v) => set(f.key, v)}
                placeholder={f.placeholder}
                multiline={f.multiline}
                keyboardType={f.keyboard}
                secureTextEntry={f.secure}
                autoCapitalize={f.autoCapitalize ?? 'sentences'}
                autoCorrect={!f.secure && f.autoCapitalize !== 'none'}
                help={f.help}
              />
            ),
          )}
        </View>
      </Card>

      {touched && error && <Notice tone="danger">{error}</Notice>}
      {size !== null && <Txt dim size={13}>This record takes {size} bytes.</Txt>}

      <Button title={existingId ? 'Save changes' : 'Add record'} icon="checkmark" onPress={save} />
      {onBack && <Button variant="ghost" title="Choose a different type" onPress={onBack} />}
    </Screen>
  );
}
