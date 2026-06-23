import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, ScrollView, Platform, useWindowDimensions, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useModules } from '../context/ModuleContext';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { apiFetch, getOfflineQueue } from '../utils/offlineSync';
import { useToast } from '../context/ToastContext';
import SidebarLayout from '../navigation/SidebarLayout';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const formatCompact = (num) => {
  return formatNumber(num);
};

export default function DashboardScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { moduleSettings } = useModules();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const isMobile = width < 600;
  const { showToast } = useToast();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const loadQueueCount = async () => {
    try {
      const queue = await getOfflineQueue();
      setPendingCount(queue.length);
    } catch (err) {
      console.error('Error cargando cola offline:', err);
    }
  };

  useEffect(() => {
    loadQueueCount();
    const interval = setInterval(loadQueueCount, 3000);
    return () => clearInterval(interval);
  }, []);

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
    <SidebarLayout navigation={navigation} title="Dashboard" activeRoute="Dashboard">
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

        {/* BIENVENIDA */}
        <View style={[styles.welcomeCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
          <View style={[styles.welcomeIconWrap, { backgroundColor: theme.accent + '15' }]}>
            <Ionicons name="sparkles" size={24} color={theme.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>{greeting},</Text>
            <Text style={[styles.title, { color: theme.text }]}>{user?.username || 'Usuario'}</Text>
            <Text style={[styles.dateText, { color: theme.textSecondary }]}>
              {now.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long' })}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={{ color: theme.textSecondary, marginTop: 12, fontSize: 14 }}>Cargando datos...</Text>
          </View>
        ) : (
          <>
            {pendingCount > 0 && (
              <TouchableOpacity
                style={[styles.syncBannerCard, { backgroundColor: isDarkMode ? 'rgba(120, 53, 4, 0.2)' : 'rgba(254, 243, 199, 0.5)', borderColor: isDarkMode ? '#FBBF2440' : '#D9770640' }]}
                onPress={() => navigation.navigate('Settings')}
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

            {/* FILA 3: Cuentas por cobrar y Saldo a Favor */}
            {moduleSettings.showDebtors && (
              <>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('DebtorsList')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 15, marginBottom: 10 }}
                >
                  <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginBottom: 0, marginTop: 0 }]}>DEUDAS, DEUDORES Y AHORROS</Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
                </TouchableOpacity>
                <View style={[styles.row, isMobile && styles.rowColumn]}>
                  {/* Card 1: Deuda total de clientes */}
                  <View style={[styles.statCard, { backgroundColor: theme.card, flex: 1 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={[styles.statIconBg, { backgroundColor: stats?.total_debt > 0 ? '#8B5CF615' : '#10B98115', marginVertical: 0 }]}>
                        <Ionicons name="people" size={18} color={stats?.total_debt > 0 ? '#8B5CF6' : '#10B981'} />
                      </View>
                    </View>
                    <Text style={[styles.statLabel, { color: theme.textSecondary, fontSize: 11 }]} numberOfLines={1}>Deudores (Por Cobrar)</Text>
                    <Text style={[styles.statValue, { color: stats?.total_debt > 0 ? '#8B5CF6' : theme.text, fontSize: 16 }]} numberOfLines={1}>
                      $ {formatNumber(stats?.total_debt || 0)}
                    </Text>
                  </View>

                  {/* Card 2: Saldo a favor total */}
                  <View style={[styles.statCard, { backgroundColor: theme.card, flex: 1 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={[styles.statIconBg, { backgroundColor: '#10B98115', marginVertical: 0 }]}>
                        <Ionicons name="wallet-outline" size={18} color="#10B981" />
                      </View>
                    </View>
                    <Text style={[styles.statLabel, { color: theme.textSecondary, fontSize: 11 }]} numberOfLines={1}>Ahorro</Text>
                    <Text style={[styles.statValue, { color: '#10B981', fontSize: 16 }]} numberOfLines={1}>
                      $ {formatNumber(stats?.total_credit || 0)}
                    </Text>
                  </View>

                  {/* Card 3: Deudas por pagar a proveedores */}
                  <View style={[styles.statCard, { backgroundColor: theme.card, flex: 1 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={[styles.statIconBg, { backgroundColor: '#EF444415', marginVertical: 0 }]}>
                        <Ionicons name="card-outline" size={18} color="#EF4444" />
                      </View>
                    </View>
                    <Text style={[styles.statLabel, { color: theme.textSecondary, fontSize: 11 }]} numberOfLines={1}>Deudas (Por Pagar)</Text>
                    <Text style={[styles.statValue, { color: '#EF4444', fontSize: 16 }]} numberOfLines={1}>
                      $ {formatNumber(stats?.total_payable || 0)}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* FILA 1: Ventas de hoy + Pedidos en curso */}
            {moduleSettings.showShop && (
              <>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('SalesHistory')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 15, marginBottom: 10 }}
                >
                  <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginBottom: 0, marginTop: 0 }]}>TIENDA</Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
                </TouchableOpacity>
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

            {/* FILA 4: Inventario */}
            {moduleSettings.showShop && (
              <>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('Inventory')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 15, marginBottom: 10 }}
                >
                  <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginBottom: 0, marginTop: 0 }]}>INVENTARIO</Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
                </TouchableOpacity>
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
                  Habilita la Tienda o la Gestión de Deudas haciendo clic en la opción de Ajustes en el menú lateral.
                </Text>
              </View>
            )}
          </>
        )}

      </ScrollView>
    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    gap: 16,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  welcomeIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  greeting: { fontSize: 13, fontWeight: '500', marginBottom: 2 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: 0.3 },
  dateText: { fontSize: 12, fontWeight: '500', marginTop: 3, textTransform: 'capitalize' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    marginBottom: 10, marginTop: 4,
  },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  rowColumn: { flexDirection: 'column' },
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

  syncBannerCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
