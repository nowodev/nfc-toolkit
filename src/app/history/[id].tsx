import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { TagView } from '@/components/TagView';
import { space } from '@/components/theme';
import { Button, Card, Empty, Field, Screen, Txt, confirm } from '@/components/ui';
import { deleteHistory, renameHistory, unpackRecords, useHistory } from '@/lib/storage';

export default function HistoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useHistory().find((h) => h.id === id);
  const [name, setName] = useState(entry?.name ?? '');

  if (!entry) return <Empty icon="help-circle-outline" title="Not found" subtitle="This entry was deleted." />;

  const info = { ...entry.info, records: unpackRecords(entry.info.records) };

  return (
    <Screen>
      <Stack.Screen options={{ title: entry.name || (entry.kind === 'read' ? 'Read tag' : 'Written tag') }} />
      <Card>
        <View style={{ gap: space.md }}>
          <Txt dim size={13}>
            {entry.kind === 'read' ? 'Read' : 'Written'} {new Date(entry.time).toLocaleString()}
          </Txt>
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Front door tag" onEndEditing={() => renameHistory(entry.id, name.trim())} returnKeyType="done" />
        </View>
      </Card>
      <TagView info={info} />
      <Button
        variant="danger"
        icon="trash-outline"
        title="Delete from history"
        onPress={async () => {
          if (await confirm('Delete entry?', '', 'Delete', true)) {
            deleteHistory(entry.id);
            router.back();
          }
        }}
      />
    </Screen>
  );
}
