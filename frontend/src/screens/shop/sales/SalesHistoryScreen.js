import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Platform, Modal, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme/ThemeContext';
import { useAuth } from '../../../context/AuthContext';
import { useShop } from '../../../context/ShopContext';
import { useToast } from '../../../context/ToastContext';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useWindowDimensions } from 'react-native';
import { apiFetch } from '../../../utils/offlineSync';
import { exportToExcel } from '../../../utils/excelExport';
import { formatDateToLocal as formatDate } from '../../../utils/dateUtils';
import SidebarLayout from '../../../navigation/SidebarLayout';
import Input from '../../../components/Input';
import Button from '../../../components/Button';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

// formatDate is now imported from utils

export default function SalesHistoryScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { activeShop } = useShop();
  const { showToast } = useToast();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  // Estados de datos
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'cash', 'credit'

  // Modal de Detalles de Venta
  const [selectedSale, setSelectedSale] = useState(null);
  const [saleItems, setSaleItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);

  // Historial del pedido (trazabilidad)
  const [orderHistory, setOrderHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleExportSales = async (type) => {
    const listToExport = type === 'all' ? sales : filteredSales;
    if (listToExport.length === 0) {
      showToast('No hay datos para exportar.', 'error');
      return;
    }

    try {
      const dataToExport = listToExport.map(s => ({
        'ID Venta': s.id,
        'Fecha y Hora': formatDate(s.created_at),
        'Total ($)': parseFloat(s.total),
        'Método de Pago': s.debtor_id !== null ? 'Crédito' : 'Efectivo',
        'Pedido Original': s.order_reference || 'N/A',
        'Cliente/Deudor': s.debtor_name || 'Al contado'
      }));

      await exportToExcel(dataToExport, `Historial_Ventas_${new Date().toISOString().split('T')[0]}`, 'Ventas');
      showToast('Archivo exportado correctamente.', 'success');
      setExportModalVisible(false);
    } catch (error) {
      console.error(error);
      showToast('Error al exportar a Excel.', 'error');
    }
  };

  const fetchSales = async () => {
    try {
      const response = await apiFetch(`${API_URL}/sales`, {
        headers: { 'x-user-id': user ? user.id.toString() : '', 'x-shop-id': activeShop ? activeShop.id.toString() : '' }
      });
      const data = await response.json();
      if (response.ok) {
        setSales(Array.isArray(data) ? data : []);
      } else {
        showToast('No se pudieron cargar las ventas.', 'error');
      }
    } catch (error) {
      console.error('Error al cargar ventas:', error);
      showToast('Error de red al cargar el historial.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchSaleItems = async (saleId) => {
    try {
      setLoadingItems(true);
      const response = await apiFetch(`${API_URL}/sales/${saleId}/items`, {
        headers: { 'x-shop-id': activeShop ? activeShop.id.toString() : '' }
      });
      const data = await response.json();
      if (response.ok) {
        setSaleItems(Array.isArray(data) ? data : []);
      } else {
        showToast('No se pudieron cargar los artículos de la venta.', 'error');
      }
    } catch (error) {
      console.error('Error al cargar items de la venta:', error);
      showToast('Error al conectar con el servidor.', 'error');
    } finally {
      setLoadingItems(false);
    }
  };

  // Devuelve metadatos de ícono/color/etiqueta para cada acción del historial
  const getActionMeta = (action) => {
    switch (action) {
      case 'order_created':
        return { icon: 'add-circle-outline', color: '#3B82F6', label: 'Pedido creado' };
      case 'items_added':
        return { icon: 'cart-outline', color: '#10B981', label: 'Productos agregados' };
      case 'items_increased':
        return { icon: 'arrow-up-circle-outline', color: '#10B981', label: 'Cantidad aumentada' };
      case 'items_decreased':
        return { icon: 'arrow-down-circle-outline', color: '#F59E0B', label: 'Cantidad reducida' };
      case 'items_updated':
        return { icon: 'create-outline', color: '#8B5CF6', label: 'Cantidad actualizada' };
      case 'item_removed':
        return { icon: 'trash-outline', color: '#EF4444', label: 'Artículo eliminado' };
      case 'order_completed':
        return { icon: 'checkmark-done-circle-outline', color: '#10B981', label: 'Pedido completado' };
      default:
        return { icon: 'time-outline', color: theme.textSecondary, label: action };
    }
  };

  const fetchOrderHistory = async (orderId) => {
    try {
      setLoadingHistory(true);
      const response = await apiFetch(`${API_URL}/orders/${orderId}/history`, {
        headers: { 'x-shop-id': activeShop ? activeShop.id.toString() : '' }
      });
      const data = await response.json();
      if (response.ok) {
        setOrderHistory(Array.isArray(data) ? data : []);
      } else {
        showToast('No se pudo cargar el historial del pedido.', 'error');
      }
    } catch (error) {
      console.error('Error al cargar historial del pedido:', error);
      showToast('Error al conectar con el servidor.', 'error');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchSales();
    }
  }, [isFocused, activeShop]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshing(true);
    fetchSales();
  };

  const handleOpenDetails = (sale) => {
    setSelectedSale(sale);
    setSaleItems([]);
    setOrderHistory([]);
    setDetailModalVisible(true);
    fetchSaleItems(sale.id);
    // Si la venta proviene de un pedido, cargar su historial de trazabilidad
    if (sale.order_id) {
      fetchOrderHistory(sale.order_id);
    }
  };

  // Filtrado de ventas
  const filteredSales = sales.filter(sale => {
    // 1. Filtro por tipo/método de pago
    const isCredit = sale.debtor_id !== null;
    if (filterType === 'cash' && isCredit) return false;
    if (filterType === 'credit' && !isCredit) return false;

    // 2. Filtro por búsqueda de texto (referencia de pedido o deudor)
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const orderRef = (sale.order_reference || '').toLowerCase();
    const debtorName = (sale.debtor_name || '').toLowerCase();
    const saleIdString = sale.id.toString();

    return orderRef.includes(query) || debtorName.includes(query) || saleIdString.includes(query);
  });

  const renderSaleItem = ({ item }) => {
    const isCredit = item.debtor_id !== null;

    return (
      <TouchableOpacity
        style={[styles.saleCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
        onPress={() => handleOpenDetails(item)}
      >
        <View style={styles.cardHeader}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.saleNumber, { color: theme.text, marginRight: 5 }]}>
                {String(item.id).startsWith('temp_') ? 'Venta Temporal' : `Venta #${item.id}`}
              </Text>
              {String(item.id).startsWith('temp_') ? (
                <Ionicons name="cloud-offline-outline" size={14} color="#F59E0B" />
              ) : (
                <Ionicons name="cloud-done-outline" size={14} color="#10B981" />
              )}
            </View>
            <Text style={[styles.saleTime, { color: theme.textSecondary }]}>{formatDate(item.created_at)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.saleTotal, { color: theme.accent }]}>
              $ {formatNumber(item.total)}
            </Text>
            {item.profit !== undefined && (
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2, fontWeight: '600' }}>
                Utilidad: $ {formatNumber(item.profit)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.cardBody}>
          {/* Chip de Método de pago */}
          <View style={[
            styles.paymentChip,
            { backgroundColor: isCredit ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)' }
          ]}>
            <Ionicons
              name={isCredit ? "alert-circle-outline" : "cash-outline"}
              size={14}
              color={isCredit ? theme.danger : '#10B981'}
              style={{ marginRight: 4 }}
            />
            <Text style={[
              styles.paymentText,
              { color: isCredit ? theme.danger : '#10B981' }
            ]}>
              {isCredit ? 'Crédito' : 'Efectivo'}
            </Text>
          </View>

          {/* Información Adicional */}
          <View style={styles.metaInfo}>
            {item.order_reference ? (
              <View style={styles.metaRow}>
                <Ionicons name="receipt-outline" size={13} color={theme.textSecondary} style={{ marginRight: 4 }} />
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                  Pedido: {item.order_reference}
                </Text>
              </View>
            ) : null}
            {isCredit && item.debtor_name ? (
              <View style={styles.metaRow}>
                <Ionicons name="person-outline" size={13} color={theme.textSecondary} style={{ marginRight: 4 }} />
                <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
                  Deudor: {item.debtor_name}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const headerRightComponent = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Button
        onPress={() => setExportModalVisible(true)}
        variant="secondary"
        style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
        icon={<Ionicons name="download-outline" size={20} color={theme.text} />}
      />
      <Button
        onPress={handleRefresh}
        variant="secondary"
        style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
        icon={<Ionicons name="refresh" size={20} color={theme.text} />}
      />
    </View>
  );

  return (
    <SidebarLayout navigation={navigation} title="Historial de Ventas" activeRoute="SalesHistory" headerRight={headerRightComponent}>

      <View style={{ flexDirection: 'row', alignItems: 'center', padding: isMobile ? 10 : 20 }}>
        <Button
          onPress={() => navigation.goBack()}
          variant="secondary"
          style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, marginRight: 10, borderWidth: 0 }]}
          icon={<Ionicons name="chevron-back" size={22} color={theme.text} />}
        />
        <Text style={[styles.title, { color: theme.text }]}>
          Ventas
        </Text>
      </View>

      {/* Buscador */}
      <View style={[styles.filterSection, { paddingHorizontal: isMobile ? 10 : 15, paddingTop: 0 }]}>
        <Input
          icon="search"
          placeholder="Buscar por # venta, pedido o deudor..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          rightElement={
            searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ paddingRight: 8 }}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            ) : null
          }
          containerStyle={{ marginBottom: 0 }}
        />

        {/* Filtros Rápidos */}
        <View style={[styles.filterButtonsRow, { marginTop: isMobile ? 10 : 20 }]}>
          <TouchableOpacity
            style={[
              styles.filterTab,
              { backgroundColor: theme.card, borderColor: theme.border },
              filterType === 'all' && { backgroundColor: theme.accent, borderColor: theme.accent }
            ]}
            onPress={() => setFilterType('all')}
          >
            <Text style={[styles.filterTabText, { color: theme.text }, filterType === 'all' && { color: '#FFF' }]}>
              Todas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterTab,
              { backgroundColor: theme.card, borderColor: theme.border },
              filterType === 'cash' && { backgroundColor: theme.accent, borderColor: theme.accent }
            ]}
            onPress={() => setFilterType('cash')}
          >
            <Text style={[styles.filterTabText, { color: theme.text }, filterType === 'cash' && { color: '#FFF' }]}>
              Efectivo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterTab,
              { backgroundColor: theme.card, borderColor: theme.border },
              filterType === 'credit' && { backgroundColor: theme.accent, borderColor: theme.accent }
            ]}
            onPress={() => setFilterType('credit')}
          >
            <Text style={[styles.filterTabText, { color: theme.text }, filterType === 'credit' && { color: '#FFF' }]}>
              Crédito
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lista de Ventas */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={{ marginTop: 10, color: theme.textSecondary }}>Cargando ventas...</Text>
        </View>
      ) : filteredSales.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="receipt-outline" size={60} color={theme.textSecondary} style={{ marginBottom: 15 }} />
          <Text style={[styles.noSalesTitle, { color: theme.text }]}>No se encontraron ventas</Text>
          <Text style={[styles.noSalesSub, { color: theme.textSecondary }]}>
            Realiza cobros desde el POS para ver el historial aquí.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredSales}
          keyExtractor={(item) => item.id}
          renderItem={renderSaleItem}
          contentContainerStyle={[styles.listContainer, { paddingHorizontal: isMobile ? 10 : 15 }]}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      {/* MODAL DETALLES DE VENTA */}
      <Modal
        visible={detailModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDetailModalVisible(false)}>
          <Pressable style={[
            styles.modalContent,
            {
              backgroundColor: theme.card,
              padding: isMobile ? 16 : 24,
              height: isMobile ? '80%' : '75%',
              paddingBottom: isMobile ? (Platform.OS === 'ios' ? 32 : 20) : 24
            }
          ]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>

            {/* Header del Modal */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Detalle de Venta</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  Venta #{selectedSale?.id} • {formatDate(selectedSale?.created_at)}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.closeModalBtn, { backgroundColor: isDarkMode ? '#2D2D2D' : '#F3F4F6' }]}
                onPress={() => setDetailModalVisible(false)}
              >
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Contenido del Detalle */}
            <ScrollView style={{ flex: 1, paddingVertical: 15 }} showsVerticalScrollIndicator={false}>

              {/* Información General */}
              <View style={[styles.detailSection, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Método de Pago:</Text>
                  <Text style={[styles.detailValue, { color: selectedSale?.debtor_id ? theme.danger : '#10B981', fontWeight: '800' }]}>
                    {selectedSale?.debtor_id ? 'Crédito' : 'Efectivo'}
                  </Text>
                </View>

                {selectedSale?.order_reference ? (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Pedido Original:</Text>
                    <Text style={[styles.detailValue, { color: theme.text, fontWeight: '700' }]}>
                      {selectedSale.order_reference}
                    </Text>
                  </View>
                ) : null}

                {selectedSale?.debtor_id ? (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Cargado al Cliente:</Text>
                    <Text style={[styles.detailValue, { color: theme.text, fontWeight: '700' }]}>
                      {selectedSale.debtor_name || 'Desconocido'}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Lista de Artículos */}
              <Text style={[styles.sectionSubtitle, { color: theme.text }]}>Productos Vendidos</Text>

              {loadingItems ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={theme.accent} />
                  <Text style={{ marginTop: 8, color: theme.textSecondary, fontSize: 12 }}>Cargando artículos...</Text>
                </View>
              ) : saleItems.length === 0 ? (
                <Text style={{ textAlign: 'center', color: theme.textSecondary, marginVertical: 20 }}>
                  No se encontraron productos en esta venta.
                </Text>
              ) : (
                <View style={styles.itemsListContainer}>
                  {saleItems.map((item, index) => (
                    <View
                      key={item.id || index.toString()}
                      style={[styles.itemRow, { borderBottomColor: theme.background }]}
                    >
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[styles.itemName, { color: theme.text }]}>{item.name}</Text>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                          {item.quantity} {item.quantity === 1 ? 'unidad' : 'unidades'} x $ {formatNumber(item.price)}
                        </Text>
                      </View>
                      <Text style={[styles.itemSubtotal, { color: theme.text }]}>
                        $ {formatNumber(item.subtotal)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Historial del Pedido (Trazabilidad) */}
              {selectedSale?.order_id ? (
                <>
                  <Text style={[styles.sectionSubtitle, { color: theme.text, marginTop: 20 }]}>
                    Historial del Pedido
                  </Text>

                  {loadingHistory ? (
                    <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={theme.accent} />
                      <Text style={{ marginTop: 8, color: theme.textSecondary, fontSize: 12 }}>Cargando historial...</Text>
                    </View>
                  ) : orderHistory.length === 0 ? (
                    <Text style={{ textAlign: 'center', color: theme.textSecondary, marginVertical: 15, fontSize: 13 }}>
                      No hay movimientos registrados para este pedido.
                    </Text>
                  ) : (
                    <View style={styles.historyContainer}>
                      {orderHistory.map((log, index) => {
                        const meta = getActionMeta(log.action);
                        const isLast = index === orderHistory.length - 1;
                        return (
                          <View key={log.id || index.toString()} style={styles.historyRow}>
                            {/* Línea de tiempo */}
                            <View style={styles.timelineColumn}>
                              <View style={[styles.timelineDot, { backgroundColor: meta.color }]}>
                                <Ionicons name={meta.icon} size={12} color="#FFF" />
                              </View>
                              {!isLast && <View style={[styles.timelineLine, { backgroundColor: theme.border }]} />}
                            </View>

                            {/* Contenido */}
                            <View style={[styles.historyCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                              <View style={styles.historyCardHeader}>
                                <Text style={[styles.historyAction, { color: theme.text }]}>
                                  {meta.label}
                                </Text>
                                <Text style={[styles.historyTime, { color: theme.textSecondary }]}>
                                  {formatDate(log.created_at)}
                                </Text>
                              </View>

                              <Text style={[styles.historyDescription, { color: theme.textSecondary }]}>
                                {log.description}
                              </Text>

                              {log.product_name ? (
                                <View style={styles.historyProductRow}>
                                  <Ionicons name="cube-outline" size={12} color={theme.textSecondary} style={{ marginRight: 4 }} />
                                  <Text style={[styles.historyProduct, { color: theme.text }]}>
                                    {log.product_name}
                                    {log.quantity > 0 && ` × ${log.quantity}`}
                                    {log.price != null && ` — $ ${formatNumber(log.price)}`}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </>
              ) : null}

              {/* Total Final */}
              <View style={[styles.totalSectionDetail, { borderTopColor: theme.background }]}>
                <View>
                  <Text style={[styles.totalLabelDetail, { color: theme.text }]}>Total Cobrado</Text>
                  {selectedSale?.profit !== undefined && (
                    <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 4, fontWeight: '600' }}>
                      Utilidad: $ {formatNumber(selectedSale.profit)}
                    </Text>
                  )}
                </View>
                <Text style={[styles.totalValueDetail, { color: theme.accent }]}>
                  $ {formatNumber(selectedSale?.total)}
                </Text>
              </View>

            </ScrollView>

            {/* Botón de cierre abajo */}
            <TouchableOpacity
              style={[styles.modalCloseMainBtn, { backgroundColor: theme.accent }]}
              onPress={() => setDetailModalVisible(false)}
            >
              <Text style={styles.modalCloseMainText}>Entendido</Text>
            </TouchableOpacity>

          </Pressable>
        </Pressable>
      </Modal>

      {/* MODAL DE EXPORTACIÓN */}
      <Modal
        visible={exportModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setExportModalVisible(false)}
      >
        <Pressable style={[styles.modalOverlay, { paddingHorizontal: isMobile ? 10 : 15 }]} onPress={() => setExportModalVisible(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.card, maxWidth: 450, alignSelf: 'center', marginBottom: 'auto', marginTop: 'auto', borderRadius: 20, padding: isMobile ? 10 : 15 }]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Exportar Ventas</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>Selecciona el rango de datos</Text>
              </View>
              <TouchableOpacity
                style={[styles.closeModalBtn, { backgroundColor: isDarkMode ? '#2D2D2D' : '#F3F4F6' }]}
                onPress={() => setExportModalVisible(false)}
              >
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={{ paddingVertical: 5, gap: 12 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 8 }}>
                Descarga el historial de ventas en formato Excel (.xlsx) compatible con cualquier hoja de cálculo.
              </Text>

              <TouchableOpacity
                style={[styles.exportBtn, { backgroundColor: theme.accent }]}
                onPress={() => handleExportSales('all')}
              >
                <Ionicons name="document-text-outline" size={20} color="#FFF" />
                <Text style={styles.exportBtnText}>Todas las ventas ({sales.length})</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.exportBtn, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }]}
                onPress={() => handleExportSales('filtered')}
              >
                <Ionicons name="funnel-outline" size={20} color={theme.text} />
                <Text style={[styles.exportBtnText, { color: theme.text }]}>Ventas filtradas/buscadas ({filteredSales.length})</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    height: Platform.OS === 'web' ? 60 : 70,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  backCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  title: { fontSize: 20, fontWeight: 'bold' },
  refreshBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  filterSection: {
    paddingBottom: 5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
  },
  filterButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  filterTab: {
    flex: 0.31,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  noSalesTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 5,
  },
  noSalesSub: {
    fontSize: 13,
    textAlign: 'center',
  },
  listContainer: {
    paddingTop: 5,
  },
  saleCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.03)',
    paddingBottom: 10,
    marginBottom: 10,
  },
  saleNumber: {
    fontSize: 15,
    fontWeight: '800',
  },
  saleTime: {
    fontSize: 11,
    marginTop: 2,
  },
  saleTotal: {
    fontSize: 18,
    fontWeight: '900',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  paymentText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaInfo: {
    alignItems: 'flex-end',
    flex: 1,
    marginLeft: 15,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Modal de Detalle
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
    maxHeight: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  closeModalBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
  },
  detailValue: {
    fontSize: 13,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
  },
  itemsListContainer: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  itemSubtotal: {
    fontSize: 14,
    fontWeight: '800',
  },
  // Historial del Pedido
  historyContainer: {
    marginBottom: 10,
  },
  historyRow: {
    flexDirection: 'row',
  },
  timelineColumn: {
    width: 28,
    alignItems: 'center',
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    marginVertical: 2,
  },
  historyCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyAction: {
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  historyTime: {
    fontSize: 10,
  },
  historyDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  historyProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  historyProduct: {
    fontSize: 12,
    fontWeight: '600',
  },
  totalSectionDetail: {
    borderTopWidth: 2,
    paddingTop: 15,
    marginTop: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  totalLabelDetail: {
    fontSize: 16,
    fontWeight: '800',
  },
  totalValueDetail: {
    fontSize: 22,
    fontWeight: '900',
  },
  modalCloseMainBtn: {
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  modalCloseMainText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    gap: 8,
  },
  exportBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
