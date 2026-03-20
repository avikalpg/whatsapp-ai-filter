import React, { useEffect, useState } from 'react';
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
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppStore } from '../../src/stores/appStore';
import type { FilterMatch } from '../../src/native/wabridge';

export default function FilterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { filters, matches, saveFilter, loadMatches, matchesLoading } = useAppStore();

  const filter = filters.find((f) => f.id === id);
  const [name, setName] = useState(filter?.name ?? '');
  const [prompt, setPrompt] = useState(filter?.prompt ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) loadMatches(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const filterMatches: FilterMatch[] = matches[id] ?? [];
  const isLoading = matchesLoading[id] ?? false;

  const handleSave = async () => {
    if (!name.trim() || !prompt.trim()) {
      Alert.alert('Error', 'Name and description are required.');
      return;
    }
    setSaving(true);
    await saveFilter({ id, name: name.trim(), prompt: prompt.trim() });
    setSaving(false);
    Alert.alert('Saved', 'Filter updated.');
  };

  if (!filter) {
    return (
      <View style={styles.center}>
        <Text>Filter not found.</Text>
      </View>
    );
  }

  const renderMatch = ({ item }: { item: FilterMatch }) => (
    <View style={styles.matchCard}>
      <View style={styles.matchHeader}>
        <Text style={styles.chatName} numberOfLines={1}>{item.chat_name || item.chat_jid}</Text>
        <Text style={styles.time}>{formatTime(item.received_at)}</Text>
      </View>
      <Text style={styles.matchBody} numberOfLines={4}>{item.body}</Text>
      {item.relevance_reason ? (
        <Text style={styles.reason}>🤖 {item.relevance_reason} ({Math.round(item.confidence * 100)}%)</Text>
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        {/* Edit section */}
        <Text style={styles.sectionTitle}>Filter Settings</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />

        <Text style={styles.label}>Description / Prompt</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Changes</Text>}
        </TouchableOpacity>

        {/* Matches section */}
        <Text style={styles.sectionTitle}>Matched Messages ({filterMatches.length})</Text>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 20 }} />
        ) : filterMatches.length === 0 ? (
          <Text style={styles.emptyMatches}>No matches yet. Run a sync from the Inbox tab.</Text>
        ) : (
          filterMatches.map((item) => (
            <View key={item.id}>
              {renderMatch({ item })}
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 100 },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  matchCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  matchHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  chatName: { fontWeight: '600', fontSize: 14, flex: 1 },
  time: { fontSize: 12, color: '#999' },
  matchBody: { fontSize: 14, color: '#333', lineHeight: 20 },
  reason: { fontSize: 12, color: '#888', marginTop: 6, fontStyle: 'italic' },
  emptyMatches: { color: '#999', marginTop: 8 },
});
