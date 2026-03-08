package com.anonymous.mobileclient

import com.facebook.react.bridge.*
import wabridge.Bridge
import wabridge.MessageCallback
import wabridge.Wabridge

/**
 * WabridgeModule — React Native NativeModule that wraps the Go wabridge .aar.
 *
 * The wabridge.aar is compiled via gomobile bind from packages/wabridge/.
 * Gomobile-generated Java API throws exceptions instead of using error output params.
 */
class WabridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "Wabridge"

    private var bridge: Bridge? = null

    // ── initBridge ──────────────────────────────────────────────────────────

    @ReactMethod
    fun initBridge(dbPath: String, authToken: String, promise: Promise) {
        runOnBackground(promise) {
            bridge = Bridge(dbPath, authToken)
            null // resolve with null (void)
        }
    }

    // ── startPairing ────────────────────────────────────────────────────────

    @ReactMethod
    fun startPairing(phoneNumber: String, promise: Promise) {
        runOnBackground(promise) {
            val code = requireBridge().startPairing(phoneNumber)
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
                    // Emit to JS via event emitter (optional; JS can poll getMatches)
                }
            }
            val result = b.syncAndTriage(lastSyncTimestamp.toLong(), callback)
            val map = Arguments.createMap()
            map.putInt("messagesSynced", result.messagesSynced.toInt())
            map.putString("error", result.error ?: "")
            map
        }
    }

    // ── getFilters ───────────────────────────────────────────────────────────

    @ReactMethod
    fun getFilters(promise: Promise) {
        runOnBackground(promise) {
            requireBridge().getFilters()
        }
    }

    // ── saveFilter ───────────────────────────────────────────────────────────

    @ReactMethod
    fun saveFilter(filterJson: String, promise: Promise) {
        runOnBackground(promise) {
            requireBridge().saveFilter(filterJson)
        }
    }

    // ── deleteFilter ─────────────────────────────────────────────────────────

    @ReactMethod
    fun deleteFilter(id: String, promise: Promise) {
        runOnBackground(promise) {
            requireBridge().deleteFilter(id)
            null
        }
    }

    // ── getMatches ───────────────────────────────────────────────────────────

    @ReactMethod
    fun getMatches(filterId: String, limit: Int, promise: Promise) {
        runOnBackground(promise) {
            requireBridge().getMatches(filterId, limit.toLong())
        }
    }

    // ── unlink ───────────────────────────────────────────────────────────────

    @ReactMethod
    fun unlink(promise: Promise) {
        runOnBackground(promise) {
            requireBridge().unlink()
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
     * Gomobile-generated methods throw exceptions on error.
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
                    is Double -> promise.resolve(result)
                    else -> promise.resolve(result.toString())
                }
            } catch (e: Exception) {
                promise.reject("WABRIDGE_ERROR", e.message ?: "Unknown error", e)
            }
        }.start()
    }
}
