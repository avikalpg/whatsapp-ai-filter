import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAppStore } from '../src/stores/appStore';

export default function RootLayout() {
  const { initialize, isInitialized, claudeApiKey, isLinked } = useAppStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!isInitialized) {
    return null; // Splash / loading state
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {!claudeApiKey ? (
        <Stack.Screen name="setup-api-key" />
      ) : !isLinked ? (
        <Stack.Screen name="link-whatsapp" />
      ) : (
        <>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="filters/new" options={{ presentation: 'modal', headerShown: true, title: 'New Filter' }} />
          <Stack.Screen name="filters/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Edit Filter' }} />
        </>
      )}
    </Stack>
  );
}
