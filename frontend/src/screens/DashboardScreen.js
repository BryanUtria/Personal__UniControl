import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, ScrollView, Platform, useWindowDimensions, ActivityIndicator, RefreshControl, Modal, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { apiFetch, getOfflineQueue, clearOfflineQueue, syncOfflineQueue, isConnected } from '../utils/offlineSync';
import { useToast } from '../context/ToastContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const formatCompact = (num) => {
  return formatNumber(num);
};

export default function DashboardScreen({ navigation }) {
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const isMobile = width < 600;
  const { showToast } = useToast();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('indicators'); // 'indicators' | 'shortcuts'

  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [moduleSettings, setModuleSettings] = useState({
    showShop: true,
    showDebtors: true,
  });

  const loadModuleSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem('@unicontrol_module_settings');
      if (saved) {
        setModuleSettings(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error cargando ajustes de módulos:', e);
    }
  };

  const saveModuleSettings = async (settings) => {
    try {
      await AsyncStorage.setItem('@unicontrol_module_settings', JSON.stringify(settings));
      setModuleSettings(settings);
    } catch (e) {
      console.error('Error guardando ajustes de módulos:', e);
    }
  };

  useEffect(() => {
    if (isFocused) {
      loadModuleSettings();
    }
  }, [isFocused]);

  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncingManual, setSyncingManual] = useState(false);

  const loadQueue = async () => {
    try {
      const queue = await getOfflineQueue();
      setPendingQueue(queue);
      setPendingCount(queue.length);
    } catch (err) {
      console.error('Error cargando cola offline:', err);
    }
  };

  useEffect(() => {
    loadQueue();
    // Consultar cola local cada 3 segundos
    const interval = setInterval(loadQueue, 3000);
    return () => clearInterval(interval);
  }, []);

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
      return `Facturar Pedido (Mesa/Ref: ${parsedBody.reference || 'Cliente'})`;
    }
    if (lowerUrl.includes('/recharge')) {
      return `Recargar Stock (Monto: $${formatNumber(parsedBody.price || 0)})`;
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
      const isDeuda = parsedBody.type === 'deuda' || parsedBody.type === 'supplier';
      const isAhorro = parsedBody.type === 'ahorro' || parsedBody.type === 'saving';
      const roleText = isDeuda ? 'Deuda' : (isAhorro ? 'Ahorro' : 'Deudor');
      return `Crear ${roleText}: "${parsedBody.name || ''}"`;
    }
    if (lowerUrl.includes('/debtors') && method === 'PUT') {
      const isDeuda = parsedBody.type === 'deuda' || parsedBody.type === 'supplier';
      const isAhorro = parsedBody.type === 'ahorro' || parsedBody.type === 'saving';
      const roleText = isDeuda ? 'Deuda' : (isAhorro ? 'Ahorro' : 'Deudor');
      return `Editar ${roleText}: "${parsedBody.name || ''}"`;
    }
    if (lowerUrl.includes('/debtors') && method === 'DELETE') {
      return `Eliminar Cuenta`;
    }
    if (lowerUrl.includes('/debts') && method === 'POST') {
      const typeText = parsedBody.type === 'debt' ? 'Deuda' : 'Abono';
      return `Registrar ${typeText}: $${formatNumber(parsedBody.amount || 0)}`;
    }
    if (lowerUrl.includes('/debts') && method === 'DELETE') {
      return `Eliminar Transacción de Deuda`;
    }

    if (method === 'POST') return 'Registrar Información';
    if (method === 'PUT') return 'Actualizar Información';
    if (method === 'DELETE') return 'Eliminar Registro';
    return 'Procesar Cambio';
  };

  const getFriendlyRequestData = (req) => {
    const { url, method, body } = req;
    let parsedBody = {};
    try {
      if (body) {
        parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
      }
    } catch (e) { return null; }

    const lowerUrl = url.toLowerCase();
    const dataItems = [];

    // Extraer campos clave
    if (parsedBody.name) {
      dataItems.push({ label: 'Nombre', value: parsedBody.name });
    }
    if (parsedBody.reference) {
      dataItems.push({ label: 'Referencia', value: parsedBody.reference });
    }
    if (parsedBody.code) {
      dataItems.push({ label: 'Código', value: parsedBody.code });
    }
    if (parsedBody.price !== undefined) {
      dataItems.push({ label: 'Precio', value: `$${formatNumber(parsedBody.price)}` });
    }
    if (parsedBody.cost_price !== undefined) {
      dataItems.push({ label: 'Costo', value: `$${formatNumber(parsedBody.cost_price)}` });
    }
    if (parsedBody.amount !== undefined) {
      const label = parsedBody.type === 'payment' ? 'Abono' : 'Monto';
      dataItems.push({ label, value: `$${formatNumber(parsedBody.amount)}` });
    }
    if (parsedBody.quantity !== undefined) {
      dataItems.push({ label: 'Cantidad', value: `${parsedBody.quantity} u.` });
    }
    if (parsedBody.stock !== undefined) {
      dataItems.push({ label: 'Stock Inicial', value: `${parsedBody.stock} u.` });
    }
    if (parsedBody.phone) {
      dataItems.push({ label: 'Teléfono', value: parsedBody.phone });
    }
    if (parsedBody.description) {
      dataItems.push({ label: 'Descripción', value: parsedBody.description });
    }
    if (parsedBody.payment_type) {
      const typeLabel = parsedBody.payment_type === 'cash' ? 'Efectivo' : parsedBody.payment_type === 'debt' ? 'Deuda' : parsedBody.payment_type;
      dataItems.push({ label: 'Método Pago', value: typeLabel });
    }

    if (dataItems.length === 0) return null;

    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {dataItems.map((item, i) => (
          <View key={i} style={{ backgroundColor: isDarkMode ? '#222' : '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: isDarkMode ? '#333' : '#E5E7EB' }}>
            <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '700' }}>
              {item.label}: <Text style={{ color: theme.text, fontWeight: 'normal' }}>{item.value}</Text>
            </Text>
          </View>
        ))}
      </View>
    );
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
    fetchDashboard();
    setSyncingManual(false);
  };

  const handleClearQueue = () => {
    Alert.alert(
      'Limpiar Datos Pendientes',
      '¿Estás seguro de que deseas eliminar todas las peticiones sin sincronizar? Esto descartará los cambios que realizaste offline.',
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

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/dashboard`, {
        headers: { 'x-user-id': user ? user.id.toString() : '' }
      });
      const data = await res.json();
      if (res.ok) setStats(data);
    } catch (e) {
      console.error('Error cargando dashboard:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      fetchDashboard();
    }
  }, [isFocused]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  const now = new Date();
  const greeting = now.getHours() < 12 ? '☀️ Buenos días' : now.getHours() < 18 ? '🌤️ Buenas tardes' : '🌙 Buenas noches';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            padding: isMobile ? 10 : 20
          }
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      >

        {/* CABECERA */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>{greeting},</Text>
            <Text style={[styles.title, { color: theme.text }]}>{user?.username || 'Usuario'}</Text>
            <Text style={[styles.dateText, { color: theme.textSecondary }]}>
              {now.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long' })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 5 : 10 }}>
            <TouchableOpacity onPress={toggleTheme} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
              <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={20} color={isDarkMode ? '#FBBF24' : theme.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={logout} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
              <Ionicons name="log-out-outline" size={20} color={theme.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* SELECTOR DE PESTAÑAS (TABS) */}
        <View style={[styles.tabBar, { backgroundColor: theme.card }]}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'indicators' && { backgroundColor: theme.accent }]}
            onPress={() => setActiveTab('indicators')}
          >
            <Ionicons name="stats-chart" size={16} color={activeTab === 'indicators' ? '#FFF' : theme.textSecondary} />
            <Text style={[styles.tabText, { color: activeTab === 'indicators' ? '#FFF' : theme.textSecondary, marginLeft: 6 }]}>
              Indicadores
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'shortcuts' && { backgroundColor: theme.accent }]}
            onPress={() => setActiveTab('shortcuts')}
          >
            <Ionicons name="apps" size={16} color={activeTab === 'shortcuts' ? '#FFF' : theme.textSecondary} />
            <Text style={[styles.tabText, { color: activeTab === 'shortcuts' ? '#FFF' : theme.textSecondary, marginLeft: 6 }]}>
              Accesos Rápidos
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={{ color: theme.textSecondary, marginTop: 12, fontSize: 14 }}>Cargando datos...</Text>
          </View>
        ) : (
          <>
            {activeTab === 'indicators' ? (
              <>
                {/* BANNER DE COLA OFFLINE SI TIENE ELEMENTOS */}
                {pendingCount > 0 && (
                  <TouchableOpacity
                    style={[styles.syncBannerCard, { backgroundColor: isDarkMode ? 'rgba(120, 53, 4, 0.2)' : 'rgba(254, 243, 199, 0.5)', borderColor: isDarkMode ? '#FBBF2440' : '#D9770640' }]}
                    onPress={() => setSyncModalVisible(true)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <Ionicons name="cloud-offline" size={20} color="#FBBF24" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: 'bold' }}>
                          Tienes {pendingCount} cambio{pendingCount > 1 ? 's' : ''} sin sincronizar
                        </Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                          Presiona aquí para ver el detalle y sincronizar.
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#FBBF24" />
                  </TouchableOpacity>
                )}

                {/* FILA 1: Ventas de hoy + Pedidos en curso */}
                {moduleSettings.showShop && (
                  <>
                    <View style={styles.row}>
                      <View style={[styles.bigStatCard, { backgroundColor: theme.accent, flex: 1.5 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View>
                            <Text style={styles.bigStatLabel}>Ventas Hoy</Text>
                            <Text style={styles.bigStatValue}>
                              $ {isMobile ? formatCompact(stats?.today_sales_total || 0) : formatNumber(stats?.today_sales_total || 0)}
                            </Text>
                          </View>
                          <View style={styles.bigStatIcon}>
                            <Ionicons name="trending-up" size={22} color="rgba(255,255,255,0.9)" />
                          </View>
                        </View>
                        <Text style={styles.bigStatSub}>{stats?.today_sales_count || 0} transacciones</Text>
                      </View>

                      <View style={[styles.statCard, { backgroundColor: theme.card, flex: 1 }]}>
                        <View style={[styles.statIconBg, { backgroundColor: '#6366F115' }]}>
                          <Ionicons name="receipt-outline" size={20} color="#6366F1" />
                        </View>
                        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Pedidos en curso</Text>
                        <Text style={[styles.statValue, { color: stats?.pending_orders_count > 0 ? '#6366F1' : theme.text }]}>
                          {stats?.pending_orders_count || 0}
                        </Text>
                      </View>
                    </View>

                    {/* FILA 2: Semana + Mes */}
                    <View style={styles.row}>
                      <View style={[styles.statCard, { backgroundColor: theme.card, flex: 1 }]}>
                        <View style={[styles.statIconBg, { backgroundColor: '#10B98115' }]}>
                          <Ionicons name="calendar-outline" size={20} color="#10B981" />
                        </View>
                        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Esta semana</Text>
                        <Text style={[styles.statValue, { color: '#10B981' }]}>
                          $ {isMobile ? formatCompact(stats?.week_sales_total || 0) : formatNumber(stats?.week_sales_total || 0)}
                        </Text>
                      </View>

                      <View style={[styles.statCard, { backgroundColor: theme.card, flex: 1 }]}>
                        <View style={[styles.statIconBg, { backgroundColor: '#F59E0B15' }]}>
                          <Ionicons name="stats-chart-outline" size={20} color="#F59E0B" />
                        </View>
                        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Este mes</Text>
                        <Text style={[styles.statValue, { color: '#F59E0B' }]}>
                          $ {isMobile ? formatCompact(stats?.month_sales_total || 0) : formatNumber(stats?.month_sales_total || 0)}
                        </Text>
                      </View>
                    </View>
                  </>
                )}

                {/* FILA 3: Cuentas por cobrar y Saldo a Favor */}
                {moduleSettings.showDebtors && (
                  <>
                    <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 15 }]}>DEUDAS, DEUDORES Y AHORROS</Text>
                    <View style={styles.row}>
                      {/* Card 1: Deuda total de clientes */}
                      <TouchableOpacity
                        style={[styles.statCard, { backgroundColor: theme.card, flex: 1 }]}
                        onPress={() => navigation.navigate('DebtorsList')}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <View style={[styles.statIconBg, { backgroundColor: stats?.total_debt > 0 ? '#8B5CF615' : '#10B98115', marginVertical: 0 }]}>
                            <Ionicons name="people" size={18} color={stats?.total_debt > 0 ? '#8B5CF6' : '#10B981'} />
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
                        </View>
                        <Text style={[styles.statLabel, { color: theme.textSecondary, fontSize: 11 }]} numberOfLines={1}>Deudores (Por Cobrar)</Text>
                        <Text style={[styles.statValue, { color: stats?.total_debt > 0 ? '#8B5CF6' : theme.text, fontSize: 16 }]} numberOfLines={1}>
                          $ {isMobile ? formatCompact(stats?.total_debt || 0) : formatNumber(stats?.total_debt || 0)}
                        </Text>
                      </TouchableOpacity>

                      {/* Card 2: Saldo a favor total */}
                      <TouchableOpacity
                        style={[styles.statCard, { backgroundColor: theme.card, flex: 1 }]}
                        onPress={() => navigation.navigate('DebtorsList')}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <View style={[styles.statIconBg, { backgroundColor: '#10B98115', marginVertical: 0 }]}>
                            <Ionicons name="wallet-outline" size={18} color="#10B981" />
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
                        </View>
                        <Text style={[styles.statLabel, { color: theme.textSecondary, fontSize: 11 }]} numberOfLines={1}>Ahorro</Text>
                        <Text style={[styles.statValue, { color: '#10B981', fontSize: 16 }]} numberOfLines={1}>
                          $ {isMobile ? formatCompact(stats?.total_credit || 0) : formatNumber(stats?.total_credit || 0)}
                        </Text>
                      </TouchableOpacity>

                      {/* Card 3: Deudas por pagar a proveedores */}
                      <TouchableOpacity
                        style={[styles.statCard, { backgroundColor: theme.card, flex: 1 }]}
                        onPress={() => navigation.navigate('DebtorsList')}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <View style={[styles.statIconBg, { backgroundColor: '#EF444415', marginVertical: 0 }]}>
                            <Ionicons name="card-outline" size={18} color="#EF4444" />
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
                        </View>
                        <Text style={[styles.statLabel, { color: theme.textSecondary, fontSize: 11 }]} numberOfLines={1}>Deudas (Por Pagar)</Text>
                        <Text style={[styles.statValue, { color: '#EF4444', fontSize: 16 }]} numberOfLines={1}>
                          $ {isMobile ? formatCompact(stats?.total_payable || 0) : formatNumber(stats?.total_payable || 0)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {/* FILA 4: Inventario */}
                {moduleSettings.showShop && (
                  <>
                    <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>INVENTARIO</Text>
                    <View style={styles.row}>
                      <View style={[styles.statCard, { backgroundColor: theme.card, flex: 1 }]}>
                        <View style={[styles.statIconBg, { backgroundColor: '#8B5CF615' }]}>
                          <Ionicons name="cube-outline" size={20} color="#8B5CF6" />
                        </View>
                        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Productos únicos</Text>
                        <Text style={[styles.statValue, { color: '#8B5CF6' }]}>{stats?.total_products || 0}</Text>
                      </View>

                      <View style={[styles.statCard, { backgroundColor: theme.card, flex: 1.5 }]}>
                        <View style={[styles.statIconBg, { backgroundColor: theme.accent + '20' }]}>
                          <Ionicons name="wallet-outline" size={20} color={theme.accent} />
                        </View>
                        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Valor estimado inventario</Text>
                        <Text style={[styles.statValue, { color: theme.accent }]}>
                          $ {isMobile ? formatCompact(stats?.inventory_value || 0) : formatNumber(stats?.inventory_value || 0)}
                        </Text>
                      </View>
                    </View>

                    {/* ALERTAS DE STOCK BAJO */}
                    {stats?.low_stock_products?.length > 0 && (
                      <>
                        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>⚠️ ALERTAS DE STOCK</Text>
                        <View style={[styles.alertCard, { backgroundColor: theme.card }]}>
                          {stats.low_stock_products.map((p, i) => (
                            <View key={p.id} style={[
                              styles.alertRow,
                              i < stats.low_stock_products.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.background }
                            ]}>
                              <View style={[styles.alertDot, { backgroundColor: p.stock === 0 ? '#EF4444' : '#F59E0B' }]} />
                              <Text style={[styles.alertName, { color: theme.text }]} numberOfLines={1}>{p.name}</Text>
                              <View style={[styles.alertBadge, { backgroundColor: p.stock === 0 ? '#EF444420' : '#F59E0B20' }]}>
                                <Text style={[styles.alertBadgeText, { color: p.stock === 0 ? '#EF4444' : '#F59E0B' }]}>
                                  {p.stock === 0 ? 'Agotado' : `${p.stock} u.`}
                                </Text>
                              </View>
                            </View>
                          ))}
                          <TouchableOpacity
                            onPress={() => navigation.navigate('Inventory')}
                            style={[styles.alertLink, { borderTopColor: theme.background }]}
                          >
                            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Ver inventario →</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}

                    {/* ÚLTIMAS VENTAS */}
                    {stats?.recent_sales?.length > 0 && (
                      <>
                        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>ÚLTIMAS VENTAS</Text>
                        <View style={[styles.alertCard, { backgroundColor: theme.card }]}>
                          {stats.recent_sales.map((s, i) => (
                            <View key={s.id} style={[
                              styles.alertRow,
                              i < stats.recent_sales.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.background }
                            ]}>
                              <Ionicons
                                name={s.payment_type === 'cash' ? 'cash-outline' : 'people-outline'}
                                size={16}
                                color={s.payment_type === 'cash' ? '#10B981' : '#EF4444'}
                                style={{ marginRight: 8 }}
                              />
                              <Text style={[styles.alertName, { color: theme.textSecondary, fontSize: 11 }]}>
                                {new Date(s.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                              </Text>
                              <Text style={[styles.alertBadgeText, { color: theme.accent, fontWeight: '800', marginLeft: 'auto' }]}>
                                $ {formatNumber(s.total)}
                              </Text>
                            </View>
                          ))}
                          <TouchableOpacity
                            onPress={() => navigation.navigate('SalesHistory')}
                            style={[styles.alertLink, { borderTopColor: theme.background }]}
                          >
                            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Ver historial →</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </>
                )}

                {!moduleSettings.showShop && !moduleSettings.showDebtors && (
                  <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                    <Ionicons name="information-circle-outline" size={48} color={theme.textSecondary} style={{ marginBottom: 12 }} />
                    <Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 16 }}>No hay módulos activos</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 6, paddingHorizontal: 30 }}>
                      Habilita la Tienda o la Gestión de Deudas haciendo clic en el engranaje de Ajustes en la cabecera o en la pestaña de Accesos Rápidos.
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <>
                {/* MENÚ PRINCIPAL */}
                <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 8 }]}>ACCESOS RÁPIDOS</Text>
                <View style={isMobile ? styles.menuList : styles.menuGrid}>

                  {moduleSettings.showShop && (
                    <>
                      <TouchableOpacity
                        style={[isMobile ? styles.menuItemRow : styles.menuItemCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
                        onPress={() => navigation.navigate('POS')}
                      >
                        <View style={[styles.menuIconWrap, { backgroundColor: '#3B82F620' }]}>
                          <Ionicons name="cart" size={26} color="#3B82F6" />
                        </View>
                        <View style={styles.menuTextContainer}>
                          <Text style={[styles.menuText, { color: theme.text }]}>Punto de Venta</Text>
                          <Text style={[styles.menuDesc, { color: theme.textSecondary }]}>Registrar una nueva venta</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[isMobile ? styles.menuItemRow : styles.menuItemCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
                        onPress={() => navigation.navigate('Inventory')}
                      >
                        <View style={[styles.menuIconWrap, { backgroundColor: '#F59E0B20' }]}>
                          <Ionicons name="cube" size={26} color="#F59E0B" />
                        </View>
                        <View style={styles.menuTextContainer}>
                          <Text style={[styles.menuText, { color: theme.text }]}>Inventario</Text>
                          <Text style={[styles.menuDesc, { color: theme.textSecondary }]}>Gestionar productos y stock</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                      </TouchableOpacity>
                    </>
                  )}

                  {moduleSettings.showDebtors && (
                    <TouchableOpacity
                      style={[isMobile ? styles.menuItemRow : styles.menuItemCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
                      onPress={() => navigation.navigate('DebtorsList')}
                    >
                      <View style={[styles.menuIconWrap, { backgroundColor: '#EF444420' }]}>
                        <Ionicons name="people" size={26} color="#EF4444" />
                      </View>
                      <View style={styles.menuTextContainer}>
                        <Text style={[styles.menuText, { color: theme.text }]}>Deudas, Deudores y Ahorros</Text>
                        <Text style={[styles.menuDesc, { color: theme.textSecondary }]}>Control de cuentas pendientes</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                  )}

                  {moduleSettings.showShop && (
                    <TouchableOpacity
                      style={[isMobile ? styles.menuItemRow : styles.menuItemCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
                      onPress={() => navigation.navigate('SalesHistory')}
                    >
                      <View style={[styles.menuIconWrap, { backgroundColor: '#10B98120' }]}>
                        <Ionicons name="receipt" size={26} color="#10B981" />
                      </View>
                      <View style={styles.menuTextContainer}>
                        <Text style={[styles.menuText, { color: theme.text }]}>Historial de Ventas</Text>
                        <Text style={[styles.menuDesc, { color: theme.textSecondary }]}>Ver ventas y detalles de cobros</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[isMobile ? styles.menuItemRow : styles.menuItemCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
                    onPress={() => setSyncModalVisible(true)}
                  >
                    <View style={[styles.menuIconWrap, { backgroundColor: '#F59E0B20' }]}>
                      <Ionicons name="cloud-offline" size={26} color="#F59E0B" />
                    </View>
                    <View style={styles.menuTextContainer}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.menuText, { color: theme.text }]}>Sincronización Offline</Text>
                        {pendingCount > 0 && (
                          <View style={{ backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>{pendingCount}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.menuDesc, { color: theme.textSecondary }]}>Ver y subir cambios locales pendientes</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[isMobile ? styles.menuItemRow : styles.menuItemCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
                    onPress={() => setSettingsModalVisible(true)}
                  >
                    <View style={[styles.menuIconWrap, { backgroundColor: '#6B728020' }]}>
                      <Ionicons name="settings" size={26} color="#6B7280" />
                    </View>
                    <View style={styles.menuTextContainer}>
                      <Text style={[styles.menuText, { color: theme.text }]}>Ajustes de Módulos</Text>
                      <Text style={[styles.menuDesc, { color: theme.textSecondary }]}>Configurar visibilidad de aplicaciones</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                  </TouchableOpacity>

                </View>
              </>
            )}
          </>
        )}

      </ScrollView>

      {/* MODAL DE DETALLE DE SINCRONIZACIÓN */}
      <Modal
        visible={syncModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSyncModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: isDarkMode ? '#333' : '#F0F0F0', borderBottomWidth: 1 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="cloud-offline" size={22} color="#F59E0B" />
                <Text style={[styles.modalTitle, { color: theme.text }]}>Cambios Pendientes</Text>
              </View>
              <TouchableOpacity onPress={() => setSyncModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                Los siguientes cambios se realizaron localmente y están en espera de conexión a internet para subirse al servidor.
              </Text>

              {pendingQueue.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
                  <Text style={{ color: theme.text, marginTop: 12, fontWeight: 'bold' }}>¡Todo sincronizado!</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                    No tienes ningún cambio pendiente de subida.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 12, marginTop: 10 }}>
                  {pendingQueue.map((req, idx) => (
                    <View key={req.id || idx} style={[styles.queueItemCard, { backgroundColor: theme.background, borderColor: isDarkMode ? '#333' : '#E5E7EB', padding: 14, borderRadius: 12, borderWidth: 1 }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons
                            name={
                              req.method === 'POST' ? 'add-circle-outline' :
                                req.method === 'PUT' ? 'create-outline' :
                                  'trash-outline'
                            }
                            size={16}
                            color={
                              req.method === 'POST' ? '#10B981' :
                                req.method === 'PUT' ? '#3B82F6' :
                                  '#EF4444'
                            }
                          />
                          <Text style={{
                            color: req.method === 'POST' ? '#10B981' : req.method === 'PUT' ? '#3B82F6' : '#EF4444',
                            fontSize: 11,
                            fontWeight: '800'
                          }}>
                            {
                              req.method === 'POST' ? 'Adición' :
                                req.method === 'PUT' ? 'Modificación' :
                                  'Eliminación'
                            }
                          </Text>
                        </View>
                        <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
                          {req.timestamp ? new Date(req.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                        </Text>
                      </View>
                      <Text style={[styles.queueItemDesc, { color: theme.text, marginTop: 6, fontWeight: '700', fontSize: 13 }]}>
                        {getFriendlyRequestName(req)}
                      </Text>
                      {getFriendlyRequestData(req)}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={[styles.modalActions, { borderTopColor: isDarkMode ? '#333' : '#F0F0F0', borderTopWidth: 1 }]}>
              {pendingQueue.length > 0 && (
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#EF444420', flex: 1 }]}
                  onPress={handleClearQueue}
                >
                  <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 13, textAlign: 'center' }}>Limpiar Cola</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accent, flex: 1.5 }, syncingManual && { opacity: 0.7 }]}
                onPress={handleManualSync}
                disabled={syncingManual || pendingQueue.length === 0}
              >
                {syncingManual ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13, textAlign: 'center' }}>
                    Sincronizar Ahora
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL DE AJUSTES DE MÓDULOS */}
      <Modal
        visible={settingsModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: isDarkMode ? '#333' : '#F0F0F0', borderBottomWidth: 1 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="settings-outline" size={22} color={theme.text} />
                <Text style={[styles.modalTitle, { color: theme.text }]}>Ajustes de Módulos</Text>
              </View>
              <TouchableOpacity onPress={() => setSettingsModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text style={[styles.modalSubtitle, { color: theme.textSecondary, marginBottom: 20, fontSize: 13, textAlign: 'left' }]}>
                Configura qué secciones e indicadores quieres ver en el panel principal y accesos rápidos de la aplicación.
              </Text>

              {/* Ajuste 1: Tienda e Inventario */}
              <View style={[styles.settingsRow, { borderBottomColor: isDarkMode ? '#333' : '#F0F0F0', borderBottomWidth: 1, paddingBottom: 15 }]}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={[styles.settingsLabel, { color: theme.text }]}>Tienda, POS e Inventario</Text>
                  <Text style={[styles.settingsDesc, { color: theme.textSecondary }]}>
                    Habilita el Punto de Venta, Gestión de Lotes, Inventario e Historial de Ventas.
                  </Text>
                </View>
                <Switch
                  value={moduleSettings.showShop}
                  onValueChange={(val) => saveModuleSettings({ ...moduleSettings, showShop: val })}
                  trackColor={{ false: '#767577', true: theme.accent }}
                  thumbColor={moduleSettings.showShop ? '#FFF' : '#f4f3f4'}
                />
              </View>

              {/* Ajuste 2: Deudas, Deudores y Ahorros */}
              <View style={[styles.settingsRow, { paddingTop: 15 }]}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={[styles.settingsLabel, { color: theme.text }]}>Deudas, Deudores y Ahorros</Text>
                  <Text style={[styles.settingsDesc, { color: theme.textSecondary }]}>
                    Habilita el control de deudas, deudores, ahorros, abonos e historial de movimientos.
                  </Text>
                </View>
                <Switch
                  value={moduleSettings.showDebtors}
                  onValueChange={(val) => saveModuleSettings({ ...moduleSettings, showDebtors: val })}
                  trackColor={{ false: '#767577', true: theme.accent }}
                  thumbColor={moduleSettings.showDebtors ? '#FFF' : '#f4f3f4'}
                />
              </View>
            </ScrollView>

            <View style={[styles.modalActions, { borderTopColor: isDarkMode ? '#333' : '#F0F0F0', borderTopWidth: 1 }]}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accent, flex: 1 }]}
                onPress={() => setSettingsModalVisible(false)}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14, textAlign: 'center' }}>
                  Aceptar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
  },
  greeting: { fontSize: 13, fontWeight: '500', marginBottom: 2 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: 0.3 },
  dateText: { fontSize: 12, fontWeight: '500', marginTop: 3, textTransform: 'capitalize' },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
    elevation: 2, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    marginBottom: 10, marginTop: 4,
  },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  bigStatCard: {
    padding: 18, borderRadius: 18,
    elevation: 4, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6,
  },
  bigStatLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginBottom: 4 },
  bigStatValue: { fontSize: 26, color: '#FFF', fontWeight: '900' },
  bigStatSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 8, fontWeight: '500' },
  bigStatIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  statCard: {
    padding: 14, borderRadius: 16,
    elevation: 3, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 5,
  },
  statIconBg: {
    width: 34, height: 34, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  statLabel: { fontSize: 11, fontWeight: '600', lineHeight: 15, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '900' },
  alertCard: {
    borderRadius: 16, overflow: 'hidden', marginBottom: 16,
    elevation: 2, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
  },
  alertRow: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 14 },
  alertDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  alertName: { fontSize: 13, fontWeight: '600', flex: 1 },
  alertBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  alertBadgeText: { fontSize: 11, fontWeight: '700' },
  alertLink: {
    padding: 12, paddingHorizontal: 14,
    borderTopWidth: 1, alignItems: 'flex-end',
  },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  menuList: { flexDirection: 'column', gap: 10, marginBottom: 20 },
  menuItemCard: {
    width: 'calc(50% - 6px)', padding: 18, borderRadius: 18,
    elevation: 3, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 5,
    flexDirection: 'row', alignItems: 'center',
  },
  menuItemRow: {
    width: '100%', flexDirection: 'row', padding: 16, borderRadius: 16,
    alignItems: 'center',
    elevation: 2, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
  },
  menuIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  menuTextContainer: { flex: 1 },
  menuText: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  menuDesc: { fontSize: 12, lineHeight: 16 },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
  },
  syncBannerCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  queueItemCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  methodBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  queueItemDesc: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  modalBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  settingsDesc: {
    fontSize: 11,
    marginTop: 3,
    lineHeight: 14,
  }
});
