/**
 * Inbox screen — shows all filters with their match counts.
 * User taps a filter to see its matched messages.
 *
 * Live sync lifecycle:
 *  - Mount / foreground   → initial sync, then startLiveSync
 *  - Background           → stopLiveSync
 *  - History sync done    → startLiveSync (for first-time users)
 *  - Every 30 s           → reload matches + fire notifications for new ones
 */
import React, { useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  AppState,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAppStore, notificationWatermark } from '../../src/stores/appStore';
import type { Filter } from '../../src/native/wabridge';

// Configure how notifications appear when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowList: true,
  }),
});

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
    startLiveSync,
    stopLiveSync,
  } = useAppStore();

  const appState = useRef(AppState.currentState);
  const hasAutoSyncedRef = useRef(false);
  // Tracks the last timestamp we notified up to, to avoid duplicate notifications.
  const lastNotifiedAtRef = useRef<number>(notificationWatermark);

  const loadAll = useCallback(async () => {
    await loadFilters();
    const freshFilters = useAppStore.getState().filters;
    for (const f of freshFilters) {
      await loadMatches(f.id);
    }
  }, [loadFilters, loadMatches]);

  const handleSync = useCallback(async () => {
    // Stop live sync before opening the syncAndTriage connection — WhatsApp
    // drops the older connection when a second one opens on the same device.
    await stopLiveSync();
    await syncAndTriage();
    await loadAll();
    // Restart live sync now that the temporary sync connection has closed.
    await startLiveSync();
  }, [stopLiveSync, syncAndTriage, loadAll, startLiveSync]);

  // Fire local notifications for any matches newer than the watermark that
  // belong to a filter with notifications_enabled.
  const checkAndNotify = useCallback(async () => {
    if (useAppStore.getState().historySyncing) return;
    const { matches: currentMatches, filters: currentFilters } = useAppStore.getState();
    const now = Math.floor(Date.now() / 1000);
    for (const filter of currentFilters) {
      if (!filter.notifications_enabled) continue;
      const filterMatches = currentMatches[filter.id] ?? [];
      const newMatches = filterMatches.filter(
        (m) => m.created_at > lastNotifiedAtRef.current
      );
      for (const match of newMatches) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: filter.name,
              body: `${match.sender_name}: ${match.body.slice(0, 120)}`,
              data: { filterId: filter.id, matchId: match.id },
            },
            trigger: null, // deliver immediately
          });
        } catch (e) {
          console.log('[WACI] notification schedule error:', e);
        }
      }
    }
    lastNotifiedAtRef.current = now;
  }, []);

  // ── Mount: initial sync (handleSync already starts live sync internally) ─
  useEffect(() => {
    if (!hasAutoSyncedRef.current) {
      hasAutoSyncedRef.current = true;
      handleSync();
    }
    return () => {
      stopLiveSync();
    };
  }, [handleSync, stopLiveSync]);

  // ── Start live sync once history sync finishes (first-time users) ──────
  useEffect(() => {
    if (!historySyncing && hasAutoSyncedRef.current) {
      // Advance watermark so historical matches don't all notify.
      lastNotifiedAtRef.current = Math.floor(Date.now() / 1000);
      startLiveSync();
    }
  }, [historySyncing, startLiveSync]);

  // ── Foreground/background: manage live sync ────────────────────────────
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // handleSync stops live sync → syncs → restarts live sync internally.
        handleSync();
      } else if (nextAppState.match(/inactive|background/)) {
        stopLiveSync();
      }
      appState.current = nextAppState;
    });
    return () => subscription.remove();
  }, [handleSync, stopLiveSync]);

  // ── 30s poll: reload matches + notify ─────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      await loadAll();
      await checkAndNotify();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadAll, checkAndNotify]);

  const handleFilterPress = (filter: Filter) => {
    router.push(`/filters/${filter.id}/messages`);
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
    marginBottom: 6,
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
