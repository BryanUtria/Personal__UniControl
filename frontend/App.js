import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { ToastProvider, useToast } from './src/context/ToastContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import NetInfo from '@react-native-community/netinfo';
import { syncOfflineQueue, getOfflineQueue, isConnected } from './src/utils/offlineSync';
import { Ionicons } from '@expo/vector-icons';
import { ModuleProvider } from './src/context/ModuleContext';
import VersionCheckModal from './src/components/VersionCheckModal';

function OfflineSyncManager() {
  const { showToast } = useToast();
  const { theme, isDarkMode } = useTheme();
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Consultar la cantidad de peticiones en la cola local
  const checkQueue = async () => {
    const queue = await getOfflineQueue();
    setQueueCount(queue.length);
  };

  useEffect(() => {
    checkQueue();
    // Consultar cada 3 segundos para reaccionar a cambios en cualquier pantalla
    const interval = setInterval(checkQueue, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let isInitial = true;
    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected === true;
      setIsOnline(connected);

      // Evitar notificaciones vacías al inicializar la app
      if (isInitial) {
        isInitial = false;
        if (!connected) {
          showToast('Modo sin conexión activo. Tus cambios se guardarán localmente.', 'warning', 4000);
        }
        return;
      }

      if (connected) {
        showToast('¡Conexión restablecida! Sincronizando datos pendientes...', 'info', 3000);
        setSyncing(true);
        syncOfflineQueue(
          (req) => {
            console.log('[OfflineSync] Petición sincronizada con éxito:', req.url);
          },
          (req, err) => {
            showToast(`Error al sincronizar cambio: ${err}`, 'danger', 4500);
          }
        ).then(res => {
          if (res && res.success && res.processed > 0) {
            showToast(`¡Sincronización completada! Se subieron ${res.processed} cambios guardados localmente.`, 'success', 5000);
          }
          checkQueue();
          setSyncing(false);
        });
      } else {
        showToast('Conexión de red perdida. Trabajando en modo offline.', 'warning', 4000);
      }
    });

    return () => unsubscribe();
  }, []);

  // Función para forzar sincronización manual
  const handleManualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    const online = await isConnected();
    if (!online) {
      showToast('Aún no tienes conexión a internet.', 'warning', 3000);
      setSyncing(false);
      return;
    }

    showToast('Sincronizando cambios manualmente...', 'info', 2000);
    const res = await syncOfflineQueue();
    if (res && res.success) {
      if (res.processed > 0) {
        showToast(`¡Sincronizado! Se subieron ${res.processed} cambios.`, 'success', 3000);
      } else {
        showToast('Todo está al día.', 'success', 2000);
      }
    } else {
      showToast(`Fallo al sincronizar: ${res.error || 'reintente luego'}`, 'danger', 3000);
    }
    await checkQueue();
    setSyncing(false);
  };

  const showBanner = queueCount > 0 || !isOnline;
  if (!showBanner) return null;

  // Colores e iconos adaptativos
  let pillText = '';
  let iconName = '';
  let showSyncBtn = false;

  // Si hay cambios pendientes, usamos colores ámbar de advertencia
  // Si sólo está offline sin cambios, usamos colores grises sutiles informativos
  const hasPendingChanges = queueCount > 0;
  const themeBg = hasPendingChanges
    ? (isDarkMode ? 'rgba(120, 53, 4, 0.95)' : 'rgba(254, 243, 199, 0.95)')
    : (isDarkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(243, 244, 246, 0.95)');

  const themeBorder = hasPendingChanges
    ? (isDarkMode ? '#F59E0B' : '#D97706')
    : (isDarkMode ? '#4B5563' : '#9CA3AF');

  const themeText = hasPendingChanges
    ? (isDarkMode ? '#FEF3C7' : '#78350F')
    : (isDarkMode ? '#F3F4F6' : '#374151');

  if (hasPendingChanges) {
    pillText = syncing ? 'Sincronizando...' : `${queueCount} cambio${queueCount > 1 ? 's' : ''} pendiente${queueCount > 1 ? 's' : ''}`;
    iconName = 'cloud-offline-outline';
    showSyncBtn = isOnline && !syncing;
  } else {
    pillText = 'Modo sin conexión';
    iconName = 'wifi-outline';
    showSyncBtn = false;
  }

  return (
    <View style={styles.syncPillContainer}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={hasPendingChanges ? handleManualSync : null}
        disabled={!hasPendingChanges || syncing}
        style={[styles.syncPill, { backgroundColor: themeBg, borderColor: themeBorder }]}
      >
        {syncing ? (
          <ActivityIndicator size="small" color={themeBorder} />
        ) : (
          <Ionicons name={iconName} size={16} color={themeBorder} />
        )}
        <Text style={[styles.syncText, { color: themeText }]}>
          {pillText}
        </Text>
        {showSyncBtn && (
          <View style={[styles.syncNowBtn, { backgroundColor: themeBorder }]}>
            <Text style={styles.syncNowText}>Sincronizar</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  syncPillContainer: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 20 : 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    gap: 8,
  },
  syncText: {
    fontSize: 12,
    fontWeight: '600',
  },
  syncNowBtn: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginLeft: 4,
  },
  syncNowText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  }
});

import { useNotifications } from './src/hooks/useNotifications';
import { useAuth } from './src/context/AuthContext';

function NotificationInitializer() {
  const { user } = useAuth();
  useNotifications(user?.id);
  return null;
}

export default function App() {

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationInitializer />
        <ModuleProvider>
          <ThemeProvider>
            <ToastProvider>
              <NavigationContainer>
                <AppNavigator />
              </NavigationContainer>
              <OfflineSyncManager />
              <VersionCheckModal />
            </ToastProvider>
          </ThemeProvider>
        </ModuleProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
