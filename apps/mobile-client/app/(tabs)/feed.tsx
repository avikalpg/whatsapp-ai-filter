import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, ScrollView,
} from 'react-native';
import { useAuthStore } from '../../src/stores/auth';
import { getFilters, Filter } from '../../src/api/filters';
import { getMessages, markRead, FilterMatch } from '../../src/api/messages';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function MatchCard({ item, onRead }: { item: FilterMatch; onRead: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={[styles.card, !item.is_read && styles.cardUnread]}
      onPress={() => { onRead(item.id); setExpanded((v) => !v); }}
      activeOpacity={0.85}
    >
      <View style={styles.cardHeader}>
        <View style={styles.filterBadge}>
          <Text style={styles.filterBadgeText}>{item.filter_name}</Text>
        </View>
        <Text style={styles.timestamp}>{timeAgo(item.received_at)}</Text>
      </View>

      <Text style={styles.source}>
        {item.is_dm ? '💬 Direct Message' : `👥 ${item.group_name ?? 'Group'}`}
        {item.sender_name ? ` · ${item.sender_name}` : ''}
      </Text>

      <Text style={styles.content} numberOfLines={expanded ? undefined : 4}>
        {item.content ?? '(no content)'}
      </Text>

      {item.reasoning && (
        <Text style={styles.reasoning} numberOfLines={expanded ? undefined : 2}>
          🤖 {item.reasoning}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function FeedScreen() {
  const token = useAuthStore((s) => s.token)!;
  const [filters, setFilters] = useState<Filter[]>([]);
  const [activeFilterId, setActiveFilterId] = useState<string | undefined>(undefined);
  const [matches, setMatches] = useState<FilterMatch[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadSeqRef = useRef(0);

  const load = useCallback(async (reset = false) => {
    if (!token) return;
    const seq = ++loadSeqRef.current;
    try {
      const res = await getMessages(token, {
        filter_id: activeFilterId,
        cursor: reset ? undefined : (cursor ?? undefined),
        limit: 20,
      });
      if (seq !== loadSeqRef.current) return; // discard stale response
      setMatches((prev) => reset ? res.matches : [...prev, ...res.matches]);
      setCursor(res.next_cursor);
      setHasMore(res.next_cursor !== null);
    } catch (e) {
      console.error(e);
    }
  }, [token, activeFilterId, cursor]);

  async function refresh() {
    setRefreshing(true);
    setCursor(null);
    await load(true);
    setRefreshing(false);
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await load(false);
    setLoadingMore(false);
  }

  useEffect(() => {
    if (!token) return;
    getFilters(token).then(setFilters).catch(console.error);
  }, [token]);

  useEffect(() => {
    setCursor(null);
    setMatches([]);
    setHasMore(true);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilterId]);

  async function handleRead(id: string) {
    const match = matches.find((m) => m.id === id);
    if (!match || match.is_read) return;
    try {
      await markRead(token, id);
      setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, is_read: true } : m)));
    } catch { /* ignore */ }
  }

  return (
    <View style={styles.container}>
      {/* Filter chip row */}
      <View style={styles.chipsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <TouchableOpacity
            style={[styles.chip, !activeFilterId && styles.chipActive]}
            onPress={() => setActiveFilterId(undefined)}
          >
            <Text style={[styles.chipText, !activeFilterId && styles.chipTextActive]}>All</Text>
          </TouchableOpacity>
          {filters.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.chip, activeFilterId === f.id && styles.chipActive]}
              onPress={() => setActiveFilterId(f.id)}
            >
              <Text style={[styles.chipText, activeFilterId === f.id && styles.chipTextActive]}>{f.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={matches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MatchCard item={item} onRead={handleRead} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#25D366" />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color="#25D366" /> : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyBody}>Link your WhatsApp and create filters — matching messages will appear here.</Text>
          </View>
        }
        contentContainerStyle={matches.length === 0 ? { flex: 1 } : { paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  chipsWrapper: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  chips: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#25D366', borderColor: '#25D366' },
  chipText: { fontSize: 13, color: '#444' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fff', marginHorizontal: 12, marginTop: 10, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: '#25D366' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  filterBadge: { backgroundColor: '#e8f9f0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  filterBadgeText: { fontSize: 12, color: '#1a7d45', fontWeight: '600' },
  timestamp: { fontSize: 12, color: '#999' },
  source: { fontSize: 13, color: '#666', marginBottom: 6 },
  content: { fontSize: 15, color: '#111', lineHeight: 21 },
  reasoning: { fontSize: 12, color: '#888', marginTop: 8, lineHeight: 18, fontStyle: 'italic' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
});
