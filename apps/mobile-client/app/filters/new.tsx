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
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/stores/appStore';

export default function NewFilterScreen() {
  const router = useRouter();
  const { saveFilter } = useAppStore();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [processDirectMessages, setProcessDirectMessages] = useState(true);
  const [groupInclusionList, setGroupInclusionList] = useState('');
  const [groupExclusionList, setGroupExclusionList] = useState('');
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
    
    // Parse comma-separated lists into arrays
    const inclusionArray = groupInclusionList
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    const exclusionArray = groupExclusionList
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    await saveFilter({ 
      name: name.trim(), 
      prompt: prompt.trim(),
      process_direct_messages: processDirectMessages,
      group_inclusion_list: inclusionArray,
      group_exclusion_list: exclusionArray,
    });
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Filter Options</Text>
          
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Process Direct Messages</Text>
              <Text style={styles.switchHint}>
                When disabled, this filter will skip all 1:1 chats
              </Text>
            </View>
            <Switch
              value={processDirectMessages}
              onValueChange={setProcessDirectMessages}
              trackColor={{ false: '#ccc', true: '#25D366' }}
            />
          </View>

          <Text style={styles.label}>Group Inclusion List (optional)</Text>
          <Text style={styles.hint}>
            Comma-separated group IDs. If set, only these groups will be processed.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 120363XXXXX@g.us, 120363YYYYY@g.us"
            value={groupInclusionList}
            onChangeText={setGroupInclusionList}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Group Exclusion List (optional)</Text>
          <Text style={styles.hint}>
            Comma-separated group IDs. These groups will be skipped.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 120363ZZZZZ@g.us"
            value={groupExclusionList}
            onChangeText={setGroupExclusionList}
            autoCapitalize="none"
          />
        </View>

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
  section: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  switchHint: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
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
