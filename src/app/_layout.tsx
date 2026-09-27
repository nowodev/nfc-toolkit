import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { ScanOverlay } from '@/components/ScanOverlay';
import { useColors } from '@/components/theme';
import { initNfc } from '@/lib/nfc';

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();

  useEffect(() => {
    initNfc();
  }, []);

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: c.primary, background: c.bg, card: c.card, text: c.text, border: c.border },
  };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerLargeTitle: false, headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add-record" options={{ presentation: 'modal', title: 'Add record' }} />
        <Stack.Screen name="history/[id]" options={{ title: 'Tag' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="tools/copy" options={{ title: 'Copy / clone tag' }} />
        <Stack.Screen name="tools/batch" options={{ title: 'Batch write' }} />
        <Stack.Screen name="tools/password" options={{ title: 'Password protection' }} />
        <Stack.Screen name="tools/memory" options={{ title: 'Memory dump' }} />
        <Stack.Screen name="tools/raw" options={{ title: 'Advanced commands' }} />
        <Stack.Screen name="tools/dynamic-url" options={{ title: 'Dynamic URL' }} />
        <Stack.Screen name="tools/counter" options={{ title: 'Scan counter' }} />
      </Stack>
      <ScanOverlay />
    </ThemeProvider>
  );
}
