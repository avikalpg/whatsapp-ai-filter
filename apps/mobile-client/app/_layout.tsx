import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAppStore } from '../src/stores/appStore';

export default function RootLayout() {
  const { initialize, retryInit, isInitialized, initError, isLinked } = useAppStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Once initialized, enforce navigation protection via redirect (not conditional Stack.Screen
  // rendering — passing React.Fragment as a Stack child causes expo-router's mapProtectedScreen
  // to coerce Symbol(react.fragment) to string → "TypeError: Cannot convert Symbol to string").
  useEffect(() => {
    if (!isInitialized || initError) return;

    const inLinkScreen = segments[0] === 'link-whatsapp';

    if (!isLinked && !inLinkScreen) {
      router.replace('/link-whatsapp');
    } else if (isLinked && inLinkScreen) {
      router.replace('/(tabs)');
    }
  }, [isInitialized, initError, isLinked, segments, router]);

  // Still initializing — show splash
  if (!isInitialized && !initError) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#25D366" />
        <Text style={styles.splashText}>Starting WACI…</Text>
      </View>
    );
  }

  // Init failed (e.g. backend unreachable, DB not set up) — show retry screen
  if (initError) {
    const initErrorMessage =
      typeof initError === 'string' ? initError : String(initError);
    const isServerError =
      initErrorMessage.includes('500') || initErrorMessage.includes('Registration failed');
    return (
      <View style={styles.splash}>
        <Text style={styles.errorTitle}>Couldn't connect</Text>
        <Text style={styles.errorBody}>
          {isServerError
            ? 'The WACI server is unavailable.\nPlease try again in a moment.'
            : initErrorMessage}
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={retryInit}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Always render all screens statically — navigation protection is handled by the
  // useEffect above, not by conditionally rendering Stack.Screen children.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="link-whatsapp" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="filters/new"
        options={{ presentation: 'modal', headerShown: true, title: 'New Filter' }}
      />
      <Stack.Screen
        name="filters/[id]"
        options={{ presentation: 'modal', headerShown: true, title: 'Edit Filter' }}
      />
      <Stack.Screen
        name="settings"
        options={{ presentation: 'modal', headerShown: true, title: 'Settings' }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 32,
    gap: 16,
  },
  splashText: { fontSize: 15, color: '#888', marginTop: 12 },
  errorTitle: { fontSize: 22, fontWeight: '700', color: '#000', textAlign: 'center' },
  errorBody: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    marginTop: 8,
    backgroundColor: '#25D366',
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
