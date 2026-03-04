import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Switch, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/auth';
import { getFilters, updateFilter, Filter } from '../../src/api/filters';
import { getStatus, WhatsAppStatus } from '../../src/api/whatsapp';

function StatusDot({ status }: { status: WhatsAppStatus['status'] }) {
  const colors: Record<WhatsAppStatus['status'], string> = {
    ready: '#25D366', linking: '#f5a623', unlinked: '#ccc', disconnected: '#e74c3c',
  };
  return <View style={[styles.dot, { backgroundColor: colors[status] }]} />;
}

export default function SettingsScreen() {
  const token = useAuthStore((s) => s.token)!;
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const router = useRouter();

  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!token) return;
    try {
      const [status, filterList] = await Promise.all([getStatus(token), getFilters(token)]);
      setWaStatus(status);
      setFilters(filterList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function toggleFilter(id: string, isActive: boolean) {
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, is_active: isActive } : f)));
    try {
      await updateFilter(token, id, { is_active: isActive });
    } catch {
      setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, is_active: !isActive } : f)));
      Alert.alert('Error', 'Failed to update filter');
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => clearAuth() },
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#25D366" size="large" /></View>;
  }

  return (
    <FlatList
      style={styles.container}
      data={filters}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          {/* WhatsApp section */}
          <Text style={styles.sectionTitle}>WhatsApp</Text>
          <View style={styles.card}>
            <View style={styles.waRow}>
              <StatusDot status={waStatus?.status ?? 'unlinked'} />
              <View style={{ flex: 1 }}>
                <Text style={styles.waStatusText}>
                  {waStatus?.status === 'ready' ? 'Connected' :
                    waStatus?.status === 'linking' ? 'Linking…' :
                    waStatus?.status === 'disconnected' ? 'Disconnected' : 'Not linked'}
                </Text>
                {waStatus?.phone_number && (
                  <Text style={styles.waPhone}>+{waStatus.phone_number}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => router.push('/link-whatsapp')}
              >
                <Text style={styles.linkButtonText}>
                  {waStatus?.status === 'ready' ? 'Re-link' : 'Link'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Filters section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Filters</Text>
            <TouchableOpacity onPress={() => router.push('/filters/new')} style={styles.addButton}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.filterRow}
          onPress={() => router.push(`/filters/${item.id}`)}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.filterTitleRow}>
              <Text style={styles.filterName}>{item.name}</Text>
              {item.is_preset && (
                <View style={styles.presetBadge}>
                  <Text style={styles.presetBadgeText}>preset</Text>
                </View>
              )}
            </View>
            <Text style={styles.filterPrompt} numberOfLines={1}>{item.prompt}</Text>
          </View>
          <Switch
            value={item.is_active}
            onValueChange={(v) => toggleFilter(item.id, v)}
            trackColor={{ false: '#ddd', true: '#a8e6bc' }}
            thumbColor={item.is_active ? '#25D366' : '#f4f3f4'}
          />
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListFooterComponent={
        <View>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      }
      contentContainerStyle={{ paddingBottom: 40 }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  card: { backgroundColor: '#fff', marginHorizontal: 12, borderRadius: 12, overflow: 'hidden' },
  waRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  waStatusText: { fontSize: 15, fontWeight: '600', color: '#111' },
  waPhone: { fontSize: 13, color: '#666', marginTop: 2 },
  linkButton: { backgroundColor: '#25D366', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  linkButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  addButton: { backgroundColor: '#25D366', borderRadius: 20, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12 },
  filterTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  filterName: { fontSize: 15, fontWeight: '600', color: '#111' },
  filterPrompt: { fontSize: 13, color: '#888' },
  presetBadge: { backgroundColor: '#e8f0fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  presetBadgeText: { fontSize: 11, color: '#3f65c2', fontWeight: '600' },
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 14 },
  signOutButton: { margin: 16, marginTop: 32, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e74c3c', alignItems: 'center' },
  signOutText: { color: '#e74c3c', fontWeight: '600', fontSize: 15 },
});
