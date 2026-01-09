package com.forcetac

import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.NfcA
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class NfcModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), NfcAdapter.ReaderCallback {

    private var isNativeLibLoaded = false
    // Stockage de la dernière position connue
    private var currentLat: Double = 0.0
    private var currentLon: Double = 0.0

    init {
        try {
            System.loadLibrary("forcetac_core")
            isNativeLibLoaded = true
            Log.d("ForceTac", "Native library loaded successfully")
        } catch (e: UnsatisfiedLinkError) {
            Log.e("ForceTac", "Failed to load native library: ${e.message}")
            isNativeLibLoaded = false
        }
    }

    override fun getName() = "NfcModule"

    external fun nativeHybridCrack(tagId: ByteArray, nonces: ByteArray, lat: Double, lon: Double): String?
    
    @ReactMethod
    fun startDowngrade() {
        try {
            HceService.enableDowngradeMode(true)
            sendEvent("DOWNGRADE_ACTIVE", null)
        } catch (e: Exception) {
            Log.e("ForceTac", "Error starting downgrade: ${e.message}")
        }
    }

    // Méthode appelée par React Native pour mettre à jour la position
    @ReactMethod
    fun updateLocation(lat: Double, lon: Double) {
        currentLat = lat
        currentLon = lon
    }

    override fun onTagDiscovered(tag: Tag) {
        sendEvent("FIELD_DETECTED", null)
        val nfcA = NfcA.get(tag)
        
        if (nfcA == null) {
             Log.e("ForceTac", "Tag is null or not NfcA compatible")
             return
        }

        try {
            nfcA.connect()
            val authCmd = byteArrayOf(0x60.toByte(), 0x00.toByte()) 
            val response = nfcA.transceive(authCmd) 
            
            sendEvent("CRACK_START", null)
            
            if (isNativeLibLoaded) {
                // Utilisation des coordonnées stockées. Si 0.0, le C++ devra gérer (pas de dictionnaire géo).
                val key = nativeHybridCrack(tag.id, response ?: byteArrayOf(), currentLat, currentLon) 
                
                if (key != null) {
                    val params = Arguments.createMap().apply { putString("key", key) }
                    sendEvent("KEY_FOUND", params)
                }
            } else {
                val params = Arguments.createMap().apply { putString("message", "Moteur C++ non chargé") }
                sendEvent("ERROR", params)
            }
        } catch (e: Exception) {
            Log.e("ForceTac", "Tag processing error: ${e.message}")
        } finally {
            try { nfcA.close() } catch (e: Exception) {}
        }
    }

    @ReactMethod
    fun writeMagicCard(key: String) {
        Log.d("ForceTac", "Writing key to Magic Card: $key")
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        if (reactContext.hasActiveCatalystInstance()) {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onNfcEvent", if (params == null) Arguments.createMap().apply { putString("type", eventName) } else params.apply { putString("type", eventName) })
        }
    }
}
