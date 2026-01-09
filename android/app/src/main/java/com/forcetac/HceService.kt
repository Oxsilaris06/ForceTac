package com.forcetac

import android.nfc.cardemulation.HostApduService
import android.os.Bundle

class HceService : HostApduService() {

    companion object {
        var isDowngradeActive = false
        fun enableDowngradeMode(enable: Boolean) { isDowngradeActive = enable }
    }

    override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray {
        if (!isDowngradeActive) return byteArrayOf(0x00)

        // Réponse magique : SAK 0x08 (Mifare Classic 1K)
        // Ceci trompe la centrale qui pense parler à un vieux badge
        return byteArrayOf(0x08.toByte()) 
    }

    override fun onDeactivated(reason: Int) {
        isDowngradeActive = false
    }
}
