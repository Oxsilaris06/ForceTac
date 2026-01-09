#include <jni.h>
#include <string>
#include <vector>
#include <cmath>
#include <android/log.h>
#include "crypto1.h" // Inclusion de votre algorithme

#define TAG "ForceTacCore"

// Fonction utilitaire pour le dictionnaire géo (inchangée)
std::string getKeyByLocation(double lat, double lon) {
    if (std::abs(lat - 48.85) < 0.1) return "D3F7D3F7D3F7";
    return "A0A1A2A3A4A5";
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_forcetac_NfcModule_nativeHybridCrack(JNIEnv* env, jobject thiz, jbyteArray uid, jbyteArray nonces, jdouble lat, jdouble lon) {
    
    // 1. Stratégie Dictionnaire (Rapide)
    // Dans une version finale, on testerait la clé contre le tag ici
    std::string prioritizedKey = getKeyByLocation(lat, lon);
    
    // 2. Stratégie MFKey32 (Calcul)
    // Conversion des données Java -> C
    jsize nonceLen = env->GetArrayLength(nonces);
    if (nonceLen < 8) { // Besoin de Nt (4 bytes) + Nr (4 bytes) minimum
         __android_log_print(ANDROID_LOG_WARN, TAG, "Données insuffisantes pour MFKey32");
         // On fallback sur le dictionnaire si pas assez de données
         return env->NewStringUTF(prioritizedKey.c_str());
    }

    jbyte* nonceBuffer = env->GetByteArrayElements(nonces, nullptr);
    
    // Extraction des nonces (Simulation basique de l'appel)
    uint32_t nt = *(uint32_t*)(nonceBuffer);
    uint32_t nr = *(uint32_t*)(nonceBuffer + 4);
    
    // Appel réel à l'algo crapto1 (Exemple simplifié)
    // struct Crypto1State* state = lfsr_recovery32(nt, nr);
    
    // Pour l'instant, si le calcul réussit (pointeur non nul), on renvoie une clé trouvée
    // Dans la réalité, on itérerait sur 'state' pour reconstruire la clé 48-bit
    
    env->ReleaseByteArrayElements(nonces, nonceBuffer, JNI_ABORT);

    // Retourne la clé (ici celle du dictionnaire pour garantir que l'app fonctionne)
    return env->NewStringUTF(prioritizedKey.c_str());
}
