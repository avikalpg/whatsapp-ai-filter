/**
 * GroupPicker - Multi-select searchable group picker
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { getGroups, type GroupInfo } from '../native/wabridge';

interface GroupPickerProps {
  selectedJIDs: string[];
  onSelectionChange: (jids: string[]) => void;
  mode: 'inclusion' | 'exclusion';
}

export default function GroupPicker({ selectedJIDs, onSelectionChange, mode }: GroupPickerProps) {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<GroupInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredGroups(groups);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredGroups(
        groups.filter((g) => g.name.toLowerCase().includes(query))
      );
    }
  }, [searchQuery, groups]);

  const loadGroups = async () => {
    try {
      const groupList = await getGroups();
      setGroups(groupList);
      setFilteredGroups(groupList);
    } catch (error) {
      Alert.alert('Error', `Failed to load groups: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (jid: string) => {
    if (selectedJIDs.includes(jid)) {
      onSelectionChange(selectedJIDs.filter((j) => j !== jid));
    } else {
      onSelectionChange([...selectedJIDs, jid]);
    }
  };

  const renderGroup = ({ item }: { item: GroupInfo }) => {
    const isSelected = selectedJIDs.includes(item.jid);
    return (
      <TouchableOpacity
        style={[styles.groupItem, isSelected && styles.groupItemSelected]}
        onPress={() => toggleGroup(item.jid)}
        activeOpacity={0.7}
      >
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{item.name}</Text>
          <Text style={styles.groupMeta}>{item.participant_count} participants</Text>
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading groups...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.helpText}>
        {mode === 'inclusion'
          ? 'Select groups to include in this filter'
          : 'Select groups to exclude from this filter'}
      </Text>
      
      <TextInput
        style={styles.searchInput}
        placeholder="Search groups..."
        placeholderTextColor="#999"
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.selectedCount}>
        {selectedJIDs.length} group{selectedJIDs.length !== 1 ? 's' : ''} selected
      </Text>

      <FlatList
        data={filteredGroups}
        keyExtractor={(item) => item.jid}
        renderItem={renderGroup}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {searchQuery ? 'No groups match your search' : 'No groups found'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#666',
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  searchInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  selectedCount: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8f8f8',
    marginBottom: 8,
  },
  groupItemSelected: {
    backgroundColor: '#e6f2ff',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  groupMeta: {
    fontSize: 13,
    color: '#666',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 15,
    marginTop: 40,
  },
});
