package com.anonymous.mobileclient

import com.facebook.react.bridge.*
import wabridge.Bridge
import wabridge.MessageCallback
import wabridge.Wabridge

/**
 * WabridgeModule — React Native NativeModule that wraps the Go wabridge .aar.
 *
 * The wabridge.aar is built from packages/wabridge/ via:
 *   ./scripts/build-wabridge-android.sh
 * and placed at:
 *   apps/mobile-client/android/app/libs/wabridge.aar
 *
 * Until the .aar is present, any call will throw a descriptive error.
 */
class WabridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "Wabridge"

    private var bridge: Bridge? = null

    // ── initBridge ──────────────────────────────────────────────────────────

    @ReactMethod
    fun initBridge(dbPath: String, authToken: String, promise: Promise) {
        runOnBackground(promise) {
            val err = StringBuilder()
            val b = Wabridge.newBridge(dbPath, authToken, err)
                ?: throw RuntimeException("Failed to init bridge: $err")
            bridge = b
            null // resolve with null (void)
        }
    }

    // ── startPairing ────────────────────────────────────────────────────────

    @ReactMethod
    fun startPairing(phoneNumber: String, promise: Promise) {
        runOnBackground(promise) {
            val b = requireBridge()
            val err = StringBuilder()
            val code = b.startPairing(phoneNumber, err)
            if (code.isNullOrEmpty()) throw RuntimeException("Pairing failed: $err")
            code
        }
    }

    // ── isLinked ─────────────────────────────────────────────────────────────

    @ReactMethod
    fun isLinked(promise: Promise) {
        runOnBackground(promise) {
            requireBridge().isLinked
        }
    }

    // ── syncAndTriage ────────────────────────────────────────────────────────

    @ReactMethod
    fun syncAndTriage(lastSyncTimestamp: Double, promise: Promise) {
        runOnBackground(promise) {
            val b = requireBridge()
            val callback = object : MessageCallback {
                override fun onMessage(jsonPayload: String) {
                    // Emit to JS via event emitter (optional; JS polls getMatches)
                }
            }
            val result = b.syncAndTriage(lastSyncTimestamp.toLong(), callback)
            val map = Arguments.createMap()
            map.putInt("messagesSynced", result.messagesSynced)
            map.putString("error", result.error ?: "")
            map
        }
    }

    // ── getFilters ───────────────────────────────────────────────────────────

    @ReactMethod
    fun getFilters(promise: Promise) {
        runOnBackground(promise) {
            val err = StringBuilder()
            val json = requireBridge().getFilters(err)
            if (json.isNullOrEmpty()) throw RuntimeException("getFilters failed: $err")
            json
        }
    }

    // ── saveFilter ───────────────────────────────────────────────────────────

    @ReactMethod
    fun saveFilter(filterJson: String, promise: Promise) {
        runOnBackground(promise) {
            val err = StringBuilder()
            val json = requireBridge().saveFilter(filterJson, err)
            if (json.isNullOrEmpty()) throw RuntimeException("saveFilter failed: $err")
            json
        }
    }

    // ── deleteFilter ─────────────────────────────────────────────────────────

    @ReactMethod
    fun deleteFilter(id: String, promise: Promise) {
        runOnBackground(promise) {
            val err = StringBuilder()
            requireBridge().deleteFilter(id, err)
            null
        }
    }

    // ── getMatches ───────────────────────────────────────────────────────────

    @ReactMethod
    fun getMatches(filterId: String, limit: Int, promise: Promise) {
        runOnBackground(promise) {
            val err = StringBuilder()
            val json = requireBridge().getMatches(filterId, limit.toLong(), err)
            if (json.isNullOrEmpty()) throw RuntimeException("getMatches failed: $err")
            json
        }
    }

    // ── unlink ───────────────────────────────────────────────────────────────

    @ReactMethod
    fun unlink(promise: Promise) {
        runOnBackground(promise) {
            val err = StringBuilder()
            requireBridge().unlink(err)
            bridge = null
            null
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private fun requireBridge(): Bridge =
        bridge ?: throw RuntimeException(
            "Wabridge not initialized. Call initBridge(dbPath, authToken) first."
        )

    /**
     * Runs [block] on a background thread and resolves/rejects [promise].
     * Returns the resolved value (WritableMap, String, Boolean, null for void).
     */
    private fun runOnBackground(promise: Promise, block: () -> Any?) {
        Thread {
            try {
                val result = block()
                when (result) {
                    null -> promise.resolve(null)
                    is WritableMap -> promise.resolve(result)
                    is String -> promise.resolve(result)
                    is Boolean -> promise.resolve(result)
                    is Int -> promise.resolve(result)
                    else -> promise.resolve(result.toString())
                }
            } catch (e: Exception) {
                promise.reject("WABRIDGE_ERROR", e.message ?: "Unknown error", e)
            }
        }.start()
    }
}
