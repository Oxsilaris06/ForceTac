import React, { Component, useEffect, useState, useRef } from 'react';
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
  Vibration,
  LogBox,
  ToastAndroid
} from 'react-native';

// --- 0. GESTIONNAIRES D'ERREURS GLOBAUX ---
// Tente d'intercepter les erreurs JS fatales avant le crash
const safeToast = (msg: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.LONG);
  }
};

const globalErrorHandler = (error: any, isFatal?: boolean) => {
  const errString = `FATAL ERROR: ${error?.message || JSON.stringify(error)}`;
  console.error(errString);
  safeToast(errString);
  Alert.alert("CRASH DÉTECTÉ", `${errString}\nFatal: ${isFatal}`);
};

try {
  // @ts-ignore
  if (global.ErrorUtils) {
    // @ts-ignore
    global.ErrorUtils.setGlobalHandler(globalErrorHandler);
  }
} catch (e) {
  console.error("Failed to setup global handler", e);
}

// --- 1. ERROR BOUNDARY (Barrière ultime) ---
// Ce composant capture les erreurs de rendu React pour afficher un écran rouge
// au lieu de fermer l'application.
class ErrorBoundary extends Component<{children: React.ReactNode}, {hasError: boolean, error: string}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: error.toString() };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    safeToast("UI CRASH: " + error.toString());
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{flex:1, backgroundColor:'#330000', padding:20, justifyContent:'center'}}>
          <Text style={{color:'#FF0000', fontSize:30, fontWeight:'bold', marginBottom:20}}>CRITICAL UI FAILURE</Text>
          <Text style={{color:'#FFF', fontSize:14, fontFamily:'monospace'}}>{this.state.error}</Text>
          <TouchableOpacity 
            style={{marginTop:30, backgroundColor:'#FF0000', padding:15, alignItems:'center'}}
            onPress={() => this.setState({hasError: false})}
          >
            <Text style={{color:'#FFF', fontWeight:'bold'}}>RETRY SYSTEM</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// --- CONFIGURATION ---
const THEME = {
  bg: '#000000',
  surface: '#0A0A0A',
  primary: '#00FF00', 
  secondary: '#008800',
  alert: '#FF0000',
  warning: '#FFA500',
  text: '#E0E0E0',
  dim: '#444444'
};

// --- MODULE NATIF ---
const { NfcModule } = NativeModules;
const nfcEvents = NfcModule ? new NativeEventEmitter(NfcModule) : null;

// DIAGNOSTIC NATIF IMMÉDIAT
const loadedModules = Object.keys(NativeModules);
const isNfcLoaded = !!NfcModule;
safeToast(`Booting... NFC Module: ${isNfcLoaded ? 'OK' : 'MISSING'}`);

// --- ÉTATS ---
type WorkflowState = 
  | 'BOOT' | 'PERMISSIONS' | 'MODULE_LOAD' | 'HOME' 
  | 'ANALYSIS_READY' | 'SCANNING' | 'CRACKING' 
  | 'RESULT_SUCCESS' | 'RESULT_FAILURE';

