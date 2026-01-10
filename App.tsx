import React, { useEffect, useState, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  NativeModules,
  NativeEventEmitter,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Animated,
  Alert,
  Vibration
} from 'react-native';

// --- CONFIGURATION DU THÈME FORCETAC ---
const THEME = {
  bg: '#000000',
  surface: '#0A0A0A',
  primary: '#00FF00', // Vert terminal classique
  secondary: '#008800',
  alert: '#FF0000',
  warning: '#FFA500',
  text: '#E0E0E0',
  dim: '#444444'
};

// --- MODULE NATIF ---
// On récupère le module exposé par NfcModule.kt
const { NfcModule } = NativeModules;
const nfcEvents = NfcModule ? new NativeEventEmitter(NfcModule) : null;

// --- ÉTATS DU WORKFLOW ---
type WorkflowState = 
  | 'BOOT'           // 1. Initialisation
  | 'PERMISSIONS'    // 2. Vérification des droits
  | 'MODULE_LOAD'    // 3. Chargement du moteur C++ (JNI)
  | 'HOME'           // 4. Page d'accueil (Standby)
  | 'ANALYSIS_READY' // 5. Devant la centrale (Prêt)
  | 'SCANNING'       // 6. Recherche de signal (Radar)
  | 'CRACKING'       // 7. Attaque en cours (Dict -> Nested)
  | 'RESULT_SUCCESS' // 8. Clé trouvée
  | 'RESULT_FAILURE';// 9. Échec

