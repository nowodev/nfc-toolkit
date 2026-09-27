import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, Text, View } from 'react-native';
import { cancelScan, isAndroid, subscribeScanUi } from '@/lib/nfc';
import { radius, useColors } from './theme';

/** Android-only "Ready to scan" sheet. iOS uses the system NFC sheet. */
export function ScanOverlay() {
  const c = useColors();
  const [state, setState] = useState({ visible: false, message: '' });
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => subscribeScanUi(setState), []);

  useEffect(() => {
    if (!state.visible) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    pulse.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [state.visible, pulse]);

  if (!isAndroid) return null;

  return (
    <Modal visible={state.visible} transparent animationType="slide" onRequestClose={cancelScan} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c.overlay }}>
        <View style={{ backgroundColor: c.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 28, paddingBottom: 40, alignItems: 'center', gap: 18 }}>
          <Text style={{ color: c.textDim, fontSize: 20, fontWeight: '600' }}>Ready to Scan</Text>
          <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              style={{
                position: 'absolute',
                width: 120,
                height: 120,
                borderRadius: 60,
                backgroundColor: c.primary,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.2] }) }],
              }}
            />
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="phone-portrait-outline" size={40} color={c.primary} />
            </View>
          </View>
          <Text style={{ color: c.text, fontSize: 16, textAlign: 'center' }}>{state.message}</Text>
          <Pressable
            onPress={cancelScan}
            style={({ pressed }) => ({ backgroundColor: c.cardAlt, borderRadius: radius.md, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center', opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
