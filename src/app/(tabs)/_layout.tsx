import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/tabs';
import { useColors } from '@/components/theme';

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.card },
        headerTitleStyle: { color: c.text },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Read', tabBarIcon: ({ color, size }) => <Ionicons name="scan" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="write"
        options={{ title: 'Write', tabBarIcon: ({ color, size }) => <Ionicons name="create" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="tools"
        options={{ title: 'Tools', tabBarIcon: ({ color, size }) => <Ionicons name="construct" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'History', tabBarIcon: ({ color, size }) => <Ionicons name="time" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
