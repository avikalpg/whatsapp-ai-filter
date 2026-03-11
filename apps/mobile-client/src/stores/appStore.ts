/**
 * appStore.ts
 * Central Zustand store for the WACI mobile client.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { Filter, FilterMatch, SyncResult } from '../native/wabridge';
import * as WaBridge from '../native/wabridge';
import { registerDevice, reissueToken, activateTrial } from '../api/chat';

// ── Constants ──────────────────────────────────────────────────────────────

const LAST_SYNC_KEY = 'waci_last_sync_ts';
const DB_PATH_KEY = 'waci_db_path';
const DEVICE_ID_KEY = 'waci_device_id';
const SERVER_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://whatsapp-ai-filter.vercel.app';

// ── State types ──────────────────────────────────────────────────────────────

export type AppScreen = 'splash' | 'link-whatsapp' | 'inbox';

interface AppState {
  // Setup
  isInitialized: boolean;
  /** Non-null when initialize() failed — bridge is not ready, show retry UI. */
  initError: string | null;
  authToken: string | null;
  trialExpiresAt: string | null;
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
  retryInit: () => Promise<void>;
  startPairing: (phoneNumber: string) => Promise<void>;
  confirmLinked: () => Promise<void>;
  refreshLinkedStatus: () => Promise<void>;
  loadFilters: () => Promise<void>;
  saveFilter: (filter: Omit<Filter, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => Promise<void>;
  deleteFilter: (id: string) => Promise<void>;
  loadMatches: (filterId: string, limit?: number) => Promise<void>;
  syncAndTriage: () => Promise<void>;
  unlink: () => Promise<void>;
  refreshToken: () => Promise<void>;
  clearError: () => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  isInitialized: false,
  initError: null,
  authToken: null,
  trialExpiresAt: null,
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
      // Get or create a stable device ID
      let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (!deviceId) {
        deviceId = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          Math.random().toString() + Date.now().toString()
        );
        await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
      }

      // Get or create auth token from backend
      let authToken = await SecureStore.getItemAsync('waci_auth_token');
      const trialExpiresAt = await AsyncStorage.getItem('waci_trial_expires_at');

      const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const dbPath = await resolveDbPath();

      if (!authToken) {
        // First install — register device (reissues automatically if already registered).
        // Persist only after bridge init succeeds (below) so a failed init
        // does not lock us into a bad token on next launch.
        const reg = await registerDevice(deviceId, SERVER_URL);
        authToken = reg.token;
      }

      // Init bridge — if this throws, authToken is NOT persisted so next launch retries cleanly.
      console.log('[WACI] calling initBridge with dbPath:', dbPath);
      await WaBridge.initBridge(dbPath, authToken);
      await SecureStore.setItemAsync('waci_auth_token', authToken);

      const linked = await WaBridge.isLinked();

      set({
        authToken,
        trialExpiresAt,
        isLinked: linked,
        lastSyncTimestamp: lastSync ? parseInt(lastSync, 10) : 0,
        isInitialized: true,
      });
    } catch (e: unknown) {
      // Keep isInitialized:false so we don't show the Link WhatsApp screen
      // with an uninitialised bridge. The layout will show a retry screen.
      set({ initError: String(e), isInitialized: false });
    }
  },

  // ── retryInit ──────────────────────────────────────────────────────────
  // Clears the init error and re-runs initialize(). Called from the retry UI.

  retryInit: async () => {
    set({ initError: null });
    return get().initialize();
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

  // ── confirmLinked ──────────────────────────────────────────────────────
  // Called after the user confirms the pairing code was entered in WhatsApp.

  confirmLinked: async () => {
    try {
      const linked = await WaBridge.isLinked();
      if (linked) {
        const { authToken } = get();
        if (authToken) {
          const { trial_expires_at } = await activateTrial(authToken, SERVER_URL);
          await AsyncStorage.setItem('waci_trial_expires_at', trial_expires_at);
          set({ isLinked: true, trialExpiresAt: trial_expires_at });
        }
      }
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
      // Prune the deleted filter from both the filters list and the matches cache.
      const { matches, matchesLoading } = get();
      const nextMatches = { ...matches };
      delete nextMatches[id];
      const nextMatchesLoading = { ...matchesLoading };
      delete nextMatchesLoading[id];
      set({
        filters: get().filters.filter((f) => f.id !== id),
        matches: nextMatches,
        matchesLoading: nextMatchesLoading,
      });
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

  // ── refreshToken ───────────────────────────────────────────────────────
  // Called when a 401 UNAUTHORIZED is received — re-issues JWT using
  // device_id as the long-lived credential (stored in SecureStore).

  refreshToken: async () => {
    try {
      const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (!deviceId) throw new Error('Device ID missing — reinstall required');
      const { token } = await reissueToken(deviceId, SERVER_URL);
      await SecureStore.setItemAsync('waci_auth_token', token);
      set({ authToken: token });
    } catch (e: unknown) {
      set({ error: String(e) });
    }
  },

  clearError: () => set({ error: null }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the absolute path for the SQLite DB file.
 *
 * Rules:
 * - Cached paths that don't start with '/' are stale (e.g. bare 'waci.db'
 *   from before this fix) — discard them and recompute.
 * - FileSystem.documentDirectory returns a file:// URI; strip the scheme
 *   because the Go bridge prepends "file:" itself.
 * - Explicitly create the directory so SQLite never sees ENOENT on the
 *   parent dir on a fresh install.
 */
async function resolveDbPath(): Promise<string> {
  const cached = await AsyncStorage.getItem(DB_PATH_KEY);
  if (cached && cached.startsWith('/')) {
    console.log('[WACI] using cached dbPath:', cached);
    return cached;
  }

  const docUri = FileSystem.documentDirectory;
  console.log('[WACI] FileSystem.documentDirectory:', docUri);
  if (!docUri) {
    throw new Error('FileSystem.documentDirectory is not available');
  }

  // Ensure the directory exists (no-op if already present)
  await FileSystem.makeDirectoryAsync(docUri, { intermediates: true }).catch(() => {});

  // Strip "file://" so Go bridge doesn't produce "file:file://..."
  const rawDir = docUri.replace(/^file:\/\//, '');
  const dbPath = `${rawDir}waci.db`;
  console.log('[WACI] resolved dbPath:', dbPath);

  await AsyncStorage.setItem(DB_PATH_KEY, dbPath);
  return dbPath;
}
