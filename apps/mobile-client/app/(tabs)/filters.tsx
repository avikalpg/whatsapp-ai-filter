import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/stores/appStore';
import type { Filter } from '../../src/native/wabridge';

export default function FiltersScreen() {
  const router = useRouter();
  const { filters, filtersLoading, loadFilters, deleteFilter } = useAppStore();

  useEffect(() => {
    loadFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = (filter: Filter) => {
    Alert.alert(
      'Delete Filter',
      `Delete "${filter.name}"? All its matches will also be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteFilter(filter.id) },
      ]
    );
  };

  const renderItem = ({ item }: { item: Filter }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/filters/${item.id}`)}
    >
      <View style={styles.cardContent}>
        <Text style={styles.filterName}>{item.name}</Text>
        <Text style={styles.filterPrompt} numberOfLines={2}>{item.prompt}</Text>
      </View>
      <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item)}>
        <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/filters/new')}
      >
        <Text style={styles.addButtonText}>+ New Filter</Text>
      </TouchableOpacity>

      {filters.length === 0 && !filtersLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No filters yet.</Text>
          <Text style={styles.emptyHint}>
            Tap "New Filter" to start filtering your WhatsApp messages with AI.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filters}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshing={filtersLoading}
          onRefresh={loadFilters}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  addButton: {
    margin: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  list: { paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardContent: { flex: 1 },
  filterName: { fontWeight: '600', fontSize: 15, marginBottom: 4 },
  filterPrompt: { fontSize: 13, color: '#666', lineHeight: 18 },
  deleteButton: { paddingHorizontal: 10, paddingVertical: 6 },
  deleteText: { color: '#FF3B30', fontWeight: '500' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 14, color: '#888', textAlign: 'center' },
});
