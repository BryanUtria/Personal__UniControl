import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Switch, ScrollView, Platform, Alert, useWindowDimensions } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useModules } from '../../context/ModuleContext';
import { useToast } from '../../context/ToastContext';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, getOfflineQueue, clearOfflineQueue, syncOfflineQueue, isConnected } from '../../utils/offlineSync';
import Button from '../../components/Button';
import SidebarLayout from '../../navigation/SidebarLayout';

export default function SettingsScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { moduleSettings, saveModuleSettings } = useModules();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [pendingQueue, setPendingQueue] = useState([]);
  const [syncingManual, setSyncingManual] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);

  // Cargar la cola de sincronización offline
  const loadQueue = async () => {
    try {
      const queue = await getOfflineQueue();
      setPendingQueue(queue);
    } catch (err) {
      console.error('Error cargando cola offline:', err);
    }
  };

  const checkNetwork = async () => {
    const online = await isConnected();
    setNetworkOnline(online);
  };

  useEffect(() => {
    loadQueue();
    checkNetwork();
    const interval = setInterval(() => {
      loadQueue();
      checkNetwork();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleModule = (key) => {
    const updated = {
      ...moduleSettings,
      [key]: !moduleSettings[key]
    };
    saveModuleSettings(updated);
    showToast(`Módulo ${key === 'showShop' ? 'Tienda' : 'Deudas'} ${updated[key] ? 'habilitado' : 'deshabilitado'}`, 'info', 2000);
  };

  const handleManualSync = async () => {
    if (syncingManual) return;
    setSyncingManual(true);

    const online = await isConnected();
    if (!online) {
      showToast('Aún no tienes conexión a internet.', 'warning');
      setSyncingManual(false);
      return;
    }

    showToast('Sincronizando cambios manualmente...', 'info');
    const res = await syncOfflineQueue();
    if (res && res.success) {
      if (res.processed > 0) {
        showToast(`¡Sincronizado! Se subieron ${res.processed} cambios.`, 'success');
      } else {
        showToast('Todo está al día.', 'success');
      }
    } else {
      showToast(`Fallo al sincronizar: ${res.error || 'reintente luego'}`, 'danger');
    }
    await loadQueue();
    setSyncingManual(false);
  };

  const handleClearQueue = () => {
    Alert.alert(
      'Limpiar Datos Pendientes',
      '¿Estás seguro de que deseas eliminar todas las peticiones sin sincronizar? Esto descartará permanentemente los cambios realizados en modo offline.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Eliminar',
          style: 'destructive',
          onPress: async () => {
            await clearOfflineQueue();
            await loadQueue();
            showToast('Cola de sincronización vaciada.', 'info');
          }
        }
      ]
    );
  };

  const getFriendlyRequestName = (req) => {
    const { url, method, body } = req;
    let parsedBody = {};
    try {
      if (body) {
        parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
      }
    } catch (e) { }

    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('/checkout')) {
      return `Facturar Pedido (Ref: ${parsedBody.reference || 'Cliente'})`;
    }
    if (lowerUrl.includes('/recharge')) {
      return `Recargar Stock (Monto: $${parsedBody.price || 0})`;
    }
    if (lowerUrl.includes('/orders') && method === 'POST') {
      return `Crear Pedido/Mesa: "${parsedBody.reference || 'Sin ref'}"`;
    }
    if (lowerUrl.includes('/orders') && method === 'DELETE') {
      return `Eliminar/Cancelar Pedido`;
    }
    if (lowerUrl.includes('/items') && method === 'POST') {
      return `Agregar Producto a Pedido`;
    }
    if (lowerUrl.includes('/items') && method === 'PUT') {
      return `Actualizar Cantidad en Pedido`;
    }
    if (lowerUrl.includes('/items') && method === 'DELETE') {
      return `Quitar Producto de Pedido`;
    }
    if (lowerUrl.includes('/products') && method === 'POST') {
      return `Crear Producto: "${parsedBody.name || ''}"`;
    }
    if (lowerUrl.includes('/products') && method === 'PUT') {
      return `Editar Producto: "${parsedBody.name || ''}"`;
    }
    if (lowerUrl.includes('/products') && method === 'DELETE') {
      return `Eliminar Producto`;
    }
    if (lowerUrl.includes('/debtors') && method === 'POST') {
      return `Crear Deudor/Ahorro: "${parsedBody.name || ''}"`;
    }
    if (lowerUrl.includes('/debtors') && method === 'PUT') {
      return `Editar Deudor/Ahorro: "${parsedBody.name || ''}"`;
    }
    if (lowerUrl.includes('/debtors') && method === 'DELETE') {
      return `Eliminar Cuenta de Deudor`;
    }
    if (lowerUrl.includes('/debts') && method === 'POST') {
      return `Registrar Transacción: $${parsedBody.amount || 0}`;
    }
    if (lowerUrl.includes('/debts') && method === 'DELETE') {
      return `Eliminar Transacción de Deuda`;
    }

    if (method === 'POST') return 'Registrar Información';
    if (method === 'PUT') return 'Actualizar Información';
    if (method === 'DELETE') return 'Eliminar Registro';
    return 'Procesar Cambio';
  };

  return (
    <SidebarLayout
      navigation={navigation}
      title="Configuración"
      activeRoute="Settings"
    >
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={[styles.scrollContent, { padding: isMobile ? 10 : 16 }]}>
        {/* SECCIÓN MÓDULOS */}
        <View style={[styles.section, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Módulos Habilitados</Text>
          <Text style={[styles.sectionDesc, { color: theme.textSecondary }]}>
            Enciende o apaga los módulos para personalizar el menú lateral y las funciones visibles.
          </Text>

          <View style={[styles.settingRow, { borderBottomColor: isDarkMode ? '#2D2D2D' : '#F0F0F0' }]}>
            <View style={styles.settingLabelWrap}>
              <View style={[styles.iconContainer, { backgroundColor: '#3B82F615' }]}>
                <Ionicons name="cart" size={22} color="#3B82F6" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Tienda</Text>
                <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>Punto de Venta, Inventario e Historial de Ventas.</Text>
              </View>
            </View>
            <Switch
              value={moduleSettings.showShop}
              onValueChange={() => handleToggleModule('showShop')}
              trackColor={{ false: '#767577', true: theme.accent }}
              thumbColor={Platform.OS === 'ios' ? undefined : (moduleSettings.showShop ? '#FFF' : '#f4f3f4')}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLabelWrap}>
              <View style={[styles.iconContainer, { backgroundColor: '#8B5CF615' }]}>
                <Ionicons name="people" size={22} color="#8B5CF6" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Deudas, Deudores y Ahorros</Text>
                <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>Control de cuentas por cobrar, pagar y ahorros.</Text>
              </View>
            </View>
            <Switch
              value={moduleSettings.showDebtors}
              onValueChange={() => handleToggleModule('showDebtors')}
              trackColor={{ false: '#767577', true: theme.accent }}
              thumbColor={Platform.OS === 'ios' ? undefined : (moduleSettings.showDebtors ? '#FFF' : '#f4f3f4')}
            />
          </View>
        </View>

        {/* SECCIÓN SINCRONIZACIÓN */}
        <View style={[styles.section, { backgroundColor: theme.card, shadowColor: theme.shadow, marginTop: isMobile ? 10 : 20 }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Sincronización Offline</Text>
            <View style={[styles.networkBadge, { backgroundColor: networkOnline ? '#10B98120' : theme.danger + '15' }]}>
              <View style={[styles.networkDot, { backgroundColor: networkOnline ? '#10B981' : theme.danger }]} />
              <Text style={[styles.networkBadgeText, { color: networkOnline ? '#10B981' : theme.danger }]}>
                {networkOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
          <Text style={[styles.sectionDesc, { color: theme.textSecondary }]}>
            Los cambios realizados sin internet se encolan localmente y se suben al servidor cuando se restablece la red.
          </Text>

          {pendingQueue.length === 0 ? (
            <View style={styles.emptyQueue}>
              <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
              <Text style={[styles.emptyQueueTitle, { color: theme.text }]}>¡Todo está al día!</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                No tienes ningún cambio pendiente de sincronización.
              </Text>
            </View>
          ) : (
            <View style={styles.queueContainer}>
              <View style={styles.queueHeader}>
                <Text style={[styles.queueTitle, { color: theme.text }]}>
                  Cola de cambios ({pendingQueue.length})
                </Text>
              </View>

              <View style={styles.queueList}>
                {pendingQueue.map((req, index) => {
                  const methodColor = req.method === 'POST' ? '#10B981' : req.method === 'PUT' ? '#3B82F6' : '#EF4444';
                  return (
                    <View
                      key={req.id || index}
                      style={[
                        styles.queueItem,
                        {
                          backgroundColor: theme.background,
                          borderColor: isDarkMode ? '#2D2D2D' : '#E5E7EB',
                          borderLeftColor: methodColor
                        }
                      ]}
                    >
                      <View style={styles.queueItemHeader}>
                        <Text style={[styles.queueMethodText, { color: methodColor }]}>
                          {req.method}
                        </Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
                          {req.timestamp ? new Date(req.timestamp).toLocaleTimeString() : ''}
                        </Text>
                      </View>
                      <Text style={[styles.queueItemDesc, { color: theme.text }]}>
                        {getFriendlyRequestName(req)}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.queueActions}>
                <Button
                  title="Limpiar Cola"
                  onPress={handleClearQueue}
                  variant="danger"
                  style={{ flex: 1 }}
                />

                <Button
                  title="Sincronizar Ahora"
                  onPress={handleManualSync}
                  variant="primary"
                  loading={syncingManual}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
  },
  section: {
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionDesc: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  settingLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  networkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  networkBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyQueue: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyQueueTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 10,
  },
  queueContainer: {
    marginTop: 8,
  },
  queueHeader: {
    marginBottom: 10,
  },
  queueTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  queueList: {
    gap: 8,
    maxHeight: 300,
    overflow: 'hidden',
  },
  queueItem: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  queueItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  queueMethodText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  queueItemDesc: {
    fontSize: 12,
    fontWeight: '500',
  },
  queueActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    ...Platform.select({
      web: { cursor: 'pointer' }
    })
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  }
});
