import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAppStore } from '../src/stores/appStore';

export default function RootLayout() {
  const { initialize, isInitialized, isLinked } = useAppStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!isInitialized) {
    return null; // Splash / loading state
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {!isLinked ? (
        <Stack.Screen name="link-whatsapp" />
      ) : (
        <>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="filters/new" options={{ presentation: 'modal', headerShown: true, title: 'New Filter' }} />
          <Stack.Screen name="filters/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Edit Filter' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: true, title: 'Settings' }} />
        </>
      )}
    </Stack>
  );
}
