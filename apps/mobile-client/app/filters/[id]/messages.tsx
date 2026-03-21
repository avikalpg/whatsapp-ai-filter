/**
 * Filter messages view — shows all messages matched by a specific filter
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
  Linking,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppStore } from '../../../src/stores/appStore';
import type { FilterMatch } from '../../../src/native/wabridge';
import { Ionicons } from '@expo/vector-icons';

export default function FilterMessagesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    filters,
    matches,
    syncing,
    syncAndTriage,
    loadFilters,
    loadMatches,
  } = useAppStore();

  const filter = filters.find((f) => f.id === id);
  const filterMatches = matches[id] || [];

  const loadAll = useCallback(async () => {
    await loadFilters();
    if (id) {
      await loadMatches(id);
    }
  }, [loadFilters, loadMatches, id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSync = async () => {
    await syncAndTriage();
    await loadAll();
  };

  const handleOpenMessage = (item: FilterMatch) => {
    const chatJID = item.chat_jid;
    if (!chatJID) return;

    if (chatJID.endsWith('@g.us')) {
      Alert.alert(
        'Group message',
        'Opening a specific group chat directly isn\'t supported yet. Open WhatsApp and find the group manually.',
        [{ text: 'OK' }],
      );
      return;
    }

    const senderJID = item.sender_jid;
    const phone = senderJID.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    if (!phone) return;

    Linking.openURL(`https://wa.me/${phone}`).catch(() => {
      Alert.alert('Error', 'Could not open WhatsApp. Make sure it is installed.');
    });
  };

  const renderItem = ({ item }: { item: FilterMatch }) => {
    const time = new Date(item.received_at * 1000).toLocaleString();
    const isGroup = item.chat_jid.endsWith('@g.us');
    
    // For DMs, prefer sender_name. For groups, use chat_name.
    let displayName = isGroup ? item.chat_name : item.sender_name;
    
    // Check if the name is likely from a saved contact vs WhatsApp profile
    // If sender_name looks like a JID or equals the JID, it's not a real name
    const isProfileName = !isGroup && (
      item.sender_name === item.sender_jid ||
      item.sender_name.includes('@') ||
      /^\+?\d+$/.test(item.sender_name) // Just a phone number
    );
    
    // Fallback: if no good name, format the JID as a phone number
    if (!displayName || displayName === item.chat_jid || displayName === item.sender_jid) {
      const phone = (isGroup ? item.chat_jid : item.sender_jid)
        .replace('@s.whatsapp.net', '')
        .replace('@g.us', '')
        .replace(/[^0-9]/g, '');
      displayName = phone ? `+${phone}` : 'Unknown';
    }
    
    return (
      <TouchableOpacity style={styles.card} onPress={() => handleOpenMessage(item)}>
        <View style={styles.cardHeader}>
          <Text 
            style={[styles.chatName, isProfileName && styles.profileName]} 
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        {isGroup && item.sender_name && (
          <Text style={styles.sender}>{item.sender_name}</Text>
        )}
        <Text style={styles.body} numberOfLines={4}>
          {item.body}
        </Text>
        {item.relevance_reason && (
          <Text style={styles.reason}>💡 {item.relevance_reason}</Text>
        )}
        <Text style={styles.tapHint}>Tap to open in WhatsApp →</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{filter?.name || 'Filter'}</Text>
          <Text style={styles.subtitle}>{filterMatches.length} messages</Text>
        </View>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push(`/filters/${id}`)}
        >
          <Ionicons name="settings-outline" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {filterMatches.length === 0 && !syncing ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No messages yet.</Text>
          <Text style={styles.emptyHint}>Sync to check for new matches.</Text>
        </View>
      ) : (
        <FlatList
          data={filterMatches}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  editButton: {
    padding: 8,
  },
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
  profileName: { fontStyle: 'italic', fontWeight: '500' }, // WhatsApp profile name (not saved contact)
  time: { fontSize: 12, color: '#999', marginLeft: 8 },
  sender: { fontSize: 13, color: '#555', marginBottom: 4 },
  body: { fontSize: 14, color: '#333', lineHeight: 20 },
  reason: { fontSize: 12, color: '#888', marginTop: 6, fontStyle: 'italic' },
  tapHint: { fontSize: 11, color: '#25D366', marginTop: 8, textAlign: 'right' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 14, color: '#888', textAlign: 'center' },
});
