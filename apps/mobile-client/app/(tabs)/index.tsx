/**
 * Inbox screen — shows all filter matches across all filters.
 * Pulls from every filter's matches and merges them sorted by received_at desc.
 */
import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAppStore } from '../../src/stores/appStore';
import type { FilterMatch } from '../../src/native/wabridge';

export default function InboxScreen() {
  const {
    filters,
    matches,
    syncing,
    historySyncing,
    lastSyncResult,
    syncAndTriage,
    loadFilters,
    loadMatches,
    startHistorySync,
  } = useAppStore();

  const loadAll = useCallback(async () => {
    await loadFilters();
    // Read fresh filters directly from store state — avoids stale closure
    // where the `filters` captured at callback-creation time is still empty.
    const freshFilters = useAppStore.getState().filters;
    for (const f of freshFilters) {
      await loadMatches(f.id);
    }
  }, [loadFilters, loadMatches]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Merge and sort all matches
  const allMatches: FilterMatch[] = Object.values(matches)
    .flat()
    .sort((a, b) => b.received_at - a.received_at);

  const handleSync = async () => {
    await syncAndTriage();
    await loadAll();
  };

  const renderItem = ({ item }: { item: FilterMatch }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.chatName} numberOfLines={1}>{item.chat_name || item.chat_jid}</Text>
        <Text style={styles.time}>{formatTime(item.received_at)}</Text>
      </View>
      <Text style={styles.sender} numberOfLines={1}>{item.sender_name || item.sender_jid}</Text>
      <Text style={styles.body} numberOfLines={3}>{item.body}</Text>
      {item.relevance_reason ? (
        <Text style={styles.reason}>🤖 {item.relevance_reason}</Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      {historySyncing ? (
        <View style={styles.historyBanner}>
          <ActivityIndicator size="small" color="#25D366" style={{ marginRight: 8 }} />
          <Text style={styles.historyBannerText}>Syncing message history…</Text>
        </View>
      ) : null}
      <View style={styles.syncBar}>
        <Text style={styles.syncInfo}>
          {lastSyncResult
            ? `Last sync: ${lastSyncResult.messagesSynced} messages`
            : 'Not synced yet'}
        </Text>
        <TouchableOpacity style={styles.syncButton} onPress={handleSync} disabled={syncing}>
          {syncing ? (
            <ActivityIndicator color="#007AFF" size="small" />
          ) : (
            <Text style={styles.syncButtonText}>Sync</Text>
          )}
        </TouchableOpacity>
      </View>

      {allMatches.length === 0 && !syncing ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No matched messages yet.</Text>
          <Text style={styles.emptyHint}>Add filters and tap Sync to get started.</Text>
        </View>
      ) : (
        <FlatList
          data={allMatches}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={syncing} onRefresh={handleSync} />}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  syncInfo: { fontSize: 13, color: '#666' },
  syncButton: { paddingHorizontal: 12, paddingVertical: 6 },
  syncButtonText: { color: '#007AFF', fontWeight: '600' },
  list: { padding: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  chatName: { fontWeight: '600', fontSize: 15, flex: 1 },
  time: { fontSize: 12, color: '#999', marginLeft: 8 },
  sender: { fontSize: 13, color: '#555', marginBottom: 4 },
  body: { fontSize: 14, color: '#333', lineHeight: 20 },
  reason: { fontSize: 12, color: '#888', marginTop: 6, fontStyle: 'italic' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 14, color: '#888', textAlign: 'center' },
  historyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8faf0',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#b2dfcc',
  },
  historyBannerText: { fontSize: 13, color: '#1a7a45', fontWeight: '500' },
});
