import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSyncExternalStore } from 'react';
import { Alert, Share, View } from 'react-native';
import { Button, Card, ListItem, SectionTitle, Screen, ToggleRow, Txt, confirm } from '@/components/ui';
import { space } from '@/components/theme';
import { clearDiag, getDiag, subscribeDiag } from '@/lib/nfc';
import { clearHistory, makeBackup, restoreBackup, settingsStore, useHistory, useSettings, useTemplates, Settings } from '@/lib/storage';

export default function SettingsScreen() {
  const s = useSettings();
  const history = useHistory();
  const templates = useTemplates();
  const diag = useSyncExternalStore(subscribeDiag, getDiag, getDiag);
  const diagText = () => diag.map((d) => `${stamp(d.t)}  ${d.msg}`).join('\n');
  const set = (patch: Partial<Settings>) => settingsStore.set((prev) => ({ ...prev, ...patch }));

  const exportBackup = async () => {
    try {
      const file = new File(Paths.cache, `nfc-toolkit-backup-${new Date().toISOString().slice(0, 10)}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(makeBackup(), null, 2));
      if (!(await Sharing.isAvailableAsync())) return Alert.alert('Sharing unavailable', 'This device can’t share files.');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save NFC Toolkit backup', UTI: 'public.json' });
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? String(e));
    }
  };

  const importBackup = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
      if (res.canceled) return;
      const text = await new File(res.assets[0].uri).text();
      const r = restoreBackup(text);
      Alert.alert('Import complete', `Added ${r.history} history entries and ${r.templates} templates.`);
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? String(e));
    }
  };

  return (
    <Screen>
      <SectionTitle>General</SectionTitle>
      <Card padded={false}>
        <ToggleRow title="Haptic feedback" value={s.haptics} onValueChange={(v) => set({ haptics: v })} />
        <ToggleRow title="Open links after reading" subtitle="Automatically open the first URL, phone number, etc." value={s.autoOpenUrls} onValueChange={(v) => set({ autoOpenUrls: v })} />
        <ToggleRow title="Verify after writing" subtitle="Read back each write to confirm it" value={s.verifyAfterWrite} onValueChange={(v) => set({ verifyAfterWrite: v })} />
        <ToggleRow title="Save history" subtitle="Keep a log of tags you read and write" value={s.saveHistory} onValueChange={(v) => set({ saveHistory: v })} last />
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card padded={false}>
        <ListItem icon="share-outline" title="Export backup" subtitle={`${history.length} history entries · ${templates.length} templates`} onPress={exportBackup} />
        <ListItem icon="download-outline" title="Import backup" subtitle="Merge a previously exported .json file" onPress={importBackup} />
        <ListItem
          icon="trash-outline"
          title="Clear history"
          danger
          onPress={async () => (await confirm('Clear all history?', 'This cannot be undone.', 'Clear', true)) && clearHistory()}
          last
        />
      </Card>

      <SectionTitle>NFC diagnostics</SectionTitle>
      <Card>
        <View style={{ gap: space.md }}>
          <Txt dim size={13}>
            A timeline of NFC sessions since the app opened. If scanning misbehaves, share this with whoever is helping you.
          </Txt>
          {diag.length === 0 ? (
            <Txt faint size={13}>
              No NFC activity yet.
            </Txt>
          ) : (
            diag
              .slice(-40)
              .reverse()
              .map((d, i) => (
                <Txt key={i} monospace size={11} selectable>
                  {stamp(d.t)} {d.msg}
                </Txt>
              ))
          )}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button style={{ flex: 1 }} compact variant="secondary" icon="share-outline" title="Share log" disabled={!diag.length} onPress={() => Share.share({ message: diagText() })} />
            <Button style={{ flex: 1 }} compact variant="ghost" icon="trash-outline" title="Clear" disabled={!diag.length} onPress={clearDiag} />
          </View>
        </View>
      </Card>

      <SectionTitle>About</SectionTitle>
      <Card>
        <Txt weight="600">NFC Toolkit {Constants.expoConfig?.version}</Txt>
        <Txt dim size={13}>
          Free, no ads, no account. Everything stays on your device.
        </Txt>
      </Card>
    </Screen>
  );
}

function stamp(t: number) {
  const d = new Date(t);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
