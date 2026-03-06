import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAppStore } from '../src/stores/appStore';

export default function SetupApiKeyScreen() {
  const { saveApiKey } = useAppStore();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!key.trim()) {
      Alert.alert('Error', 'Please enter your Claude API key.');
      return;
    }
    setLoading(true);
    await saveApiKey(key.trim());
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>WACI Setup</Text>
      <Text style={styles.subtitle}>
        Enter your Anthropic Claude API key to enable AI message triage.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="sk-ant-..."
        placeholderTextColor="#999"
        value={key}
        onChangeText={setKey}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleSave} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Save & Continue</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>
        Your API key is stored securely on-device and never sent to our servers.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
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
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { color: '#999', fontSize: 12, textAlign: 'center' },
});
