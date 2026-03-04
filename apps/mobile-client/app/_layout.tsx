import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../src/stores/auth';

function AuthGuard() {
  const { token, isLoading } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const onLinkScreen = segments[0] === 'link-whatsapp';
    if (!token && !onLinkScreen) {
      router.replace('/link-whatsapp');
    } else if (token && onLinkScreen) {
      router.replace('/(tabs)/feed');
    }
  }, [token, isLoading, segments]);

  return null;
}

export default function RootLayout() {
  const loadAuth = useAuthStore((s) => s.loadAuth);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    loadAuth();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#25D366" />
      </View>
    );
  }

  return (
    <>
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="link-whatsapp" options={{ headerShown: false }} />
        <Stack.Screen name="filters/new" options={{ headerShown: true, title: 'New Filter', presentation: 'modal' }} />
        <Stack.Screen name="filters/[id]" options={{ headerShown: true, title: 'Edit Filter', presentation: 'modal' }} />
      </Stack>
    </>
  );
}
