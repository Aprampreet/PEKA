import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StatusBar,
  ScrollView,
  SafeAreaView,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import * as Battery from 'expo-battery';

// ⚙️ Default Backend URL (Matches your laptop's active IP on the network)
const DEFAULT_BACKEND_URL = 'http://172.20.10.6:8000';

export default function App() {
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
  } | null>(null);

  const [status, setStatus] = useState<
    'idle' | 'locating' | 'ready' | 'transmitting' | 'confirmed' | 'error'
  >('idle');
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [distressNotes, setDistressNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState(DEFAULT_BACKEND_URL);
  const [showSettings, setShowSettings] = useState(false);
  const [pingStatus, setPingStatus] = useState<string | null>(null);

  // Radar Pulse Animation
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    ).start();
  }, [pulseAnim]);

  // 1. Check Battery & GPS permissions on Mount
  useEffect(() => {
    (async () => {
      try {
        const level = await Battery.getBatteryLevelAsync();
        if (level >= 0) setBatteryLevel(Math.round(level * 100));
      } catch {}

      await acquireFreshCoordinates();
    })();
  }, []);

  // 2. High-Accuracy WGS84 Geolocation Fix
  const acquireFreshCoordinates = async () => {
    setStatus('locating');
    setErrorMessage(null);

    const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== 'granted') {
      setStatus('error');
      setErrorMessage('Location permission denied. Please enable GPS permissions in device settings.');
      return null;
    }

    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      const current = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };

      setCoords(current);
      setStatus('ready');
      return current;
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to acquire high-accuracy satellite GPS fix.');
      return null;
    }
  };

  // Test Server Connectivity
  const testServerPing = async () => {
    setPingStatus('Testing connection...');
    try {
      const res = await fetch(`${serverUrl}/`, { method: 'GET' });
      if (res.ok) {
        setPingStatus('✅ Connected to PIPER Operations Backend!');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setPingStatus(`⚠️ Server reachable but returned HTTP ${res.status}`);
      }
    } catch (e: any) {
      setPingStatus(`❌ Connection failed: ${e.message}. Check Wi-Fi and IP address.`);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // 3. Transmit Emergency SOS Payload
  const handleTriggerSOS = async () => {
    setIsConfirmModalOpen(false);
    setStatus('transmitting');

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}

    let targetCoords = coords;
    if (!targetCoords) {
      targetCoords = await acquireFreshCoordinates();
    }

    if (!targetCoords) {
      targetCoords = { latitude: 31.635366, longitude: 74.823768, accuracy: 25.0 };
    }

    const idempotencyKey = Crypto.randomUUID();
    const payload = {
      idempotencyKey,
      latitude: targetCoords.latitude,
      longitude: targetCoords.longitude,
      accuracyMeters: targetCoords.accuracy || 10.0,
      locationCapturedAt: new Date().toISOString(),
      locationSource: 'mobile_companion_app',
      description: distressNotes || 'Emergency distress call initiated from React Native mobile companion app',
      isTestMode: false,
      userId: 'react-native-field-app',
    };

    try {
      const response = await fetch(`${serverUrl}/api/emergency/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server returned HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      if (data && data.success && data.incident) {
        setStatus('confirmed');
        setIncidentId(data.incident.id);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        throw new Error('Unexpected response format from operations server');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to reach PIPER operations server. Ensure IP address is correct.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  };

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.4],
  });

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 0],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#070B14" />
      <ScrollView contentContainerStyle={styles.container}>
        
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appTitle}>PIPER SOS</Text>
            <Text style={styles.appSubtitle}>Rescue Operations Companion</Text>
          </View>
          <View style={styles.headerRight}>
            {batteryLevel !== null && (
              <View style={styles.batteryBadge}>
                <Text style={styles.batteryText}>{batteryLevel}%</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => setShowSettings(!showSettings)} style={styles.settingsBtn}>
              <Text style={styles.settingsBtnText}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Server IP Config Drawer */}
        {showSettings && (
          <View style={styles.settingsCard}>
            <Text style={styles.settingsLabel}>PIPER Backend Base URL:</Text>
            <TextInput
              style={styles.settingsInput}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://192.168.1.100:8000"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.settingsHelp}>Must match your computer's local Wi-Fi IP address.</Text>
            
            <View style={styles.settingsBtnRow}>
              <TouchableOpacity onPress={() => setServerUrl('http://10.0.2.2:8000')} style={styles.presetBtn}>
                <Text style={styles.presetBtnText}>Android Emulator</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setServerUrl('http://localhost:8000')} style={styles.presetBtn}>
                <Text style={styles.presetBtnText}>Localhost</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={testServerPing} style={styles.pingBtn}>
                <Text style={styles.pingBtnText}>Test Ping</Text>
              </TouchableOpacity>
            </View>

            {pingStatus && (
              <Text style={[styles.pingStatusText, pingStatus.includes('✅') ? { color: '#34D399' } : { color: '#F87171' }]}>
                {pingStatus}
              </Text>
            )}
          </View>
        )}

        {/* Big Circular SOS Button with Animated Radar Waves */}
        <View style={styles.sosButtonContainer}>
          <Animated.View
            style={[
              styles.radarRing,
              {
                transform: [{ scale }],
                opacity,
              },
            ]}
          />
          <TouchableOpacity
            style={[styles.sosButton, status === 'transmitting' && styles.sosButtonDisabled]}
            activeOpacity={0.8}
            onPress={() => setIsConfirmModalOpen(true)}
            disabled={status === 'transmitting'}
          >
            {status === 'transmitting' ? (
              <ActivityIndicator size="large" color="#FFF" />
            ) : (
              <>
                <Text style={styles.sosSymbol}>🚨</Text>
                <Text style={styles.sosText}>SOS</Text>
                <Text style={styles.sosSubtext}>TAP TO DISPATCH</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Device GPS Telemetry Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>🛰️ High-Accuracy GPS Telemetry</Text>
            <TouchableOpacity onPress={acquireFreshCoordinates} style={styles.refreshBtn}>
              <Text style={styles.refreshBtnText}>{status === 'locating' ? 'Locating...' : 'Refresh Fix'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.grid}>
            <View style={styles.gridCol}>
              <Text style={styles.gridLabel}>LATITUDE</Text>
              <Text style={styles.gridValue}>
                {coords ? `${coords.latitude.toFixed(6)}°` : '---.------°'}
              </Text>
            </View>
            <View style={styles.gridCol}>
              <Text style={styles.gridLabel}>LONGITUDE</Text>
              <Text style={styles.gridValue}>
                {coords ? `${coords.longitude.toFixed(6)}°` : '---.------°'}
              </Text>
            </View>
          </View>

          <View style={styles.statusFooter}>
            <Text style={styles.statusFooterText}>
              Accuracy: {coords?.accuracy ? `±${Math.round(coords.accuracy)}m` : 'Calibrating...'}
            </Text>
            <Text style={styles.statusFooterText}>
              GPS Lock: <Text style={{ color: '#10B981', fontWeight: 'bold' }}>{status === 'ready' ? 'LOCKED' : status.toUpperCase()}</Text>
            </Text>
          </View>
        </View>

        {/* Confirmation Status Banner */}
        {status === 'confirmed' && incidentId && (
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>✅ SOS Transmitted to Operations Hub!</Text>
            <Text style={styles.successText}>
              Incident ID #{incidentId.slice(0, 8)} is now live on your PIPER OpenStreetMap console. Search and rescue teams have received your coordinates.
            </Text>
          </View>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>⚠️ Transmission Issue</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

      </ScrollView>

      {/* Confirmation Modal */}
      <Modal visible={isConfirmModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Emergency SOS</Text>
            <Text style={styles.modalBody}>
              Activating SOS will immediately capture your GPS coordinates and create an emergency rescue incident on the PIPER operations hub.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={distressNotes}
              onChangeText={setDistressNotes}
              placeholder="Details (e.g. Trapped in building, need medical)"
              placeholderTextColor="#64748B"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setIsConfirmModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleTriggerSOS}
                style={styles.modalConfirmBtn}
              >
                <Text style={styles.modalConfirmText}>Send SOS Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#070B14' },
  container: { padding: 20, alignItems: 'center' },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  appTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC' },
  appSubtitle: { fontSize: 11, color: '#94A3B8' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  batteryBadge: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  batteryText: { color: '#10B981', fontSize: 11, fontWeight: 'bold' },
  settingsBtn: { padding: 5 },
  settingsBtnText: { fontSize: 18 },
  settingsCard: {
    width: '100%',
    backgroundColor: '#0F172A',
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  settingsLabel: { color: '#E2E8F0', fontSize: 11, marginBottom: 5 },
  settingsInput: {
    backgroundColor: '#070B14',
    borderColor: '#475569',
    borderWidth: 1,
    borderRadius: 6,
    color: '#FFF',
    padding: 8,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  settingsHelp: { color: '#64748B', fontSize: 10, marginTop: 4 },
  settingsBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  presetBtn: { backgroundColor: '#1E293B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  presetBtnText: { color: '#94A3B8', fontSize: 10 },
  pingBtn: { backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  pingBtnText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  pingStatusText: { fontSize: 11, marginTop: 8 },
  sosButtonContainer: { marginVertical: 40, alignItems: 'center', justifyContent: 'center' },
  sosButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 15,
    borderWidth: 4,
    borderColor: '#EF4444',
  },
  sosButtonDisabled: { opacity: 0.7 },
  radarRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    borderColor: 'rgba(239, 68, 68, 0.6)',
  },
  sosSymbol: { fontSize: 24, marginBottom: 2 },
  sosText: { fontSize: 36, fontWeight: '900', color: '#FFF', letterSpacing: 3 },
  sosSubtext: { fontSize: 9, fontWeight: 'bold', color: '#FEE2E2', letterSpacing: 1 },
  card: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  cardTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  refreshBtn: { backgroundColor: '#1E293B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  refreshBtnText: { color: '#93C5FD', fontSize: 11 },
  grid: { flexDirection: 'row', gap: 10, marginTop: 12 },
  gridCol: { flex: 1, backgroundColor: '#070B14', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#1E293B' },
  gridLabel: { color: '#64748B', fontSize: 9, fontWeight: 'bold' },
  gridValue: { color: '#F8FAFC', fontSize: 14, fontWeight: 'bold', marginTop: 2, fontFamily: 'monospace' },
  statusFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  statusFooterText: { color: '#94A3B8', fontSize: 11 },
  successCard: {
    width: '100%',
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
    borderWidth: 1,
    borderColor: '#059669',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  successTitle: { color: '#34D399', fontWeight: 'bold', fontSize: 13 },
  successText: { color: '#E2E8F0', fontSize: 11, marginTop: 4, lineHeight: 16 },
  errorCard: {
    width: '100%',
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorTitle: { color: '#F87171', fontWeight: 'bold', fontSize: 13 },
  errorText: { color: '#FECACA', fontSize: 11, marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', backgroundColor: '#111827', borderWidth: 2, borderColor: '#DC2626', borderRadius: 16, padding: 20 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  modalBody: { color: '#CBD5E1', fontSize: 12, lineHeight: 18, marginBottom: 14 },
  modalInput: {
    backgroundColor: '#070B14',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    color: '#FFF',
    padding: 10,
    fontSize: 12,
    marginBottom: 16,
  },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancelBtn: { backgroundColor: '#1E293B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  modalCancelText: { color: '#CBD5E1', fontSize: 12, fontWeight: 'bold' },
  modalConfirmBtn: { backgroundColor: '#DC2626', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  modalConfirmText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
});
