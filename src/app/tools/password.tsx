import { useState } from 'react';
import { Alert, View } from 'react-native';
import { space } from '@/components/theme';
import { Button, Card, Chips, Field, Notice, Screen, ToggleRow, Txt, confirm } from '@/components/ui';
import { useNfcAction } from '@/components/useNfcAction';
import { describePassword, derivePassword } from '@/lib/type2';
import { removeTagPassword, setTagPassword } from '@/lib/tagops';

type Mode = 'set' | 'change' | 'remove';

export default function PasswordTool() {
  const { busy, run } = useNfcAction();
  const [mode, setMode] = useState<Mode>('set');
  const [pass, setPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [current, setCurrent] = useState('');
  const [protectReads, setProtectReads] = useState(false);

  const mismatch = mode !== 'remove' && confirmPass.length > 0 && pass !== confirmPass;
  const ready = mode === 'remove' ? current.length > 0 : pass.length >= 4 && pass === confirmPass && (mode === 'set' || current.length > 0);

  const go = async () => {
    if (mode === 'remove') {
      const r = await run(() => removeTagPassword(current));
      if (r) Alert.alert('Password removed ✓', `${r} is now unprotected.`);
      return;
    }
    const ok = await confirm(
      'Remember this password',
      `If you forget it, the tag can${protectReads ? '’t be read or' : '’t be'} rewritten — there is no reset.\n\nHex for other apps: ${describePassword(derivePassword(pass))}`,
      'Protect tag',
    );
    if (!ok) return;
    const r = await run(() => setTagPassword(pass, protectReads, mode === 'change' ? current : undefined));
    if (r) Alert.alert('Password set 🔐', `${r} is now protected. Use “Tag is password protected” on the Write tab to update it.`);
  };

  return (
    <Screen>
      <Notice>Works with NTAG210/212/213/215/216 and MIFARE Ultralight EV1 — the most common sticker and card tags. Phones can still read the tag unless you protect reads too.</Notice>

      <Chips
        options={[
          { label: 'Set password', value: 'set' },
          { label: 'Change', value: 'change' },
          { label: 'Remove', value: 'remove' },
        ]}
        value={mode}
        onChange={setMode}
      />

      <Card>
        <View style={{ gap: space.lg }}>
          {(mode === 'change' || mode === 'remove') && (
            <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
          )}
          {mode !== 'remove' && (
            <>
              <Field
                label="New password"
                value={pass}
                onChangeText={setPass}
                secureTextEntry
                autoCapitalize="none"
                help="Any phrase (min 4 characters), or exactly 8 hex digits to use a raw 32-bit password from another app."
              />
              <Field label="Confirm password" value={confirmPass} onChangeText={setConfirmPass} secureTextEntry autoCapitalize="none" error={mismatch ? 'Passwords don’t match' : null} />
            </>
          )}
        </View>
      </Card>

      {mode !== 'remove' && (
        <Card padded={false}>
          <ToggleRow
            title="Also protect reading"
            subtitle="Phones won’t be able to read the tag without the password. Most people leave this off."
            value={protectReads}
            onValueChange={setProtectReads}
            last
          />
        </Card>
      )}

      {pass.length >= 4 && mode !== 'remove' && (
        <Txt dim size={13}>
          Tag bytes: {describePassword(derivePassword(pass))}
        </Txt>
      )}

      <Button title={mode === 'remove' ? 'Remove password' : 'Write password to tag'} icon="key" onPress={go} disabled={!ready} loading={busy} variant={mode === 'remove' ? 'danger' : 'primary'} />
    </Screen>
  );
}
