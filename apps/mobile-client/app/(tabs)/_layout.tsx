import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="mail-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="filters"
        options={{
          title: 'Filters',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="funnel-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
