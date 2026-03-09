import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Clipboard,
} from 'react-native';
import { useAppStore } from '../src/stores/appStore';

export default function LinkWhatsAppScreen() {
  const { startPairing, confirmLinked, pairingCode, error, clearError } = useAppStore();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  // Poll until WhatsApp is linked. Use confirmLinked (not refreshLinkedStatus) so
  // the trial is activated immediately after the session is established.
  useEffect(() => {
    if (!pairingCode) return;
    const interval = setInterval(() => {
      confirmLinked();
    }, 3000);
    return () => clearInterval(interval);
  }, [pairingCode, confirmLinked]);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error, clearError]);

  const handlePair = async () => {
    if (!phone.trim()) {
      Alert.alert('Error', 'Enter your phone number in international format, e.g. +14155552671');
      return;
    }
    setLoading(true);
    await startPairing(phone.trim());
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Link WhatsApp</Text>
      <Text style={styles.subtitle}>
        Enter your phone number to generate a pairing code.{'\n'}
        You will enter this code in WhatsApp → Settings → Linked Devices → Link a Device.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="+1 415 555 2671"
        placeholderTextColor="#999"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoCapitalize="none"
      />

      <TouchableOpacity style={styles.button} onPress={handlePair} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Generate Pairing Code</Text>
        )}
      </TouchableOpacity>

      {pairingCode ? (
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Your pairing code:</Text>
          <TouchableOpacity
            onPress={() => {
              Clipboard.setString(pairingCode);
              Alert.alert('Copied!', 'Pairing code copied to clipboard.');
            }}
            activeOpacity={0.7}
            style={styles.codeTouchable}
          >
            <Text style={styles.code}>{pairingCode}</Text>
            <Text style={styles.copyHint}>Tap to copy</Text>
          </TouchableOpacity>
          <Text style={styles.codeHint}>
            Open WhatsApp → Settings → Linked Devices → Link a Device and enter this code.
          </Text>
          <ActivityIndicator style={{ marginTop: 12 }} />
          <Text style={styles.waitingText}>Waiting for confirmation…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#555', marginBottom: 32 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#25D366',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  codeBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  codeLabel: { fontSize: 14, color: '#666', marginBottom: 8 },
  codeTouchable: { alignItems: 'center', padding: 8 },
  code: { fontSize: 36, fontWeight: '800', letterSpacing: 6, color: '#000' },
  copyHint: { fontSize: 12, color: '#25D366', marginTop: 4 },
  codeHint: { fontSize: 13, color: '#888', textAlign: 'center', marginTop: 12 },
  waitingText: { fontSize: 13, color: '#888', marginTop: 4 },
});
