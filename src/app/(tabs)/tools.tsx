import { router } from 'expo-router';
import { Alert } from 'react-native';
import { Card, ListItem, SectionTitle, Screen, confirm } from '@/components/ui';
import { useNfcAction } from '@/components/useNfcAction';
import { isAndroid } from '@/lib/nfc';
import { eraseTag, formatTag, lockTag } from '@/lib/tagops';

export default function ToolsScreen() {
  const { run } = useNfcAction();

  const erase = async () => {
    if (!(await confirm('Erase tag?', 'All data on the next tag you scan will be deleted.', 'Erase', true))) return;
    const r = await run(eraseTag);
    if (r) Alert.alert('Erased ✓', `Tag ${r.uid} is now empty.`);
  };

  const format = async () => {
    const r = await run(formatTag);
    if (r !== undefined) Alert.alert('Formatted ✓', 'The tag is now NDEF formatted and ready to write.');
  };

  const lock = async () => {
    if (!(await confirm('Lock tag permanently?', 'This makes the tag READ-ONLY forever. It cannot be undone, erased or rewritten.', 'I understand', true))) return;
    if (!(await confirm('Are you sure?', 'Last chance — locking is irreversible.', 'Lock tag', true))) return;
    const r = await run(lockTag);
    if (r !== undefined) Alert.alert('Locked 🔒', 'The tag is now read-only.');
  };

  return (
    <Screen>
      <SectionTitle>Tag management</SectionTitle>
      <Card padded={false}>
        <ListItem icon="copy" title="Copy / clone tag" subtitle="Read one tag, write its data to many" onPress={() => router.push('/tools/copy')} />
        <ListItem icon="layers" title="Batch write" subtitle="Write the same data to lots of tags, with numbering" onPress={() => router.push('/tools/batch')} />
        <ListItem icon="trash" title="Erase tag" subtitle="Remove all data" onPress={erase} />
        {isAndroid && <ListItem icon="refresh-circle" title="Format tag" subtitle="Prepare a blank / unformatted tag for NDEF" onPress={format} />}
        <ListItem icon="lock-closed" title="Lock tag (read-only)" subtitle="Permanent — prevents any future changes" danger onPress={lock} last />
      </Card>

      <SectionTitle>Security & NTAG features</SectionTitle>
      <Card padded={false}>
        <ListItem icon="key" title="Password protection" subtitle="Set or remove a password (NTAG21x / Ultralight EV1)" onPress={() => router.push('/tools/password')} />
        <ListItem icon="link" title="Dynamic URL" subtitle="URL that includes the tag UID / scan count" onPress={() => router.push('/tools/dynamic-url')} />
        <ListItem icon="stats-chart" title="Scan counter" subtitle="Count how many times a tag was scanned" onPress={() => router.push('/tools/counter')} last />
      </Card>

      <SectionTitle>Advanced</SectionTitle>
      <Card padded={false}>
        <ListItem icon="grid" title="Memory dump" subtitle="Read raw pages / blocks as hex (NTAG, Ultralight, ISO 15693, MIFARE Classic)" onPress={() => router.push('/tools/memory')} />
        <ListItem icon="terminal" title="Advanced commands" subtitle="Send raw hex commands / APDUs" onPress={() => router.push('/tools/raw')} />
        <ListItem icon="settings" title="Settings & backup" subtitle="Haptics, history, export / import" onPress={() => router.push('/settings')} last />
      </Card>
    </Screen>
  );
}
