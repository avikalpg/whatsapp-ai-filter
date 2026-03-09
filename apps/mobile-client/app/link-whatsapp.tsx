import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/stores/auth';
import { initLink, getLinkStatus } from '../src/api/whatsapp';
import { ApiError } from '../src/api/client';

type Step = 'input' | 'code' | 'waiting';

export default function LinkWhatsAppScreen() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();

  const [step, setStep] = useState<Step>('input');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleGenerateCode() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) {
      Alert.alert('Invalid number', 'Enter your phone number with country code (e.g. 14155551234).');
      return;
    }
    setLoading(true);
    try {
      const res = await initLink(digits);
      setCode(res.code);
      setSessionId(res.session_id);
      setStep('code');
    } catch (err) {
      Alert.alert('Error', err instanceof ApiError ? err.message : 'Failed to generate code');
    } finally {
      setLoading(false);
    }
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    setStep('waiting');
    pollRef.current = setInterval(async () => {
      try {
        const res = await getLinkStatus(sessionId);
        if (res.status === 'ready' && res.token && res.user) {
          if (pollRef.current) clearInterval(pollRef.current);
          await setAuth(res.token, res.user);
          router.replace('/(tabs)/feed');
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          if (pollRef.current) clearInterval(pollRef.current);
          Alert.alert('Session expired', 'The pairing session expired. Please try again.');
          setStep('input');
        }
        // Other errors: retry on next tick
      }
    }, 3000);
  }

  if (step === 'input') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.appName}>WACI</Text>
        <Text style={styles.heading}>Link your WhatsApp</Text>
        <Text style={styles.body}>
          Enter your phone number with country code. We'll generate a pairing code — no password needed.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="14155551234"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          autoFocus
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleGenerateCode}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Get Pairing Code</Text>}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (step === 'code') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Enter this code in WhatsApp</Text>

        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{code}</Text>
        </View>

        <Text style={styles.instructions}>
          1. Open WhatsApp on your phone{'\n'}
          2. Tap ⋮ Menu → Linked Devices{'\n'}
          3. Tap "Link a Device"{'\n'}
          4. Tap "Link with phone number instead"{'\n'}
          5. Enter the code above
        </Text>

        <TouchableOpacity style={styles.button} onPress={startPolling}>
          <Text style={styles.buttonText}>I entered the code →</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#25D366" />
      <Text style={styles.waitingText}>Waiting for WhatsApp to confirm…</Text>
      <Text style={styles.waitingHint}>This usually takes a few seconds.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 28, backgroundColor: '#fff', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', gap: 16 },
  appName: { fontSize: 32, fontWeight: '800', color: '#25D366', textAlign: 'center', marginBottom: 4, letterSpacing: 2 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 10, color: '#111', textAlign: 'center' },
  body: { fontSize: 15, color: '#666', lineHeight: 22, marginBottom: 28, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 18, marginBottom: 16, backgroundColor: '#fafafa', letterSpacing: 1 },
  button: { backgroundColor: '#25D366', borderRadius: 10, padding: 15, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  codeBox: { backgroundColor: '#f0fdf4', borderWidth: 2, borderColor: '#25D366', borderRadius: 14, padding: 24, alignItems: 'center', marginVertical: 24 },
  codeText: { fontSize: 36, fontWeight: '800', letterSpacing: 6, color: '#1a7d45', fontFamily: 'monospace' },
  instructions: { fontSize: 15, lineHeight: 28, color: '#444', marginBottom: 28, backgroundColor: '#f9f9f9', padding: 16, borderRadius: 10 },
  waitingText: { fontSize: 17, fontWeight: '600', color: '#111' },
  waitingHint: { fontSize: 14, color: '#888' },
});
