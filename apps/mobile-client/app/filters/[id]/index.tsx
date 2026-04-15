/**
 * Filter create/edit screen — configure all filter options.
 */
import React, { useState } from 'react';
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
import GroupPicker from '../../../src/components/GroupPicker';

// ── Contact/business type helpers ────────────────────────────────────────────

type ContactType = 'all' | 'contacts_only' | 'non_contacts_only';
type BusinessType = 'all' | 'non_businesses_only' | 'businesses_only';

function getContactType(contacts: boolean, nonContacts: boolean): ContactType {
  if (contacts && !nonContacts) return 'contacts_only';
  if (!contacts && nonContacts) return 'non_contacts_only';
  return 'all';
}
function getBusinessType(businesses: boolean, nonBusinesses: boolean): BusinessType {
  if (businesses && !nonBusinesses) return 'businesses_only';
  if (!businesses && nonBusinesses) return 'non_businesses_only';
  return 'all';
}

export default function FilterEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { filters, saveFilter } = useAppStore();

  const existingFilter = filters.find((f) => f.id === id);

  // Basic info
  const [name, setName] = useState(existingFilter?.name ?? '');
  const [prompt, setPrompt] = useState(existingFilter?.prompt ?? '');
  const [filterMode, setFilterMode] = useState<'intelligent' | 'basic'>(
    existingFilter?.filter_mode ?? 'intelligent'
  );

  // DM options
  const [processDMs, setProcessDMs] = useState(existingFilter?.process_dms ?? true);
  const [contactType, setContactType] = useState<ContactType>(
    getContactType(existingFilter?.dm_contacts ?? true, existingFilter?.dm_non_contacts ?? true)
  );
  const [businessType, setBusinessType] = useState<BusinessType>(
    getBusinessType(existingFilter?.dm_businesses ?? false, existingFilter?.dm_non_businesses ?? true)
  );
  const [processStatus, setProcessStatus] = useState(existingFilter?.process_status ?? false);

  // Group options
  const [processGroups, setProcessGroups] = useState(existingFilter?.process_groups ?? true);
  const [groupMode, setGroupMode] = useState<'inclusion' | 'exclusion'>(
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
      Alert.alert('Error', filterMode === 'basic' ? 'Please enter at least one keyword.' : 'Please enter a filter description.');
      return;
    }
    if (processGroups && groupMode === 'inclusion' && groupList.length === 0) {
      Alert.alert('Error', 'Inclusion mode requires at least one group.');
      return;
    }

    // Expand radio selections back to booleans
    const dmContacts = contactType === 'all' || contactType === 'contacts_only';
    const dmNonContacts = contactType === 'all' || contactType === 'non_contacts_only';
    const dmBusinesses = businessType === 'all' || businessType === 'businesses_only';
    const dmNonBusinesses = businessType === 'all' || businessType === 'non_businesses_only';

    setSaving(true);
    await saveFilter({
      id,
      name: name.trim(),
      prompt: prompt.trim(),
      filter_mode: filterMode,
      process_dms: processDMs,
      dm_contacts: dmContacts,
      dm_non_contacts: dmNonContacts,
      dm_businesses: dmBusinesses,
      dm_non_businesses: dmNonBusinesses,
      process_status: processStatus,
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

        {/* ── Basic Info ──────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Basic Info</Text>

        <Text style={styles.label}>Filter Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. SF Meetups"
          value={name}
          onChangeText={setName}
        />

        {/* ── Filter Mode ─────────────────────────────────────────────── */}
        <Text style={styles.label}>Filter Type</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeButton, filterMode === 'basic' && styles.modeButtonActive]}
            onPress={() => setFilterMode('basic')}
          >
            <Text style={[styles.modeButtonText, filterMode === 'basic' && styles.modeButtonTextActive]}>
              Basic
            </Text>
            <Text style={[styles.modeButtonHint, filterMode === 'basic' && styles.modeButtonHintActive]}>
              Keywords / regex · Free
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, filterMode === 'intelligent' && styles.modeButtonActive]}
            onPress={() => setFilterMode('intelligent')}
          >
            <Text style={[styles.modeButtonText, filterMode === 'intelligent' && styles.modeButtonTextActive]}>
              AI-powered
            </Text>
            <Text style={[styles.modeButtonHint, filterMode === 'intelligent' && styles.modeButtonHintActive]}>
              Smart matching · Requires trial
            </Text>
          </TouchableOpacity>
        </View>

        {filterMode === 'basic' ? (
          <>
            <Text style={styles.label}>Keywords</Text>
            <Text style={styles.hint}>
              Comma-separated keywords (any match triggers). Start with{' '}
              <Text style={styles.code}>regex:</Text> for a regex pattern.
              {'\n'}Example: <Text style={styles.code}>job offer, salary, interview</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. job offer, salary, hiring"
              value={prompt}
              onChangeText={setPrompt}
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>Description / Prompt</Text>
            <Text style={styles.hint}>
              Describe what messages you want to catch. The AI uses this to decide relevance.
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
          </>
        )}

        {/* ── Direct Messages ─────────────────────────────────────────── */}
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
            <Text style={styles.subLabel}>Contact type</Text>
            {(
              [
                { value: 'all', label: 'Contacts & non-contacts' },
                { value: 'contacts_only', label: 'Contacts only' },
                { value: 'non_contacts_only', label: 'Non-contacts only' },
              ] as { value: ContactType; label: string }[]
            ).map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.radioRow}
                onPress={() => setContactType(opt.value)}
              >
                <View style={[styles.radio, contactType === opt.value && styles.radioSelected]}>
                  {contactType === opt.value && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.radioLabel}>{opt.label}</Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.subLabel, { marginTop: 12 }]}>Business accounts</Text>
            {(
              [
                { value: 'all', label: 'Businesses & non-businesses' },
                { value: 'non_businesses_only', label: 'Non-businesses only' },
                { value: 'businesses_only', label: 'Businesses only' },
              ] as { value: BusinessType; label: string }[]
            ).map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.radioRow}
                onPress={() => setBusinessType(opt.value)}
              >
                <View style={[styles.radio, businessType === opt.value && styles.radioSelected]}>
                  {businessType === opt.value && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.radioLabel}>{opt.label}</Text>
              </TouchableOpacity>
            ))}

            <View style={[styles.switchRow, { marginTop: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Include status updates</Text>
                <Text style={styles.hint}>Process WhatsApp status (story) posts</Text>
              </View>
              <Switch
                value={processStatus}
                onValueChange={setProcessStatus}
                trackColor={{ false: '#ccc', true: '#25D366' }}
              />
            </View>
          </View>
        )}

        {/* ── Group Messages ───────────────────────────────────────────── */}
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

            <TouchableOpacity style={styles.radioRow} onPress={() => setGroupMode('exclusion')}>
              <View style={[styles.radio, groupMode === 'exclusion' && styles.radioSelected]}>
                {groupMode === 'exclusion' && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.radioLabel}>All groups except:</Text>
                <Text style={styles.radioHint}>(Exclusion list — optional)</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.radioRow} onPress={() => setGroupMode('inclusion')}>
              <View style={[styles.radio, groupMode === 'inclusion' && styles.radioSelected]}>
                {groupMode === 'inclusion' && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.radioLabel}>Only these groups:</Text>
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

        {/* ── Notifications ────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Notify on match</Text>
            <Text style={styles.hint}>Get a notification when a new message matches this filter</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: '#ccc', true: '#25D366' }}
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
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
  hint: { fontSize: 13, color: '#888', marginBottom: 8, lineHeight: 18 },
  code: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: '#444' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 100 },
  // Filter mode selector
  modeRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modeButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  modeButtonActive: { borderColor: '#25D366', backgroundColor: '#f0faf4' },
  modeButtonText: { fontSize: 15, fontWeight: '600', color: '#555' },
  modeButtonTextActive: { color: '#1a7a45' },
  modeButtonHint: { fontSize: 11, color: '#aaa', marginTop: 2 },
  modeButtonHintActive: { color: '#3aaa6a' },
  // Rows
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
  subLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#555' },
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  radio: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#ccc',
    borderRadius: 11,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: '#25D366' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#25D366' },
  radioLabel: { fontSize: 15 },
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
