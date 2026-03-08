/**
 * wabridge.ts
 * TypeScript NativeModule wrapper for the wabridge Go bridge.
 *
 * The native module (WabridgeModule) is registered by:
 *   Android: com.waci.WabridgePackage
 *   iOS:     WabridgeModule.swift / WabridgeModule.m
 *
 * All methods are async — they dispatch to the Go bridge on a background thread.
 */

import { NativeModules, Platform } from 'react-native';

export interface Filter {
  id: string;
  name: string;
  prompt: string;
  created_at: number;
  updated_at: number;
}

export interface FilterMatch {
  id: string;
  filter_id: string;
  message_id: string;
  sender_jid: string;
  chat_jid: string;
  chat_name: string;
  sender_name: string;
  body: string;
  received_at: number;
  relevance_reason: string;
  confidence: number;
  is_read: boolean;
  created_at: number;
}

export interface SyncResult {
  messagesSynced: number;
  error: string;
}

const LINKING_ERROR =
  `The package 'wabridge' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go';

const NativeWabridge = NativeModules.Wabridge
  ? NativeModules.Wabridge
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

/**
 * Initialize the bridge with the given SQLite DB path and Claude API key.
 * Must be called once before any other method.
 */
export async function initBridge(dbPath: string, claudeApiKey: string): Promise<void> {
  return NativeWabridge.initBridge(dbPath, claudeApiKey);
}

/**
 * Start the WhatsApp phone-number pairing flow.
 * Returns the pairing code to show the user.
 */
export async function startPairing(phoneNumber: string): Promise<string> {
  return NativeWabridge.startPairing(phoneNumber);
}

/** Returns true if a WhatsApp session is linked. */
export async function isLinked(): Promise<boolean> {
  return NativeWabridge.isLinked();
}

/**
 * Connect to WhatsApp, collect messages since lastSyncTimestamp,
 * run AI triage against all saved filters, then disconnect.
 */
export async function syncAndTriage(lastSyncTimestamp: number): Promise<SyncResult> {
  return NativeWabridge.syncAndTriage(lastSyncTimestamp);
}

/** Return all saved filters as an array. */
export async function getFilters(): Promise<Filter[]> {
  const json: string = await NativeWabridge.getFilters();
  return JSON.parse(json) as Filter[];
}

/**
 * Create or update a filter.
 * Pass an object without id to create; with id to update.
 */
export async function saveFilter(filter: Omit<Filter, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<Filter> {
  const json: string = await NativeWabridge.saveFilter(JSON.stringify(filter));
  return JSON.parse(json) as Filter;
}

/** Delete a filter (and all its matches) by id. */
export async function deleteFilter(id: string): Promise<void> {
  return NativeWabridge.deleteFilter(id);
}

/**
 * Return matches for a given filter.
 * Pass limit=0 for all matches.
 */
export async function getMatches(filterId: string, limit: number = 50): Promise<FilterMatch[]> {
  const json: string = await NativeWabridge.getMatches(filterId, limit);
  return JSON.parse(json) as FilterMatch[];
}

/** Remove the linked WhatsApp device (logout). */
export async function unlink(): Promise<void> {
  return NativeWabridge.unlink();
}
