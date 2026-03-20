/**
 * Inbox screen — shows all filters with their match counts.
 * User taps a filter to see its matched messages.
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
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/stores/appStore';
import type { Filter } from '../../src/native/wabridge';

export default function InboxScreen() {
  const router = useRouter();
  const {
    filters,
    matches,
    syncing,
    historySyncing,
    lastSyncResult,
    syncAndTriage,
    loadFilters,
    loadMatches,
  } = useAppStore();

  const loadAll = useCallback(async () => {
    await loadFilters();
    const freshFilters = useAppStore.getState().filters;
    for (const f of freshFilters) {
      await loadMatches(f.id);
    }
  }, [loadFilters, loadMatches]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSync = async () => {
    await syncAndTriage();
    await loadAll();
  };

<<<<<<< HEAD
  const handleOpenMessage = (item: FilterMatch) => {
    const chatJID = item.chat_jid;
    if (!chatJID) return;

    if (chatJID.endsWith('@g.us')) {
      // Groups: no reliable public deep link — inform the user.
      Alert.alert(
        'Group message',
        'Opening a specific group chat directly isn\'t supported yet. Open WhatsApp and find the group manually.',
        [{ text: 'OK' }],
      );
      return;
    }

    // Individual chat (DM): use sender_jid to get the contact's phone number.
    // For DMs, sender_jid is the person you're chatting with.
    const senderJID = item.sender_jid;
    const phone = senderJID.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    if (!phone) return;

    // wa.me opens the conversation in WhatsApp (works on Android + iOS).
    Linking.openURL(`https://wa.me/${phone}`).catch(() => {
      Alert.alert('Error', 'Could not open WhatsApp. Make sure it is installed.');
    });
=======
  const handleFilterPress = (filter: Filter) => {
    router.push(`/filters/${filter.id}`);
>>>>>>> 88be7e7 (feat(inbox): show filters instead of messages; add All DMs and DMs from Contacts default filters)
  };

  const getMatchCount = (filterId: string): number => {
    return matches[filterId]?.length ?? 0;
  };

  const renderItem = ({ item }: { item: Filter }) => {
    const count = getMatchCount(item.id);
    return (
      <TouchableOpacity
        style={styles.filterCard}
        onPress={() => handleFilterPress(item)}
        activeOpacity={0.75}
      >
        <View style={styles.filterHeader}>
          <Text style={styles.filterName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count}</Text>
          </View>
        </View>
        <Text style={styles.filterPrompt} numberOfLines={2}>
          {item.prompt}
        </Text>
        <Text style={styles.tapHint}>Tap to view messages →</Text>
      </TouchableOpacity>
    );
  };

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

      {filters.length === 0 && !syncing ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No filters yet.</Text>
          <Text style={styles.emptyHint}>Create a filter to get started.</Text>
        </View>
      ) : (
        <FlatList
          data={filters}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={syncing} onRefresh={handleSync} />}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
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
  filterCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  filterHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 6 
  },
  filterName: { fontWeight: '600', fontSize: 16, flex: 1 },
  badge: {
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
  },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  filterPrompt: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 8 },
  tapHint: { fontSize: 11, color: '#25D366', textAlign: 'right' },
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
