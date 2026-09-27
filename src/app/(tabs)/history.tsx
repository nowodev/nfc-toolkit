import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { space } from '@/components/theme';
import { Card, Chips, Empty, Field, IconButton, ListItem, Screen, confirm } from '@/components/ui';
import { describe } from '@/lib/describe';
import { clearHistory, unpackRecords, useHistory } from '@/lib/storage';

type Filter = 'all' | 'read' | 'write';

function when(t: number) {
  const d = new Date(t);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export default function HistoryScreen() {
  const history = useHistory();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return history
      .filter((h) => filter === 'all' || h.kind === filter)
      .map((h) => {
        let first = '';
        try {
          const recs = unpackRecords(h.info.records);
          first = recs.length ? describe(recs[0]).value : 'Empty';
        } catch {
          first = '';
        }
        return { h, first };
      })
      .filter(({ h, first }) => !needle || [h.name, h.info.uid, first, h.info.chip?.name].some((x) => x?.toLowerCase().includes(needle)));
  }, [history, q, filter]);

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () =>
            history.length ? (
              <IconButton icon="trash-outline" label="Clear history" onPress={async () => (await confirm('Clear all history?', 'This cannot be undone.', 'Clear', true)) && clearHistory()} />
            ) : null,
        }}
      />
      {history.length === 0 ? (
        <Empty icon="time-outline" title="No history yet" subtitle="Tags you read and write show up here, so you can re-open or clone them later." />
      ) : (
        <>
          <View style={{ gap: space.md }}>
            <Field value={q} onChangeText={setQ} placeholder="Search name, UID or content" autoCapitalize="none" clearButtonMode="while-editing" />
            <Chips
              options={[
                { label: `All (${history.length})`, value: 'all' },
                { label: 'Read', value: 'read' },
                { label: 'Written', value: 'write' },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </View>
          <Card padded={false}>
            {items.map(({ h, first }, i) => (
              <ListItem
                key={h.id}
                icon={h.kind === 'read' ? 'scan' : 'create'}
                title={h.name || h.info.chip?.name || (h.kind === 'read' ? 'Read tag' : 'Wrote tag')}
                subtitle={`${when(h.time)} · ${h.info.uid || 'no UID'}${first ? ' · ' + first : ''}`}
                onPress={() => router.push({ pathname: '/history/[id]', params: { id: h.id } })}
                last={i === items.length - 1}
              />
            ))}
            {items.length === 0 && <ListItem title="No matches" last />}
          </Card>
        </>
      )}
    </Screen>
  );
}
