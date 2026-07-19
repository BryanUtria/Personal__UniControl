import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import * as WebBrowser from 'expo-web-browser';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const formatCurrency = (amount) => {
  return `$ ${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
};

export default function SubscriptionModal({ visible, onClose, moduleKey = 'shop' }) {
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();

  const [moduleInfo, setModuleInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  const [frequency, setFrequency] = useState('monthly'); // 'monthly' | 'annual'

  useEffect(() => {
    if (visible && user) {
      fetchModuleInfo();
    }
  }, [visible, user]);

  const fetchModuleInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/modules`, {
        headers: { 'x-user-id': user.id.toString() }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al cargar módulos');

      const mod = data.find(m => m.module_key === moduleKey);
      if (mod) setModuleInfo(mod);
      else setError('Módulo no encontrado');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    setPaying(true);
    try {
      const response = await fetch(`${API_URL}/subscriptions/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ module_key: moduleKey, frequency })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al generar link de pago');

      if (data.init_point) {
        if (Platform.OS === 'web') {
          window.open(data.init_point, '_blank');
        } else {
          await WebBrowser.openBrowserAsync(data.init_point);
        }
        onClose();
      }
    } catch (err) {
      if (!err.userCancelled) {
        setError(err.message);
      }
    } finally {
      setPaying(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: theme.card }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>

          <View style={[styles.iconContainer, { backgroundColor: theme.accent + '20' }]}>
            <Ionicons name="star" size={32} color={theme.accent} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>
            {moduleInfo?.name === 'Paquete Personal' ? 'Suscripción Personal' : 'Módulo Premium'}
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color={theme.accent} style={{ marginVertical: 30 }} />
          ) : error ? (
            <View style={{ marginVertical: 20, alignItems: 'center' }}>
              <Ionicons name="alert-circle-outline" size={32} color="#EF4444" />
              <Text style={{ color: '#EF4444', textAlign: 'center', marginTop: 10 }}>{error}</Text>
              <TouchableOpacity onPress={fetchModuleInfo} style={{ marginTop: 15 }}>
                <Text style={{ color: theme.accent, fontWeight: 'bold' }}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : moduleInfo ? (
            <View style={styles.content}>
              <Text style={[styles.description, { color: theme.textSecondary }]}>
                {moduleInfo.module_key === 'shop'
                  ? 'Activa el Punto de Venta, Gestión de Inventario y Reporte de Ganancias para llevar tu negocio al siguiente nivel.'
                  : moduleInfo.module_key === 'personal'
                    ? 'Desbloquea funcionalidades completas.'
                    : 'Desbloquea este módulo exclusivo.'}
              </Text>

              <View style={styles.frequencyContainer}>
                <TouchableOpacity
                  style={[styles.freqOption, frequency === 'monthly' && { borderColor: theme.accent, backgroundColor: theme.accent + '15' }]}
                  onPress={() => setFrequency('monthly')}
                >
                  <Text style={[styles.freqTitle, frequency === 'monthly' && { color: theme.accent }]}>Mensual</Text>
                  {moduleInfo.custom_price_cop !== null && moduleInfo.custom_price_cop < moduleInfo.base_price_cop ? (
                    <>
                      <Text style={[styles.oldPriceSm, { color: theme.textSecondary }]}>{formatCurrency(moduleInfo.base_price_cop)}</Text>
                      <Text style={[styles.newPriceSm, { color: theme.accent }]}>{formatCurrency(moduleInfo.custom_price_cop)}</Text>
                    </>
                  ) : (
                    <Text style={[styles.newPriceSm, { color: theme.text }]}>{formatCurrency(moduleInfo.base_price_cop)}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.freqOption, frequency === 'annual' && { borderColor: theme.accent, backgroundColor: theme.accent + '15' }]}
                  onPress={() => setFrequency('annual')}
                >
                  <View style={styles.saveBadge}><Text style={styles.saveBadgeText}>Ahorra</Text></View>
                  <Text style={[styles.freqTitle, frequency === 'annual' && { color: theme.accent }]}>Anual</Text>
                  <Text style={[styles.newPriceSm, { color: frequency === 'annual' ? theme.accent : theme.text }]}>
                    {formatCurrency(moduleInfo.annual_price_cop || 75000)}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 15 }}>
                Renovación automática cada {frequency === 'annual' ? 'año' : 'mes'}. Cancela cuando quieras.
              </Text>

              <View style={styles.features}>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={[styles.featureText, { color: theme.text }]}>Acceso sin restricciones</Text>
                </View>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={[styles.featureText, { color: theme.text }]}>Soporte prioritario</Text>
                </View>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={[styles.featureText, { color: theme.text }]}>Cancela cuando quieras</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.subscribeBtn, { backgroundColor: theme.accent }, paying && { opacity: 0.7 }]}
                onPress={handleSubscribe}
                disabled={paying}
              >
                {paying ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.subscribeText}>
                    Pagar con MercadoPago
                  </Text>
                )}
              </TouchableOpacity>
              <View style={styles.secureRow}>
                <Ionicons name="lock-closed" size={12} color={theme.textSecondary} />
                <Text style={{ fontSize: 11, color: theme.textSecondary, marginLeft: 4 }}>
                  Pagos Seguros por MercadoPago
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10
  },
  closeBtn: {
    position: 'absolute',
    top: 15,
    right: 15,
    padding: 5,
    zIndex: 10
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10
  },
  content: {
    width: '100%',
    alignItems: 'center'
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20
  },
  frequencyContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginBottom: 10,
  },
  freqOption: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    position: 'relative'
  },
  freqTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#6B7280'
  },
  oldPriceSm: {
    fontSize: 12,
    textDecorationLine: 'line-through'
  },
  newPriceSm: {
    fontSize: 18,
    fontWeight: '900'
  },
  saveBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10
  },
  saveBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold'
  },
  features: {
    width: '100%',
    marginBottom: 25,
    gap: 12
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  featureText: {
    fontSize: 14,
    fontWeight: '500'
  },
  subscribeBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10
  },
  subscribeText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700'
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  }
});
