import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/auth';
import { getFilters, updateFilter, deleteFilter, GroupRule } from '../../src/api/filters';
import { getGroups, Group } from '../../src/api/whatsapp';
import { ApiError } from '../../src/api/client';
import GroupRulesPicker from '../../src/components/GroupRulesPicker';

export default function EditFilterScreen() {
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState<'personal' | 'work' | 'all'>('all');
  const [includeDms, setIncludeDms] = useState(true);
  const [groupRules, setGroupRules] = useState<GroupRule[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isPreset, setIsPreset] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getFilters(token),
      getGroups(token).catch(() => [] as Group[]),
    ]).then(([filters, grps]) => {
      const filter = filters.find((f) => f.id === id);
      if (filter) {
        setName(filter.name);
        setPrompt(filter.prompt);
        setCategory(filter.category);
        setIncludeDms(filter.include_dms);
        setGroupRules(filter.group_rules);
        setIsPreset(filter.is_preset);
      }
      setGroups(grps);
      setLoading(false);
    }).catch((e) => { console.error(e); setLoading(false); });
  }, [token, id]);

  async function handleSave() {
    if (!name.trim() || !prompt.trim()) {
      Alert.alert('Missing fields', 'Name and prompt are required.');
      return;
    }
    setSaving(true);
    try {
      await updateFilter(token, id, { name: name.trim(), prompt: prompt.trim(), category, include_dms: includeDms, group_rules: groupRules });
      router.back();
    } catch (err) {
      Alert.alert('Error', err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    Alert.alert('Delete Filter', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteFilter(token, id);
            router.back();
          } catch (err) {
            Alert.alert('Error', err instanceof ApiError ? err.message : 'Failed to delete');
          }
        },
      },
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#25D366" size="large" /></View>;
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {isPreset && (
        <View style={styles.presetBanner}>
          <Text style={styles.presetBannerText}>This is a preset filter. You can still edit or disable it.</Text>
        </View>
      )}

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <Text style={styles.label}>Prompt</Text>
      <TextInput style={[styles.input, styles.textarea]} multiline value={prompt} onChangeText={setPrompt} textAlignVertical="top" />

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
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
        <Text style={styles.deleteButtonText}>Delete Filter</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  presetBanner: { backgroundColor: '#e8f0fe', borderRadius: 10, padding: 12, marginBottom: 8 },
  presetBannerText: { fontSize: 13, color: '#3f65c2', lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#fafafa' },
  textarea: { height: 100 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, overflow: 'hidden' },
  segment: { flex: 1, padding: 10, alignItems: 'center', backgroundColor: '#fafafa' },
  segmentActive: { backgroundColor: '#25D366' },
  segmentText: { fontSize: 14, color: '#444' },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  saveButton: { backgroundColor: '#25D366', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 28 },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  deleteButton: { borderWidth: 1, borderColor: '#e74c3c', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12, marginBottom: 40 },
  deleteButtonText: { color: '#e74c3c', fontSize: 15, fontWeight: '600' },
});
