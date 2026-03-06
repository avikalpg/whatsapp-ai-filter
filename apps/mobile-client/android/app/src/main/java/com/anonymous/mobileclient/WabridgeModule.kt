package com.anonymous.mobileclient

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class WabridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "WabridgeModule"

    private fun sendEvent(eventName: String, params: Any?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun initialize(dbPath: String, claudeApiKey: String, promise: Promise) {
        // Stub: wabridge .aar not yet compiled
        promise.reject("NOT_IMPLEMENTED", "wabridge native library not yet compiled")
    }

    @ReactMethod
    fun isLinked(promise: Promise) {
        promise.resolve(false)
    }

    @ReactMethod
    fun startPairing(phoneNumber: String, promise: Promise) {
        promise.reject("NOT_IMPLEMENTED", "wabridge native library not yet compiled")
    }

    @ReactMethod
    fun syncAndTriage(lastSyncTimestamp: Double, promise: Promise) {
        promise.reject("NOT_IMPLEMENTED", "wabridge native library not yet compiled")
    }

    @ReactMethod
    fun getFilters(promise: Promise) {
        promise.resolve("[]")
    }

    @ReactMethod
    fun saveFilter(filterJson: String, promise: Promise) {
        promise.reject("NOT_IMPLEMENTED", "wabridge native library not yet compiled")
    }

    @ReactMethod
    fun deleteFilter(id: String, promise: Promise) {
        promise.reject("NOT_IMPLEMENTED", "wabridge native library not yet compiled")
    }

    @ReactMethod
    fun getMatches(filterId: String, limit: Int, promise: Promise) {
        promise.resolve("[]")
    }

    @ReactMethod
    fun unlink(promise: Promise) {
        promise.resolve(null)
    }
}
