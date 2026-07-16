import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import * as WebBrowser from 'expo-web-browser';
import Purchases from 'react-native-purchases';

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
      if (Platform.OS === 'android') {
        // Autenticar al usuario en RevenueCat
        await Purchases.logIn(user.id.toString());
        
        // Obtener las ofertas desde RevenueCat
        const offerings = await Purchases.getOfferings();
        
        if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
          // Comprar el primer paquete disponible en el offering actual
          const packageToBuy = offerings.current.availablePackages[0];
          const { customerInfo } = await Purchases.purchasePackage(packageToBuy);
          
          if (typeof customerInfo.entitlements.active['Premium'] !== 'undefined') {
            onClose();
            // TODO: Refrescar estado global del usuario
          }
        } else {
          // Sandbox / Mock cuando no hay productos configurados en Google Play
          setError('Aún estamos configurando los productos en Google Play. Por favor intenta más tarde.');
        }
      } else {
        // Lógica antigua web (Mercado Pago)
        const response = await fetch(`${API_URL}/subscriptions/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user.id.toString()
          },
          body: JSON.stringify({ module_key: moduleKey })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error al generar link de pago');

        if (data.init_point) {
          window.open(data.init_point, '_blank');
          onClose();
        }
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
          
          <Text style={[styles.title, { color: theme.text }]}>Módulo Premium</Text>
          
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
                {moduleInfo.name === 'Tienda' 
                  ? 'Activa el Punto de Venta, Gestión de Inventario y Reporte de Ganancias para llevar tu negocio al siguiente nivel.'
                  : 'Desbloquea este módulo exclusivo.'}
              </Text>

              <View style={[styles.priceBox, { backgroundColor: isDarkMode ? '#1e293b' : '#f1f5f9' }]}>
                {moduleInfo.custom_price_cop !== null && moduleInfo.custom_price_cop < moduleInfo.base_price_cop ? (
                  <>
                    <Text style={[styles.oldPrice, { color: theme.textSecondary }]}>{formatCurrency(moduleInfo.base_price_cop)} / mes</Text>
                    <Text style={[styles.newPrice, { color: theme.accent }]}>{formatCurrency(moduleInfo.custom_price_cop)} <Text style={styles.perMonth}>/ mes</Text></Text>
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountText}>Tarifa Especial</Text>
                    </View>
                  </>
                ) : (
                  <Text style={[styles.newPrice, { color: theme.accent }]}>{formatCurrency(moduleInfo.base_price_cop)} <Text style={styles.perMonth}>/ mes</Text></Text>
                )}
                <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4 }}>Renovación automática cada 30 días</Text>
              </View>

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
                    {Platform.OS === 'android' ? 'Suscribirse con Google Play' : 'Pagar con Mercado Pago'}
                  </Text>
                )}
              </TouchableOpacity>
              <View style={styles.secureRow}>
                <Ionicons name="lock-closed" size={12} color={theme.textSecondary} />
                <Text style={{ fontSize: 11, color: theme.textSecondary, marginLeft: 4 }}>
                  {Platform.OS === 'android' ? 'Pagos Seguros por Google Play' : 'Pagos Seguros por Mercado Pago'}
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
  priceBox: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative'
  },
  oldPrice: {
    fontSize: 16,
    textDecorationLine: 'line-through',
    marginBottom: 4
  },
  newPrice: {
    fontSize: 32,
    fontWeight: '900'
  },
  perMonth: {
    fontSize: 16,
    fontWeight: 'normal',
    opacity: 0.8
  },
  discountBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  discountText: {
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
