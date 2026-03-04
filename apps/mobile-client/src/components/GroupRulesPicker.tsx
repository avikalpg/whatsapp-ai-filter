import { useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  Modal, StyleSheet, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Group } from '../api/whatsapp';
import { GroupRule } from '../api/filters';

interface Props {
  groups: Group[];
  rules: GroupRule[];
  onChange: (rules: GroupRule[]) => void;
}

export default function GroupRulesPicker({ groups, rules, onChange }: Props) {
  const [modalVisible, setModalVisible] = useState(false);

  function getRule(groupId: string): GroupRule | undefined {
    return rules.find((r) => r.group_id === groupId);
  }

  function toggleGroup(group: Group) {
    const existing = getRule(group.id);
    if (!existing) {
      // Not in list → add as 'include'
      onChange([...rules, { group_id: group.id, group_name: group.name, rule_type: 'include' }]);
    } else if (existing.rule_type === 'include') {
      // include → exclude
      onChange(rules.map((r) => r.group_id === group.id ? { ...r, rule_type: 'exclude' } : r));
    } else {
      // exclude → remove
      onChange(rules.filter((r) => r.group_id !== group.id));
    }
  }

  function ruleIcon(groupId: string): { name: string; color: string } | null {
    const rule = getRule(groupId);
    if (!rule) return null;
    return rule.rule_type === 'include'
      ? { name: 'checkmark-circle', color: '#25D366' }
      : { name: 'close-circle', color: '#e74c3c' };
  }

  if (groups.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Link WhatsApp to configure group rules.</Text>
      </View>
    );
  }

  return (
    <View>
      <TouchableOpacity style={styles.openButton} onPress={() => setModalVisible(true)}>
        <Text style={styles.openButtonText}>
          {rules.length === 0 ? 'All groups (tap to configure)' : `${rules.length} rule${rules.length !== 1 ? 's' : ''} set`}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#666" />
      </TouchableOpacity>

      {rules.length > 0 && (
        <View style={styles.rulesSummary}>
          {rules.map((r) => (
            <View key={r.group_id} style={styles.ruleChip}>
              <Ionicons name={r.rule_type === 'include' ? 'checkmark-circle' : 'close-circle'} size={14} color={r.rule_type === 'include' ? '#25D366' : '#e74c3c'} />
              <Text style={styles.ruleChipText}>{r.group_name}</Text>
            </View>
          ))}
        </View>
      )}

      <Modal visible={modalVisible} animationType="slide">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Group Rules</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.modalHint}>Tap: add include → add exclude → remove</Text>
          <FlatList
            data={groups}
            keyExtractor={(g) => g.id}
            renderItem={({ item }) => {
              const icon = ruleIcon(item.id);
              return (
                <TouchableOpacity style={styles.groupRow} onPress={() => toggleGroup(item)}>
                  <Text style={styles.groupName}>{item.name}</Text>
                  {icon
                    ? <Ionicons name={icon.name as any} size={22} color={icon.color} />
                    : <View style={styles.emptyCircle} />}
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 12, backgroundColor: '#f9f9f9', borderRadius: 10, borderWidth: 1, borderColor: '#eee' },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center' },
  openButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, backgroundColor: '#fafafa' },
  openButtonText: { fontSize: 15, color: '#444' },
  rulesSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  ruleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f9f9f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#eee' },
  ruleChipText: { fontSize: 12, color: '#444' },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  doneText: { fontSize: 16, color: '#25D366', fontWeight: '600' },
  modalHint: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 10, backgroundColor: '#f9f9f9' },
  groupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  groupName: { fontSize: 15, color: '#111', flex: 1 },
  emptyCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#ddd' },
  separator: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 16 },
});