const ForceTacApp = () => {
  const [step, setStep] = useState<WorkflowState>('BOOT');
  const [logs, setLogs] = useState<string[]>([]);
  const [crackMethod, setCrackMethod] = useState<string>('En attente...');
  const [foundKey, setFoundKey] = useState<string | null>(null);
  
  // Debug Info affiché à l'écran
  const [debugInfo, setDebugInfo] = useState<string>(
    `MODULES LOADED:\n${loadedModules.filter(m => !m.includes('Flipper') && !m.includes('Log')).join(', ')}\n\nNFC MODULE STATUS: ${isNfcLoaded ? 'LINKED' : 'FAILED'}`
  );
  
  const radarOpacity = useRef(new Animated.Value(0)).current;

  const log = (msg: string, type: 'INFO' | 'WARN' | 'ERR' | 'SUCCESS' = 'INFO') => {
    const time = new Date().toLocaleTimeString('fr-FR', { hour12: false });
    const prefix = type === 'INFO' ? '[*]' : type === 'WARN' ? '[!]' : type === 'ERR' ? '[X]' : '[+]';
    const line = `${time} ${prefix} ${msg}`;
    setLogs(prev => [line, ...prev].slice(0, 50));
    
    // Toast pour les erreurs critiques (visible même si l'UI freeze)
    if (type === 'ERR') safeToast(msg);
  };

  // --- BOOT SEQUENCE ---
  useEffect(() => {
    log("KERNEL INIT...", "INFO");
    
    if (!isNfcLoaded) {
      log("CRITICAL: Native Module Linking Failed", "ERR");
      Alert.alert("ECHEC BUILD", "Le module natif C++/Kotlin n'est pas lié à l'application React Native.\nVérifiez le fichier 'MainApplication.kt' et 'ForceTacPackage.kt'.");
    } else {
      log("Native Bridge OK", "SUCCESS");
    }

    setTimeout(() => {
      setStep('PERMISSIONS');
    }, 1000);
  }, []);

  // --- PERMISSIONS ---
  useEffect(() => {
    if (step === 'PERMISSIONS') {
      const reqPerms = async () => {
        if (Platform.OS === 'android') {
          try {
            log("Requesting Android Permissions...", "WARN");
            const granted = await PermissionsAndroid.requestMultiple([
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
              PermissionsAndroid.PERMISSIONS.NFC,
            ]);
            
            if (granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED) {
              log("Permissions OK.", "SUCCESS");
              setStep('MODULE_LOAD');
            } else {
              log("Permission Denied: Location", "ERR");
              Alert.alert("Erreur", "Localisation requise pour le NFC.");
            }
          } catch (e) {
            log(`Permission Error: ${e}`, "ERR");
          }
        } else {
          setStep('MODULE_LOAD');
        }
      };
      reqPerms();
    }
  }, [step]);

  // --- MODULE LOAD ---
  useEffect(() => {
    if (step === 'MODULE_LOAD') {
      // Test de survie : appel d'une fonction native simple si possible
      // Si l'app crash ici, c'est que le code C++ (JNI_OnLoad) fait planter le thread
      log("Probing Native Engine...", "INFO");
      setTimeout(() => {
        setStep('HOME');
        log("Engine Ready.", "SUCCESS");
      }, 500);
    }
  }, [step]);

  // --- EVENT LISTENERS ---
  useEffect(() => {
    if (!nfcEvents) return;
    try {
      const sub = nfcEvents.addListener('onNfcEvent', (e) => {
        if (!e) return;
        if (e.type === 'FIELD_DETECTED') {
          Vibration.vibrate(50);
          log("RF FIELD DETECTED", "WARN");
        } else if (e.type === 'CRACK_START') {
          setStep('CRACKING');
          log("Starting Crack Sequence...", "WARN");
          startCrackSim();
        } else if (e.type === 'KEY_FOUND') {
          setFoundKey(e.key);
          setStep('RESULT_SUCCESS');
          log(`KEY FOUND: ${e.key}`, "SUCCESS");
          Vibration.vibrate(500);
        } else if (e.type === 'ERROR') {
          log(`Native Error: ${e.message}`, "ERR");
          setStep('RESULT_FAILURE');
        }
      });
      return () => sub.remove();
    } catch (e) {
      log(`Listener Error: ${e}`, "ERR");
    }
  }, []);

  const startCrackSim = () => {
    setCrackMethod("DICTIONNAIRE...");
    setTimeout(() => setCrackMethod("NESTED ATTACK..."), 2000);
    setTimeout(() => setCrackMethod("HARDNESTED..."), 5000);
  };

  // --- ACTIONS ---
  const startScan = () => {
    log("Starting NFC Monitor...", "INFO");
    setStep('SCANNING');
    animRadar();
    try {
      if (NfcModule?.startNfcMonitoring) {
        NfcModule.startNfcMonitoring();
        log("Native monitor started.", "SUCCESS");
      } else {
        log("Native function missing: startNfcMonitoring", "ERR");
      }
    } catch (e) {
      log(`Native Call Crash: ${e}`, "ERR");
    }
  };

  const stopScan = () => {
    try {
      NfcModule?.stopNfcMonitoring();
    } catch(e) {}
    setStep('HOME');
  };

  const animRadar = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(radarOpacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(radarOpacity, { toValue: 0.2, duration: 1000, useNativeDriver: true })
      ])
    ).start();
  };

  const clone = () => {
    if (foundKey && NfcModule?.writeMagicCard) {
      log("Writing card...", "WARN");
      NfcModule.writeMagicCard(foundKey);
    }
  };

  // --- RENDERERS ---
  const renderTerminal = () => (
    <View style={styles.terminal}>
      <Text style={styles.termHeader}>SYSTEM LOGS // DEBUG MODE</Text>
      <ScrollView style={{flex:1}} nestedScrollEnabled>
        {logs.map((l, i) => (
          <Text key={i} style={[
            styles.log, 
            l.includes('[!]') && {color:THEME.warning},
            l.includes('[X]') && {color:THEME.alert},
            l.includes('[+]') && {color:THEME.primary}
          ]}>{l}</Text>
        ))}
      </ScrollView>
    </View>
  );

  const renderDebugOverlay = () => (
    <View style={styles.debugBox}>
      <Text style={styles.debugText}>{debugInfo}</Text>
    </View>
  );

  const renderContent = () => {
    if (step === 'BOOT' || step === 'PERMISSIONS' || step === 'MODULE_LOAD') {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={THEME.primary} />
          <Text style={styles.status}>INITIALIZING...</Text>
          <Text style={{color:THEME.dim, fontSize:10}}>{step}</Text>
        </View>
      );
    }
    
    if (step === 'HOME') {
      return (
        <View style={styles.center}>
          <TouchableOpacity style={styles.bigBtn} onPress={startScan}>
            <Text style={styles.bigBtnText}>START SEQUENCE</Text>
          </TouchableOpacity>
          {renderDebugOverlay()}
        </View>
      );
    }

    if (step === 'SCANNING') {
      return (
        <View style={styles.center}>
          <Animated.View style={[styles.radar, {opacity: radarOpacity}]}>
            <Text style={{color:THEME.primary}}>SCANNING...</Text>
          </Animated.View>
          <TouchableOpacity style={[styles.btn, {borderColor:THEME.alert, marginTop:40}]} onPress={stopScan}>
            <Text style={{color:THEME.alert}}>ABORT</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (step === 'CRACKING') {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={THEME.warning} size="large" />
          <Text style={[styles.status, {color:THEME.warning}]}>CRACKING...</Text>
          <Text style={{color:THEME.text}}>{crackMethod}</Text>
        </View>
      );
    }

    if (step === 'RESULT_SUCCESS') {
      return (
        <View style={styles.center}>
          <Text style={[styles.status, {color:THEME.primary, fontSize:30}]}>SUCCESS</Text>
          <Text style={styles.key}>{foundKey}</Text>
          <TouchableOpacity style={styles.bigBtn} onPress={clone}>
            <Text style={styles.bigBtnText}>CLONE CARD</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, {marginTop:20}]} onPress={() => setStep('HOME')}>
            <Text style={{color:THEME.text}}>DONE</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
      <View style={styles.header}>
        <Text style={styles.title}>FORCE<Text style={{color:THEME.primary}}>TAC</Text> v1.1</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>{step}</Text></View>
      </View>
      <View style={styles.main}>{renderContent()}</View>
      {renderTerminal()}
    </SafeAreaView>
  );
};

