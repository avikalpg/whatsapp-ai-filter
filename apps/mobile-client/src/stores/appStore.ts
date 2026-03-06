/**
 * appStore.ts
 * Central Zustand store for the WACI mobile client.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { Filter, FilterMatch, SyncResult } from '../native/wabridge';
import * as WaBridge from '../native/wabridge';

// ── Constants ──────────────────────────────────────────────────────────────

const LAST_SYNC_KEY = 'waci_last_sync_ts';
const DB_PATH_KEY = 'waci_db_path';

// ── State types ──────────────────────────────────────────────────────────────

export type AppScreen = 'splash' | 'setup-api-key' | 'link-whatsapp' | 'inbox';

interface AppState {
  // Setup
  isInitialized: boolean;
  claudeApiKey: string | null;
  isLinked: boolean;
  pairingCode: string | null;

  // Filters
  filters: Filter[];
  filtersLoading: boolean;

  // Matches (keyed by filterId)
  matches: Record<string, FilterMatch[]>;
  matchesLoading: Record<string, boolean>;

  // Sync
  lastSyncTimestamp: number;
  syncing: boolean;
  lastSyncResult: SyncResult | null;

  // Error / status
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  saveApiKey: (key: string) => Promise<void>;
  startPairing: (phoneNumber: string) => Promise<void>;
  refreshLinkedStatus: () => Promise<void>;
  loadFilters: () => Promise<void>;
  saveFilter: (filter: Omit<Filter, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => Promise<void>;
  deleteFilter: (id: string) => Promise<void>;
  loadMatches: (filterId: string, limit?: number) => Promise<void>;
  syncAndTriage: () => Promise<void>;
  unlink: () => Promise<void>;
  clearError: () => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  isInitialized: false,
  claudeApiKey: null,
  isLinked: false,
  pairingCode: null,
  filters: [],
  filtersLoading: false,
  matches: {},
  matchesLoading: {},
  lastSyncTimestamp: 0,
  syncing: false,
  lastSyncResult: null,
  error: null,

  // ── initialize ──────────────────────────────────────────────────────────

  initialize: async () => {
    try {
      const apiKey = await SecureStore.getItemAsync('claude_api_key');
      const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const dbPath = await AsyncStorage.getItem(DB_PATH_KEY);

      const resolvedDbPath = dbPath ?? getDefaultDbPath();
      await AsyncStorage.setItem(DB_PATH_KEY, resolvedDbPath);

      if (apiKey) {
        await WaBridge.initBridge(resolvedDbPath, apiKey);
        const linked = await WaBridge.isLinked();
        set({
          claudeApiKey: apiKey,
          isLinked: linked,
          lastSyncTimestamp: lastSync ? parseInt(lastSync, 10) : 0,
          isInitialized: true,
        });
      } else {
        set({ isInitialized: true });
      }
    } catch (e: unknown) {
      set({ error: String(e), isInitialized: true });
    }
  },

  // ── saveApiKey ─────────────────────────────────────────────────────────

  saveApiKey: async (key: string) => {
    try {
      await SecureStore.setItemAsync('claude_api_key', key);
      const dbPath = (await AsyncStorage.getItem(DB_PATH_KEY)) ?? getDefaultDbPath();
      await WaBridge.initBridge(dbPath, key);
      const linked = await WaBridge.isLinked();
      set({ claudeApiKey: key, isLinked: linked });
    } catch (e: unknown) {
      set({ error: String(e) });
    }
  },

  // ── startPairing ───────────────────────────────────────────────────────

  startPairing: async (phoneNumber: string) => {
    try {
      const code = await WaBridge.startPairing(phoneNumber);
      set({ pairingCode: code });
    } catch (e: unknown) {
      set({ error: String(e) });
    }
  },

  // ── refreshLinkedStatus ────────────────────────────────────────────────

  refreshLinkedStatus: async () => {
    try {
      const linked = await WaBridge.isLinked();
      set({ isLinked: linked });
    } catch (e: unknown) {
      set({ error: String(e) });
    }
  },

  // ── loadFilters ────────────────────────────────────────────────────────

  loadFilters: async () => {
    set({ filtersLoading: true });
    try {
      const filters = await WaBridge.getFilters();
      set({ filters, filtersLoading: false });
    } catch (e: unknown) {
      set({ error: String(e), filtersLoading: false });
    }
  },

  // ── saveFilter ─────────────────────────────────────────────────────────

  saveFilter: async (filter) => {
    try {
      const saved = await WaBridge.saveFilter(filter);
      const filters = get().filters;
      const idx = filters.findIndex((f) => f.id === saved.id);
      if (idx >= 0) {
        const next = [...filters];
        next[idx] = saved;
        set({ filters: next });
      } else {
        set({ filters: [saved, ...filters] });
      }
    } catch (e: unknown) {
      set({ error: String(e) });
    }
  },

  // ── deleteFilter ───────────────────────────────────────────────────────

  deleteFilter: async (id: string) => {
    try {
      await WaBridge.deleteFilter(id);
      set({ filters: get().filters.filter((f) => f.id !== id) });
    } catch (e: unknown) {
      set({ error: String(e) });
    }
  },

  // ── loadMatches ────────────────────────────────────────────────────────

  loadMatches: async (filterId: string, limit = 50) => {
    set({ matchesLoading: { ...get().matchesLoading, [filterId]: true } });
    try {
      const items = await WaBridge.getMatches(filterId, limit);
      set({
        matches: { ...get().matches, [filterId]: items },
        matchesLoading: { ...get().matchesLoading, [filterId]: false },
      });
    } catch (e: unknown) {
      set({ error: String(e), matchesLoading: { ...get().matchesLoading, [filterId]: false } });
    }
  },

  // ── syncAndTriage ──────────────────────────────────────────────────────

  syncAndTriage: async () => {
    const { lastSyncTimestamp } = get();
    set({ syncing: true });
    try {
      const result = await WaBridge.syncAndTriage(lastSyncTimestamp);
      const now = Math.floor(Date.now() / 1000);
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(now));
      set({ syncing: false, lastSyncResult: result, lastSyncTimestamp: now });
    } catch (e: unknown) {
      set({ syncing: false, error: String(e) });
    }
  },

  // ── unlink ─────────────────────────────────────────────────────────────

  unlink: async () => {
    try {
      await WaBridge.unlink();
      set({ isLinked: false, pairingCode: null });
    } catch (e: unknown) {
      set({ error: String(e) });
    }
  },

  clearError: () => set({ error: null }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDefaultDbPath(): string {
  // React Native FileSystem.documentDirectory is set at runtime; use a placeholder
  // that the native module resolves to the app's Documents directory.
  return 'waci.db';
}
