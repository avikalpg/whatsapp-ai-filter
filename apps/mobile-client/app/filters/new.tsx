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
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/stores/appStore';

export default function NewFilterScreen() {
  const router = useRouter();
  const { saveFilter } = useAppStore();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a filter name.');
      return;
    }
    if (!prompt.trim()) {
      Alert.alert('Error', 'Please enter a filter description.');
      return;
    }
    setLoading(true);
    await saveFilter({ name: name.trim(), prompt: prompt.trim() });
    setLoading(false);
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Filter Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. SF Meetups"
          value={name}
          onChangeText={setName}
          returnKeyType="next"
        />

        <Text style={styles.label}>Description / Prompt</Text>
        <Text style={styles.hint}>
          Describe what messages you want to catch. The AI will use this to decide relevance.
        </Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="e.g. Messages about tech meetups, events, or networking in San Francisco"
          value={prompt}
          onChangeText={setPrompt}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />

        <TouchableOpacity style={styles.button} onPress={handleSave} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create Filter</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  label: { fontSize: 15, fontWeight: '600', marginBottom: 6, marginTop: 16 },
  hint: { fontSize: 13, color: '#888', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 120 },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