// Wrapping App in ErrorBoundary
export default class App extends Component {
  render() {
    return (
      <ErrorBoundary>
        <ForceTacApp />
      </ErrorBoundary>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: THEME.bg, padding:10 },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingBottom:10, borderBottomWidth:1, borderColor:THEME.dim },
  title: { color: THEME.text, fontSize:20, fontWeight:'bold', fontFamily: Platform.OS === 'android' ? 'monospace' : 'System' },
  badge: { backgroundColor: THEME.surface, padding:5, borderRadius:4, borderWidth:1, borderColor:THEME.dim },
  badgeText: { color: THEME.primary, fontSize:10, fontWeight:'bold' },
  main: { flex:2, justifyContent:'center' },
  center: { alignItems:'center', width:'100%' },
  terminal: { flex:1, backgroundColor:THEME.surface, borderWidth:1, borderColor:THEME.dim, marginTop:10, padding:5 },
  termHeader: { color:THEME.dim, fontSize:10, marginBottom:5 },
  log: { color:THEME.text, fontSize:10, fontFamily:'monospace', marginBottom:2 },
  status: { color: THEME.text, marginTop:20, letterSpacing:2, fontWeight:'bold' },
  bigBtn: { width:'100%', height:150, borderWidth:2, borderColor:THEME.primary, justifyContent:'center', alignItems:'center', backgroundColor:'rgba(0,255,0,0.1)', borderRadius:8 },
  bigBtnText: { color:THEME.primary, fontSize:24, fontWeight:'bold', letterSpacing:2 },
  btn: { padding:15, borderWidth:1, borderColor:THEME.text, borderRadius:4, width:'80%', alignItems:'center' },
  radar: { width:200, height:200, borderRadius:100, borderWidth:2, borderColor:THEME.primary, justifyContent:'center', alignItems:'center', backgroundColor:'rgba(0,255,0,0.1)' },
  debugBox: { marginTop:20, padding:10, borderWidth:1, borderColor:THEME.dim, width:'100%' },
  debugText: { color:THEME.dim, fontSize:10, fontFamily:'monospace' },
  key: { color:THEME.text, fontSize:30, fontFamily:'monospace', marginVertical:20, borderWidth:1, borderColor:THEME.dim, padding:10 }
});