const App = () => {
  // --- STATE ---
  const [step, setStep] = useState<WorkflowState>('BOOT');
  const [logs, setLogs] = useState<string[]>([]);
  const [crackMethod, setCrackMethod] = useState<string>('En attente...');
  const [foundKey, setFoundKey] = useState<string | null>(null);
  
  // Animation du radar
  const radarOpacity = useRef(new Animated.Value(0)).current;

  // --- LOGGING SYSTEM ---
  const log = (msg: string, type: 'INFO' | 'WARN' | 'ERR' | 'SUCCESS' = 'INFO') => {
    const time = new Date().toLocaleTimeString('fr-FR', { hour12: false });
    const prefix = type === 'INFO' ? '[*]' : type === 'WARN' ? '[!]' : type === 'ERR' ? '[X]' : '[+]';
    setLogs(prev => [`${time} ${prefix} ${msg}`, ...prev].slice(0, 50));
  };

  // --- 1. BOOT SEQUENCE ---
  useEffect(() => {
    log("INITIALISATION KERNEL FORCETAC...", "INFO");
    setTimeout(() => {
      setStep('PERMISSIONS');
    }, 1500);
  }, []);

  // --- 2. PERMISSIONS ---
  useEffect(() => {
    if (step === 'PERMISSIONS') {
      requestPermissions();
    }
  }, [step]);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        log("DEMANDE ACCÈS SYSTÈME...", "WARN");
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.NFC,
          PermissionsAndroid.PERMISSIONS.VIBRATE
        ]);

        if (granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED) {
          log("PERMISSIONS ACCORDÉES.", "SUCCESS");
          setStep('MODULE_LOAD');
        } else {
          log("ACCÈS REFUSÉ. SYSTÈME CRITIQUE.", "ERR");
          Alert.alert("Erreur", "La localisation est requise pour le scan NFC (Limitation Android).");
        }
      } catch (err) {
        log(`ERREUR PERMISSION: ${err}`, "ERR");
      }
    } else {
      setStep('MODULE_LOAD');
    }
  };

  // --- 3. CHARGEMENT MODULE ---
  useEffect(() => {
    if (step === 'MODULE_LOAD') {
      checkNativeModule();
    }
  }, [step]);

  const checkNativeModule = () => {
    log("CHARGEMENT MOTEUR CRYPTO C++...", "INFO");
    if (NfcModule) {
      // On pourrait appeler une méthode 'ping' native ici si elle existait
      setTimeout(() => {
        log("MOTEUR NATIF CHARGÉ (JNI LINKED).", "SUCCESS");
        setStep('HOME');
      }, 1000);
    } else {
      log("ERREUR: MODULE NATIF ABSENT.", "ERR");
      Alert.alert("Fatal", "Le module natif ForceTac n'est pas chargé. Recompilez l'APK.");
    }
  };

  // --- ÉCOUTEURS D'ÉVÉNEMENTS (Cœur de la logique) ---
  useEffect(() => {
    if (!nfcEvents) return;

    const sub = nfcEvents.addListener('onNfcEvent', (event) => {
      console.log("Native Event:", event);
      
      switch (event.type) {
        case 'FIELD_DETECTED':
          Vibration.vibrate(50);
          log("CHAMP RF DÉTECTÉ.", "WARN");
          break;

        case 'CRACK_START':
          Vibration.vibrate(100);
          setStep('CRACKING');
          log("CIBLE VERROUILLÉE. DÉBUT DE L'ATTAQUE...", "WARN");
          startCrackSimulation(); // Simulation visuelle des étapes
          break;

        case 'KEY_FOUND':
          Vibration.vibrate([0, 100, 100, 100]); // 2 vibrations
          setFoundKey(event.key);
          log(`CLÉ TROUVÉE: ${event.key}`, "SUCCESS");
          setStep('RESULT_SUCCESS');
          break;

        case 'ERROR':
          Vibration.vibrate(500);
          log(`ERREUR: ${event.message}`, "ERR");
          setStep('RESULT_FAILURE');
          break;
          
        case 'SUCCESS':
           log(event.message, "SUCCESS");
           break;
      }
    });

    return () => sub.remove();
  }, []);

  // Simulation visuelle du workflow de crack (car le natif est bloquant/rapide)
  const startCrackSimulation = () => {
    setCrackMethod("ATTAQUE DICTIONNAIRE (Clés par défaut)");
    
    setTimeout(() => {
      // Si on est toujours en train de cracker après 2s, on passe à l'étape suivante visuellement
      setCrackMethod((prev) => {
        if (prev.includes("DICTIONNAIRE")) {
          log("DICTIONNAIRE ÉCHOUÉ. PASSAGE AU NESTED.", "WARN");
          return "ATTAQUE NESTED (Collecte de Nonces)";
        }
        return prev;
      });
    }, 3000);
    
    setTimeout(() => {
       setCrackMethod((prev) => {
        if (prev.includes("NESTED")) {
          log("ENTROPIE FAIBLE DÉTECTÉE. HARDNESTED...", "WARN");
          return "ATTAQUE HARDNESTED (Force Brute CPU)";
        }
        return prev;
      });
    }, 6000);
  };

  // --- ACTIONS UTILISATEUR ---

  const handleStartAnalysis = () => {
    log("INITIALISATION SCANNER...", "INFO");
    setStep('SCANNING');
    startRadar();
    
    // Appel au module natif pour démarrer le ReaderMode
    // On passe une loc factice car le module natif l'attend dans la signature
    NfcModule.updateLocation(0.0, 0.0);
    NfcModule.startNfcMonitoring();
  };

  const handleStopAnalysis = () => {
    log("ARRÊT SCANNER.", "INFO");
    NfcModule.stopNfcMonitoring();
    setStep('HOME');
    radarOpacity.setValue(0);
  };

  const handleClone = () => {
    if (!foundKey) return;
    log("ÉCRITURE SUR CARTE MAGIQUE...", "WARN");
    NfcModule.writeMagicCard(foundKey);
  };

  const startRadar = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(radarOpacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(radarOpacity, { toValue: 0.2, duration: 1000, useNativeDriver: true })
      ])
    ).start();
  };

  // --- RENDUS ---

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.title}>FORCE<Text style={{color: THEME.primary}}>TAC</Text></Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{step}</Text>
      </View>
    </View>
  );

  const renderTerminal = () => (
    <View style={styles.terminal}>
      <Text style={styles.terminalTitle}>// JOURNAL SYSTÈME</Text>
      <ScrollView style={styles.logs} nestedScrollEnabled>
        {logs.map((l, i) => (
          <Text key={i} style={[
            styles.logText, 
            l.includes('[!]') && {color: THEME.warning},
            l.includes('[X]') && {color: THEME.alert},
            l.includes('[+]') && {color: THEME.primary},
          ]}>{l}</Text>
        ))}
      </ScrollView>
    </View>
  );

  const renderContent = () => {
    switch (step) {
      case 'BOOT':
      case 'PERMISSIONS':
      case 'MODULE_LOAD':
        return (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={THEME.primary} />
            <Text style={styles.statusText}>CHARGEMENT DES SYSTÈMES...</Text>
          </View>
        );

      case 'HOME':
        return (
          <View style={styles.center}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>SYSTEM READY</Text>
            </View>
            <TouchableOpacity style={styles.mainBtn} onPress={() => setStep('ANALYSIS_READY')}>
              <Text style={styles.btnText}>ENTRER EN ZONE</Text>
            </TouchableOpacity>
          </View>
        );

      case 'ANALYSIS_READY':
        return (
          <View style={styles.center}>
            <Text style={styles.instruction}>APPROCHEZ DE LA CENTRALE</Text>
            <Text style={styles.instructionSub}>Positionnez le terminal à moins de 5cm</Text>
            <TouchableOpacity style={[styles.mainBtn, {borderColor: THEME.alert}]} onPress={handleStartAnalysis}>
              <Text style={[styles.btnText, {color: THEME.alert}]}>LANCER L'ANALYSE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep('HOME')}>
              <Text style={styles.backText}>RETOUR</Text>
            </TouchableOpacity>
          </View>
        );

      case 'SCANNING':
        return (
          <View style={styles.center}>
            <Animated.View style={[styles.radar, {opacity: radarOpacity}]}>
              <Text style={styles.radarText}>RECHERCHE DE SIGNAL...</Text>
            </Animated.View>
            <TouchableOpacity style={styles.stopBtn} onPress={handleStopAnalysis}>
              <Text style={styles.stopText}>ARRÊTER LE SCAN</Text>
            </TouchableOpacity>
          </View>
        );

      case 'CRACKING':
        return (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={THEME.warning} />
            <Text style={[styles.statusText, {color: THEME.warning, marginTop: 20}]}>ATTAQUE EN COURS</Text>
            <Text style={styles.methodText}>{crackMethod}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, {width: '60%'}]} />
            </View>
          </View>
        );

      case 'RESULT_SUCCESS':
        return (
          <View style={styles.center}>
            <Text style={styles.resultTitle}>SUCCÈS</Text>
            <Text style={styles.keyDisplay}>{foundKey}</Text>
            
            <TouchableOpacity style={styles.mainBtn} onPress={handleClone}>
              <Text style={styles.btnText}>CLONER LA CARTE</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('HOME')}>
              <Text style={styles.secondaryText}>TERMINER</Text>
            </TouchableOpacity>
          </View>
        );

      case 'RESULT_FAILURE':
        return (
          <View style={styles.center}>
            <Text style={[styles.resultTitle, {color: THEME.alert}]}>ÉCHEC</Text>
            <Text style={styles.instructionSub}>La clé n'a pas pu être extraite.</Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('HOME')}>
              <Text style={styles.secondaryText}>RETOUR</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      {renderHeader()}
      <View style={styles.content}>
        {renderContent()}
      </View>
      {renderTerminal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.dim,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: THEME.text,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  badge: {
    backgroundColor: THEME.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.dim,
  },
  badgeText: {
    color: THEME.primary,
    fontSize: 10,
    fontWeight: 'bold',
  },
  content: {
    flex: 2,
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    width: '100%',
  },
  terminal: {
    flex: 1,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.dim,
    marginTop: 10,
    borderRadius: 4,
    padding: 8,
  },
  terminalTitle: {
    color: THEME.dim,
    fontSize: 10,
    marginBottom: 5,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  logs: {
    flex: 1,
  },
  logText: {
    color: THEME.text,
    fontSize: 11,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    marginBottom: 2,
  },
  mainBtn: {
    width: '90%',
    height: 60,
    borderWidth: 2,
    borderColor: THEME.primary,
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    marginVertical: 10,
  },
  btnText: {
    color: THEME.primary,
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  statusText: {
    color: THEME.text,
    marginTop: 20,
    letterSpacing: 1,
  },
  logoBox: {
    width: 200,
    height: 200,
    borderWidth: 4,
    borderColor: THEME.dim,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    borderStyle: 'dashed',
  },
  logoText: {
    color: THEME.dim,
    fontSize: 20,
    fontWeight: 'bold',
  },
  instruction: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  instructionSub: {
    color: THEME.dim,
    fontSize: 14,
    marginBottom: 30,
    textAlign: 'center',
  },
  backBtn: {
    marginTop: 20,
  },
  backText: {
    color: THEME.dim,
    textDecorationLine: 'underline',
  },
  radar: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: THEME.primary,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 0, 0.05)',
  },
  radarText: {
    color: THEME.primary,
    fontSize: 12,
    textAlign: 'center',
  },
  stopBtn: {
    marginTop: 40,
    padding: 15,
    borderWidth: 1,
    borderColor: THEME.alert,
    borderRadius: 4,
  },
  stopText: {
    color: THEME.alert,
    fontWeight: 'bold',
  },
  methodText: {
    color: THEME.text,
    fontSize: 14,
    marginVertical: 15,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  progressBar: {
    width: '80%',
    height: 4,
    backgroundColor: THEME.dim,
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: THEME.warning,
  },
  resultTitle: {
    fontSize: 30,
    fontWeight: 'bold',
    color: THEME.primary,
    marginBottom: 20,
  },
  keyDisplay: {
    fontSize: 32,
    color: THEME.text,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    marginBottom: 40,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.dim,
    borderRadius: 8,
  },
  secondaryBtn: {
    marginTop: 15,
    padding: 15,
  },
  secondaryText: {
    color: THEME.dim,
  }
});

export default App;
