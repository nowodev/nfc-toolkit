import { useState } from 'react';
import { View } from 'react-native';
import { space } from '@/components/theme';
import { Button, Card, Field, Notice, Screen, Txt } from '@/components/ui';
import { useNfcAction } from '@/components/useNfcAction';
import { readTag, setScanCounter } from '@/lib/tagops';

export default function CounterTool() {
  const { busy, run } = useNfcAction();
  const [pass, setPass] = useState('');
  const [count, setCount] = useState<number | null | undefined>(undefined);
  const [status, setStatus] = useState('');

  const enable = async (on: boolean) => {
    const r = await run(() => setScanCounter(on, pass || undefined));
    if (r !== undefined) {
      setCount(on ? r : undefined);
      setStatus(on ? 'Counter enabled.' : 'Counter disabled.');
    }
  };

  const read = async () => {
    const info = await run(readTag);
    if (info) {
      setCount(info.chip?.counter ?? null);
      setStatus(info.chip?.counter == null ? `${info.chip?.name ?? 'This tag'} has no active counter.` : '');
    }
  };

  return (
    <Screen>
      <Notice>NTAG213/215/216 chips have a built-in counter that goes up by one each time any phone reads the tag. It can’t be reset or faked.</Notice>
      <Card>
        <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.md }}>
          <Txt dim>Scan count</Txt>
          <Txt size={44} weight="800">
            {count === undefined ? '—' : count === null ? 'n/a' : count.toLocaleString()}
          </Txt>
          {!!status && <Txt dim size={13}>{status}</Txt>}
        </View>
      </Card>
      <Button icon="scan" title="Read counter" onPress={read} loading={busy} />
      <Card>
        <Field label="Tag password (if protected)" value={pass} onChangeText={setPass} secureTextEntry autoCapitalize="none" />
      </Card>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button style={{ flex: 1 }} variant="secondary" title="Enable" icon="play" onPress={() => enable(true)} disabled={busy} />
        <Button style={{ flex: 1 }} variant="ghost" title="Disable" icon="pause" onPress={() => enable(false)} disabled={busy} />
      </View>
    </Screen>
  );
}
