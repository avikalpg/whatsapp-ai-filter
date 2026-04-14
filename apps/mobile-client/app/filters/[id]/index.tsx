/**
 * Filter edit screen — configure all filter options
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppStore } from '../../../src/stores/appStore';
import type { Filter } from '../../../src/native/wabridge';
import GroupPicker from '../../../src/components/GroupPicker';

export default function FilterEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { filters, saveFilter } = useAppStore();

  const existingFilter = filters.find((f) => f.id === id);
  
  const [name, setName] = useState(existingFilter?.name ?? '');
  const [prompt, setPrompt] = useState(existingFilter?.prompt ?? '');
  
  // DM options
  const [processDMs, setProcessDMs] = useState(existingFilter?.process_dms ?? true);
  const [dmContacts, setDMContacts] = useState(existingFilter?.dm_contacts ?? true);
  const [dmNonContacts, setDMNonContacts] = useState(existingFilter?.dm_non_contacts ?? true);
  const [dmBusinesses, setDMBusinesses] = useState(existingFilter?.dm_businesses ?? false);
  const [dmNonBusinesses, setDMNonBusinesses] = useState(existingFilter?.dm_non_businesses ?? true);
  
  // Group options
  const [processGroups, setProcessGroups] = useState(existingFilter?.process_groups ?? true);
  const [groupMode, setGroupMode] = useState<'inclusion' | 'exclusion'>(
    // Go returns "" for "no mode set"; fall back to 'exclusion' as the sane default.
    (existingFilter?.group_mode || 'exclusion') as 'inclusion' | 'exclusion'
  );
  const [groupList, setGroupList] = useState<string[]>(existingFilter?.group_list ?? []);
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    existingFilter?.notifications_enabled ?? true
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a filter name.');
      return;
    }
    if (!prompt.trim()) {
      Alert.alert('Error', 'Please enter a filter description.');
      return;
    }

    if (processGroups && groupMode === 'inclusion' && groupList.length === 0) {
      Alert.alert('Error', 'Inclusion mode requires at least one group.');
      return;
    }

    setSaving(true);
    await saveFilter({
      id,
      name: name.trim(),
      prompt: prompt.trim(),
      process_dms: processDMs,
      dm_contacts: dmContacts,
      dm_non_contacts: dmNonContacts,
      dm_businesses: dmBusinesses,
      dm_non_businesses: dmNonBusinesses,
      process_groups: processGroups,
      group_mode: processGroups ? groupMode : null,
      group_list: processGroups ? groupList : [],
      notifications_enabled: notificationsEnabled,
    });
    setSaving(false);
    Alert.alert('Saved', id ? 'Filter updated.' : 'Filter created.');
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Basic Info</Text>
        
        <Text style={styles.label}>Filter Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. SF Meetups"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Description / Prompt</Text>
        <Text style={styles.hint}>
          Describe what messages you want to catch. The AI will use this to decide relevance.
        </Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="e.g. Messages about tech meetups and events in San Francisco"
          value={prompt}
          onChangeText={setPrompt}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />

        {/* Direct Messages Section */}
        <Text style={styles.sectionTitle}>Direct Messages</Text>
        
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Process Direct Messages</Text>
          <Switch
            value={processDMs}
            onValueChange={setProcessDMs}
            trackColor={{ false: '#ccc', true: '#25D366' }}
          />
        </View>

        {processDMs && (
          <View style={styles.subSection}>
            <Text style={styles.subLabel}>Include messages from:</Text>
            
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setDMContacts(!dmContacts)}
            >
              <View style={[styles.checkbox, dmContacts && styles.checkboxChecked]}>
                {dmContacts && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Contacts</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setDMNonContacts(!dmNonContacts)}
            >
              <View style={[styles.checkbox, dmNonContacts && styles.checkboxChecked]}>
                {dmNonContacts && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Non-contacts</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setDMBusinesses(!dmBusinesses)}
            >
              <View style={[styles.checkbox, dmBusinesses && styles.checkboxChecked]}>
                {dmBusinesses && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Businesses</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setDMNonBusinesses(!dmNonBusinesses)}
            >
              <View style={[styles.checkbox, dmNonBusinesses && styles.checkboxChecked]}>
                {dmNonBusinesses && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Non-businesses</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Groups Section */}
        <Text style={styles.sectionTitle}>Group Messages</Text>
        
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Process Group Messages</Text>
          <Switch
            value={processGroups}
            onValueChange={setProcessGroups}
            trackColor={{ false: '#ccc', true: '#25D366' }}
          />
        </View>

        {processGroups && (
          <View style={styles.subSection}>
            <Text style={styles.subLabel}>Group Selection:</Text>
            
            <TouchableOpacity
              style={styles.radioRow}
              onPress={() => setGroupMode('exclusion')}
            >
              <View style={[styles.radio, groupMode === 'exclusion' && styles.radioSelected]}>
                {groupMode === 'exclusion' && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.radioLabel}>Show messages from all groups except:</Text>
                <Text style={styles.radioHint}>(Exclusion list — optional)</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.radioRow}
              onPress={() => setGroupMode('inclusion')}
            >
              <View style={[styles.radio, groupMode === 'inclusion' && styles.radioSelected]}>
                {groupMode === 'inclusion' && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.radioLabel}>Show messages only from these groups:</Text>
                <Text style={styles.radioHint}>(Inclusion list — required)</Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.label}>
              {groupMode === 'exclusion' ? 'Excluded Groups' : 'Included Groups'}
              {groupMode === 'inclusion' && <Text style={styles.required}> *</Text>}
            </Text>
            
            <View style={{ height: 400, marginBottom: 20 }}>
              <GroupPicker
                selectedJIDs={groupList}
                onSelectionChange={setGroupList}
                mode={groupMode}
              />
            </View>
          </View>
        )}

        {/* Notifications Section */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Notify on match</Text>
            <Text style={styles.hint}>
              Get a notification when a new message matches this filter
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: '#ccc', true: '#25D366' }}
          />
        </View>

        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>{id ? 'Save Changes' : 'Create Filter'}</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 12 },
  label: { fontSize: 15, fontWeight: '600', marginBottom: 6, marginTop: 16 },
  required: { color: '#f00' },
  hint: { fontSize: 13, color: '#888', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 100 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  switchLabel: { fontSize: 16, fontWeight: '600' },
  subSection: {
    marginLeft: 16,
    marginTop: 8,
    paddingLeft: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#25D366',
  },
  subLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    color: '#555',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#ccc',
    borderRadius: 4,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#25D366',
    borderColor: '#25D366',
  },
  checkmark: { color: '#fff', fontSize: 16, fontWeight: '700' },
  checkboxLabel: { fontSize: 15 },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  radio: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#ccc',
    borderRadius: 12,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioSelected: {
    borderColor: '#25D366',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#25D366',
  },
  radioLabel: { fontSize: 15, fontWeight: '600' },
  radioHint: { fontSize: 13, color: '#888', marginTop: 2 },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
