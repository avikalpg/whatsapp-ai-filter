import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/auth';
import { createFilter, FilterInput } from '../../src/api/filters';
import { getGroups, Group } from '../../src/api/whatsapp';
import { ApiError } from '../../src/api/client';
import GroupRulesPicker from '../../src/components/GroupRulesPicker';
import { GroupRule } from '../../src/api/filters';

export default function NewFilterScreen() {
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState<'personal' | 'work' | 'all'>('all');
  const [includeDms, setIncludeDms] = useState(true);
  const [groupRules, setGroupRules] = useState<GroupRule[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getGroups(token).then(setGroups).catch(() => {/* not ready yet */});
  }, [token]);

  async function handleSave() {
    if (!name.trim() || !prompt.trim()) {
      Alert.alert('Missing fields', 'Name and prompt are required.');
      return;
    }
    setSaving(true);
    try {
      const data: FilterInput = { name: name.trim(), prompt: prompt.trim(), category, include_dms: includeDms, group_rules: groupRules };
      await createFilter(token, data);
      router.back();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save filter';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} placeholder="e.g. Job Opportunities" value={name} onChangeText={setName} />

      <Text style={styles.label}>Prompt</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder="Describe what messages this filter should catch…"
        multiline
        value={prompt}
        onChangeText={setPrompt}
        textAlignVertical="top"
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.segmented}>
        {(['all', 'personal', 'work'] as const).map((c) => (
          <TouchableOpacity key={c} style={[styles.segment, category === c && styles.segmentActive]} onPress={() => setCategory(c)}>
            <Text style={[styles.segmentText, category === c && styles.segmentTextActive]}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.label}>Include Direct Messages</Text>
        <Switch value={includeDms} onValueChange={setIncludeDms} trackColor={{ false: '#ddd', true: '#a8e6bc' }} thumbColor={includeDms ? '#25D366' : '#f4f3f4'} />
      </View>

      <Text style={styles.label}>Group Rules</Text>
      <GroupRulesPicker groups={groups} rules={groupRules} onChange={setGroupRules} />

      <TouchableOpacity style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Filter</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#fafafa' },
  textarea: { height: 100 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, overflow: 'hidden' },
  segment: { flex: 1, padding: 10, alignItems: 'center', backgroundColor: '#fafafa' },
  segmentActive: { backgroundColor: '#25D366' },
  segmentText: { fontSize: 14, color: '#444' },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  saveButton: { backgroundColor: '#25D366', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 28, marginBottom: 40 },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
