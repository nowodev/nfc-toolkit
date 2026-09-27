import { useState } from 'react';
import { Alert, View } from 'react-native';
import { space } from '@/components/theme';
import { Button, Card, Chips, Field, MonoBlock, Notice, Screen, Txt } from '@/components/ui';
import { useNfcAction } from '@/components/useNfcAction';
import { MIRROR_PLACEHOLDER } from '@/lib/type2';
import { writeDynamicUrl } from '@/lib/tagops';

type Mode = 'uid' | 'counter' | 'both';

export default function DynamicUrl() {
  const { busy, run } = useNfcAction();
  const [url, setUrl] = useState('https://example.com/scan');
  const [param, setParam] = useState('id');
  const [mode, setMode] = useState<Mode>('uid');
  const [pass, setPass] = useState('');

  const base = /^[a-z]+:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const example = `${base}${base.includes('?') ? '&' : '?'}${param}=${
    mode === 'uid' ? '04A1B2C3D4E5F6' : mode === 'counter' ? '00002A' : '04A1B2C3D4E5F6x00002A'
  }`;

  const go = async () => {
    const r = await run(() => writeDynamicUrl(base, param.trim() || 'id', mode, pass || undefined));
    if (r) Alert.alert('Dynamic URL written ✓', `${r.chip} will now open a unique URL on every scan.`);
  };

  return (
    <Screen>
      <Notice>
        The tag fills in its own serial number and/or scan count every time it’s read — useful for check-ins, anti-counterfeit links and analytics. Needs an NTAG213, 215 or 216.
      </Notice>
      <Card>
        <View style={{ gap: space.lg }}>
          <Field label="Base URL" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" autoCorrect={false} />
          <Field label="Parameter name" value={param} onChangeText={setParam} autoCapitalize="none" autoCorrect={false} />
          <Chips
            label="Insert"
            options={[
              { label: 'Tag UID', value: 'uid' },
              { label: 'Scan counter', value: 'counter' },
              { label: 'Both', value: 'both' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <Field label="Tag password (if protected)" value={pass} onChangeText={setPass} secureTextEntry autoCapitalize="none" />
        </View>
      </Card>
      <View style={{ gap: space.sm }}>
        <Txt dim size={13}>
          Each scan opens something like:
        </Txt>
        <MonoBlock text={example} />
        <Txt faint size={12}>
          Placeholder written to the tag: {MIRROR_PLACEHOLDER[mode]}
        </Txt>
      </View>
      <Button title="Write dynamic URL" icon="radio-outline" onPress={go} loading={busy} disabled={!url.trim()} />
    </Screen>
  );
}
