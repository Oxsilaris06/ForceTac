import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, View, Text, TouchableOpacity, ScrollView, 
  SafeAreaView, StatusBar, Animated, Platform, PermissionsAndroid 
} from 'react-native';
import ReactNativeHapticFeedback from "react-native-haptic-feedback";
import Geolocation from 'react-native-geolocation-service';
import { NativeModules, DeviceEventEmitter } from 'react-native';

const { NfcModule } = NativeModules;

const COLORS = {
  BG: '#050505',
  CARD: '#18181b',
  PRIMARY: '#2563eb',
  SUCCESS: '#22c55e',
  WARNING: '#eab308',
  DANGER: '#ef4444',
  TEXT: '#e4e4e7',
  MUTED: '#71717a'
};

const hapticOpts = { enableVibrateFallback: true, ignoreAndroidSystemSettings: true };

export default function App() {
  const [status, setStatus] = useState<'IDLE' | 'SCANNING' | 'CRACKING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [logs, setLogs] = useState<{msg: string, type: string, time: string}[]>([]);
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [recoveredKey, setRecoveredKey] = useState<string | null>(null);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
      ])
    ).start();

    requestPermissions();

    const sub = DeviceEventEmitter.addListener('onNfcEvent', (e) => {
      handleNfcEvent(e);
    });

    return () => sub.remove();
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        Geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            setLocation({ latitude, longitude });
            // Envoi de la position réelle au module natif
            if (NfcModule && NfcModule.updateLocation) {
                NfcModule.updateLocation(latitude, longitude);
                addLog(`GPS LOCKED: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'info');
            }
          },
          (error) => addLog(`GPS ERROR: ${error.message}`, 'danger'),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      } else {
        addLog("GPS REFUSÉ - Dictionnaire local désactivé", 'danger');
      }
    }
  };

  const handleNfcEvent = (e: any) => {
    switch(e.type) {
      case 'FIELD_DETECTED':
        setStatus('SCANNING');
        ReactNativeHapticFeedback.trigger("impactMedium", hapticOpts);
        addLog("CHAMP RF DÉTECTÉ - ANALYSE...", 'warning');
        break;
      case 'DOWNGRADE_ACTIVE':
        addLog("PROTOCOLE AES DÉTECTÉ -> DOWNGRADE ACTIVÉ", 'danger');
        ReactNativeHapticFeedback.trigger("notificationWarning", hapticOpts);
        break;
      case 'CRACK_START':
        setStatus('CRACKING');
        addLog("CAPTURE NONCES OK. CALCUL EN COURS...", 'info');
        ReactNativeHapticFeedback.trigger("impactHeavy", hapticOpts);
        break;
      case 'KEY_FOUND':
        setStatus('SUCCESS');
        setRecoveredKey(e.key);
        addLog(`CLÉ RÉCUPÉRÉE: ${e.key}`, 'success');
        ReactNativeHapticFeedback.trigger("notificationSuccess", hapticOpts);
        break;
      case 'ERROR':
        setStatus('ERROR');
        addLog(`ERREUR: ${e.message}`, 'danger');
        break;
    }
  };

  const addLog = (msg: string, type: 'info' | 'success' | 'warning' | 'danger') => {
    setLogs(prev => [{ msg, type, time: new Date().toLocaleTimeString() }, ...prev]);
  };

  const triggerDowngrade = () => {
    addLog("FORÇAGE MANUEL: DOWNGRADE ATTACK", 'warning');
    if (NfcModule?.startDowngrade) NfcModule.startDowngrade();
  };

  const getStatusColor = () => {
    switch(status) {
      case 'SUCCESS': return COLORS.SUCCESS;
      case 'CRACKING': return COLORS.WARNING;
      case 'SCANNING': return COLORS.PRIMARY;
      case 'ERROR': return COLORS.DANGER;
      default: return COLORS.MUTED;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.BG} />
      
      <View style={styles.header}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <Text style={styles.headerTitle}>FORCE<Text style={{color: COLORS.PRIMARY}}>TAC</Text></Text>
        </View>
        <View style={[styles.badge, {borderColor: getStatusColor()}]}>
          <Text style={[styles.badgeText, {color: getStatusColor()}]}>{status}</Text>
        </View>
      </View>

      <View style={styles.radarContainer}>
        <Animated.View style={[styles.radarCircle, { transform: [{ scale: pulseAnim }], borderColor: getStatusColor() }]}>
          <View style={[styles.radarCore, { backgroundColor: getStatusColor() }]} />
        </Animated.View>
        <Text style={[styles.radarText, { color: location ? COLORS.TEXT : COLORS.WARNING }]}>
          {location 
            ? `CIBLE: ${location.latitude.toFixed(4)} / ${location.longitude.toFixed(4)}` 
            : "📍 POSITION EN COURS DE RECHERCHE..."}
        </Text>
      </View>

      <View style={styles.terminalWindow}>
        <Text style={styles.terminalHeader}>// JOURNAL D'INTERCEPTION</Text>
        <ScrollView style={styles.logs}>
          {logs.map((l, i) => (
            <Text key={i} style={[styles.logLine, { color: l.type === 'danger' ? COLORS.DANGER : l.type === 'success' ? COLORS.SUCCESS : l.type === 'warning' ? COLORS.WARNING : COLORS.TEXT }]}>
              <Text style={{color: COLORS.MUTED}}>[{l.time}]</Text> {l.msg}
            </Text>
          ))}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        {recoveredKey ? (
          <TouchableOpacity style={[styles.btn, {backgroundColor: COLORS.SUCCESS}]} onPress={() => NfcModule.writeMagicCard(recoveredKey)}>
            <Text style={styles.btnText}>ÉCRIRE MAGIC CARD</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.btn, {backgroundColor: COLORS.CARD, borderColor: COLORS.DANGER, borderWidth: 1}]} onPress={triggerDowngrade}>
            <Text style={[styles.btnText, {color: COLORS.DANGER}]}>FORCER DOWNGRADE</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BG, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30, marginBottom: 40 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: 'white', letterSpacing: 2 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  radarContainer: { alignItems: 'center', justifyContent: 'center', height: 200, marginBottom: 20 },
  radarCircle: { width: 120, height: 120, borderRadius: 60, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radarCore: { width: 20, height: 20, borderRadius: 10, opacity: 0.8 },
  radarText: { marginTop: 20, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 1 },
  terminalWindow: { flex: 1, backgroundColor: '#000', borderRadius: 8, padding: 15, borderWidth: 1, borderColor: '#333' },
  terminalHeader: { color: '#333', fontSize: 10, marginBottom: 10, fontWeight: 'bold' },
  logs: { flex: 1 },
  logLine: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 4 },
  footer: { marginTop: 20 },
  btn: { height: 55, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
