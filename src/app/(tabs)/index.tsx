import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { TagView } from '@/components/TagView';
import { Button, Card, IconBadge, IconButton, Notice, Screen, ToggleRow, Txt } from '@/components/ui';
import { space } from '@/components/theme';
import { useNfcAction } from '@/components/useNfcAction';
import { describe } from '@/lib/describe';
import { initNfc, isAndroid, openNfcSettings } from '@/lib/nfc';
import { addHistory, settingsStore, useSettings } from '@/lib/storage';
import { TagInfo, readTag } from '@/lib/tagops';

export default function ReadScreen() {
  const settings = useSettings();
  const { busy, run } = useNfcAction();
  const [info, setInfo] = useState<TagInfo | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [nfc, setNfc] = useState<{ supported: boolean; enabled: boolean } | null>(null);
  const [scanned, setScanned] = useState(0);
  const continuous = useRef(false);

  useFocusEffect(
    useCallback(() => {
      initNfc().then(setNfc);
    }, []),
  );

  const scanOnce = async () => {
    const result = await run(readTag);
    if (!result) return false;
    setInfo(result);
    setScanned((n) => n + 1);
    const entry = addHistory('read', result);
    setEntryId(entry?.id ?? null);
    if (settingsStore.get().autoOpenUrls) {
      const action = result.records.map(describe).find((d) => d.action)?.action;
      if (action) Linking.openURL(action).catch(() => {});
    }
    return true;
  };

  const scan = async () => {
    if (!settingsStore.get().continuousRead) {
      await scanOnce();
      return;
    }
    continuous.current = true;
    while (continuous.current) {
      const ok = await scanOnce();
      if (!ok) break;
      await new Promise((r) => setTimeout(r, 900));
    }
    continuous.current = false;
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} /> }} />

      {nfc && !nfc.supported && (
        <Notice tone="danger">This device doesn’t have NFC, or NFC isn’t available to apps. You can still browse history and saved templates.</Notice>
      )}
      {nfc && nfc.supported && !nfc.enabled && (
        <Card>
          <View style={{ gap: space.md }}>
            <Notice tone="warning">NFC is turned off.</Notice>
            {isAndroid && <Button title="Open NFC settings" icon="settings-outline" onPress={openNfcSettings} />}
          </View>
        </Card>
      )}

      <Card>
        <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
          <IconBadge icon="scan" size={72} />
          <Txt size={20} weight="700">
            Read a tag
          </Txt>
          <Txt dim style={{ textAlign: 'center' }}>
            {`Hold the top of your ${isAndroid ? 'phone’s back' : 'iPhone'} against an NFC tag, card or sticker.`}
          </Txt>
          <Button title={busy ? 'Scanning…' : 'Scan tag'} icon="radio-outline" onPress={scan} loading={busy} style={{ alignSelf: 'stretch' }} />
        </View>
        <View style={{ marginHorizontal: -space.lg, marginBottom: -space.lg, marginTop: space.sm }}>
          <ToggleRow
            title="Continuous reading"
            subtitle={scanned > 0 ? `${scanned} scanned this session` : 'Keep scanning tag after tag'}
            value={settings.continuousRead}
            onValueChange={(v) => {
              settingsStore.set((s) => ({ ...s, continuousRead: v }));
              if (!v) continuous.current = false;
            }}
            last
          />
        </View>
      </Card>

      {info && <TagView info={info} onSave={entryId ? () => router.push({ pathname: '/history/[id]', params: { id: entryId } }) : undefined} />}
    </Screen>
  );
}
