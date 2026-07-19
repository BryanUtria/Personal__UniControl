import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Platform, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import Button from './Button';
import Constants from 'expo-constants';
import { useToast } from '../context/ToastContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function VersionCheckModal() {
  const { showToast } = useToast();
  const { theme, isDarkMode } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [serverVersion, setServerVersion] = useState('');
  const [apkUrl, setApkUrl] = useState('');
  const localVersion = Constants.expoConfig?.version || '1.0.0';

  useEffect(() => {
    checkVersion();
  }, []);

  const checkVersion = async () => {
    try {
      const response = await fetch(`${API_URL}/version`);
      const data = await response.json();

      if (data.version && data.version !== localVersion) {
        setServerVersion(data.version);
        if (data.apkUrl) setApkUrl(data.apkUrl);
        setIsVisible(true);
      }
    } catch (error) {
      console.log('Error checking version:', error);
    }
  };

  const handleUpdate = () => {
    if (Platform.OS === 'web') {
      window.location.reload(true);
    } else {
      if (apkUrl) {
        Linking.openURL(apkUrl).catch(err => {
          showToast('No se pudo abrir el enlace de descarga.', 'error');
        });
      } else {
        checkVersion();
      }
    }
  };

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} transparent={true} animationType="fade">
      <View style={[styles.overlay, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.7)' }]}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <View style={styles.iconContainer}>
            <Ionicons name="cloud-download" size={60} color={theme.accent} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>¡Actualización Disponible!</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Hemos lanzado una nueva versión de la aplicación para mejorar tu experiencia.
          </Text>

          <View style={[styles.versionBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.versionRow}>
              <Text style={[styles.versionLabel, { color: theme.textSecondary }]}>Versión actual:</Text>
              <Text style={[styles.versionValue, { color: theme.danger }]}>v{localVersion}</Text>
            </View>
            <View style={styles.versionRow}>
              <Text style={[styles.versionLabel, { color: theme.textSecondary }]}>Nueva versión:</Text>
              <Text style={[styles.versionValue, { color: theme.success || '#10B981' }]}>v{serverVersion}</Text>
            </View>
          </View>

          <Button
            title={Platform.OS === 'web' ? "Recargar Aplicación" : "Actualizar"}
            onPress={handleUpdate}
            variant="primary"
            style={{ width: '100%', marginTop: 20 }}
            icon={<Ionicons name={Platform.OS === 'web' ? "refresh" : "checkmark-circle"} size={20} color="#FFF" style={{ marginRight: 8 }} />}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 22,
  },
  versionBox: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    gap: 10,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  versionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  versionValue: {
    fontSize: 16,
    fontWeight: '800',
  }
});
