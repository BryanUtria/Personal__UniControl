import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Modal, ActivityIndicator, KeyboardAvoidingView, useWindowDimensions, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme/ThemeContext';
import { useAuth } from '../../../context/AuthContext';
import { useShop } from '../../../context/ShopContext';
import { useToast } from '../../../context/ToastContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { exportToExcel } from '../../../utils/excelExport';
import { formatDateToLocal } from '../../../utils/dateUtils';
import { apiFetch } from '../../../utils/offlineSync';
import SidebarLayout from '../../../navigation/SidebarLayout';
import Input from '../../../components/Input';
import Button from '../../../components/Button';
import { useModules } from '../../../context/ModuleContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const formatCompact = (num) => {
  return formatNumber(num);
};

// formatDateToLocal replaces formatBatchDate

export default function InventoryScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { activeShop } = useShop();
  const { showToast } = useToast();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const [isSavingClient, setIsSavingClient] = useState(false);

  // Estados de datos
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    setRefreshing(true);
    await fetchProducts();
    setRefreshing(false);
  };

  const handleExportProducts = async (type) => {
    const listToExport = type === 'all' ? products : processedProducts;
    if (listToExport.length === 0) {
      showToast('No hay datos para exportar.', 'error');
      return;
    }

    try {
      const dataToExport = listToExport.map(p => ({
        'Código': p.code || 'N/A',
        'Nombre': p.name,
        'Descripción': p.description || '',
        'Precio Venta ($)': parseFloat(p.price || 0),
        'Costo Unitario ($)': parseFloat(p.cost_price || 0),
        'Margen Ganancia (%)': p.profit_margin !== null ? `${p.profit_margin}%` : 'N/A',
        'Stock Actual': parseInt(p.stock || 0),
        'Stock Mínimo': parseInt(p.min_stock !== null ? p.min_stock : 5),
        'Estado': p.stock === 0 ? 'Agotado' : p.stock <= (p.min_stock || 5) ? 'Bajo Stock' : 'Disponible'
      }));

      await exportToExcel(dataToExport, `Inventario_${new Date().toISOString().split('T')[0]}`, 'Productos');
      showToast('Inventario exportado correctamente.', 'success');
      setExportModalVisible(false);
    } catch (error) {
      console.error(error);
      showToast('Error al exportar a Excel.', 'error');
    }
  };

  // Estados de filtros y ordenación
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [sortBy, setSortBy] = useState('name_asc'); // name_asc, name_desc, stock_desc, stock_asc, price_desc, price_asc
  const [stockFilter, setStockFilter] = useState('all'); // all, low (<=5), out (=0), in (>0)

  // Estados de CRUD
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [profitMargin, setProfitMargin] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('5');

  // Estados de recarga de stock
  const [rechargeModalVisible, setRechargeModalVisible] = useState(false);
  const [selectedProductForRecharge, setSelectedProductForRecharge] = useState(null);
  const [rechargeQty, setRechargeQty] = useState('');
  const [rechargeCost, setRechargeCost] = useState('');
  const [rechargeMargin, setRechargeMargin] = useState('');
  const [rechargePrice, setRechargePrice] = useState('');

  // Estados de visualización de lotes
  const [batchesModalVisible, setBatchesModalVisible] = useState(false);
  const [selectedProductForBatches, setSelectedProductForBatches] = useState(null);
  const [productBatches, setProductBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Funciones de autocalculado
  const handleCostPriceChange = (val) => {
    setCostPrice(val);
    const cost = parseFloat(val);
    const margin = parseFloat(profitMargin);
    if (!isNaN(cost) && !isNaN(margin)) {
      const salePrice = cost * (1 + margin / 100);
      setPrice(Math.round(salePrice).toString());
    } else if (!isNaN(cost) && (val === '' || profitMargin === '')) {
      setPrice(val);
    } else if (val === '') {
      setPrice('');
    }
  };

  const handleProfitMarginChange = (val) => {
    setProfitMargin(val);
    const cost = parseFloat(costPrice);
    const margin = parseFloat(val);
    if (!isNaN(cost) && !isNaN(margin)) {
      const salePrice = cost * (1 + margin / 100);
      setPrice(Math.round(salePrice).toString());
    } else if (val === '' && !isNaN(cost)) {
      setPrice(cost.toString());
    }
  };

  const handlePriceChange = (val) => {
    setPrice(val);
    const cost = parseFloat(costPrice);
    const sale = parseFloat(val);
    if (!isNaN(cost) && cost > 0 && !isNaN(sale)) {
      const margin = ((sale - cost) / cost) * 100;
      setProfitMargin(margin.toFixed(1).toString());
    }
  };

  const handleRechargeCostChange = (val) => {
    setRechargeCost(val);
    const cost = parseFloat(val);
    const margin = parseFloat(rechargeMargin);
    if (!isNaN(cost) && !isNaN(margin)) {
      const salePrice = cost * (1 + margin / 100);
      setRechargePrice(Math.round(salePrice).toString());
    } else if (!isNaN(cost) && (val === '' || rechargeMargin === '')) {
      setRechargePrice(val);
    } else if (val === '') {
      setRechargePrice('');
    }
  };

  const handleRechargeMarginChange = (val) => {
    setRechargeMargin(val);
    const cost = parseFloat(rechargeCost);
    const margin = parseFloat(val);
    if (!isNaN(cost) && !isNaN(margin)) {
      const salePrice = cost * (1 + margin / 100);
      setRechargePrice(Math.round(salePrice).toString());
    } else if (val === '' && !isNaN(cost)) {
      setRechargePrice(cost.toString());
    }
  };

  const handleRechargePriceChange = (val) => {
    setRechargePrice(val);
    const cost = parseFloat(rechargeCost);
    const sale = parseFloat(val);
    if (!isNaN(cost) && cost > 0 && !isNaN(sale)) {
      const margin = ((sale - cost) / cost) * 100;
      setRechargeMargin(margin.toFixed(1).toString());
    }
  };

  const openRechargeModal = (product) => {
    setSelectedProductForRecharge(product);
    setRechargeQty('');
    setRechargeCost(product.cost_price ? product.cost_price.toString() : '');
    setRechargeMargin(product.profit_margin ? product.profit_margin.toString() : '');
    setRechargePrice(product.price ? product.price.toString() : '');
    setRechargeModalVisible(true);
  };

  const handleSaveRecharge = async () => {
    if (!rechargeQty.trim() || parseInt(rechargeQty, 10) <= 0 || !rechargeCost.trim() || !rechargePrice.trim()) {
      showToast('Completa todos los campos obligatorios y con valores válidos (Cantidad, Costo y Precio Venta).', 'warning');
      return;
    }

    const payload = {
      quantity: parseInt(rechargeQty, 10),
      cost_price: parseFloat(rechargeCost),
      profit_margin: rechargeMargin.trim() ? parseFloat(rechargeMargin) : null,
      price: parseFloat(rechargePrice)
    };

    setIsSavingClient(true);
    try {
      setLoading(true);
      const response = await apiFetch(`${API_URL}/products/${selectedProductForRecharge.id}/recharge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user ? user.id.toString() : '',
          'x-shop-id': activeShop ? activeShop.id.toString() : ''
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        fetchProducts();
        showToast(data.message || 'Recarga de stock registrada correctamente.', 'success');
        setRechargeModalVisible(false);
      } else {
        showToast(data.error || 'No se pudo registrar la recarga.', 'error');
      }
    } catch (error) {
      console.error('Error al recargar stock:', error);
      showToast('Error de red al recargar stock.', 'error');
    } finally {
      setLoading(false);
      setIsSavingClient(false);
    }
  };

  const openBatchesModal = async (product) => {
    setSelectedProductForBatches(product);
    setProductBatches([]);
    setBatchesModalVisible(true);
    setLoadingBatches(true);
    try {
      const response = await apiFetch(`${API_URL}/products/${product.id}/batches`, {
        headers: {
          'x-shop-id': activeShop ? activeShop.id.toString() : ''
        }
      });
      const data = await response.json();
      if (response.ok) {
        setProductBatches(Array.isArray(data) ? data : []);
      } else {
        showToast('No se pudieron obtener los lotes del producto.', 'error');
      }
    } catch (error) {
      console.error('Error al obtener lotes:', error);
      showToast('Error de red al obtener historial de recargas.', 'error');
    } finally {
      setLoadingBatches(false);
    }
  };

  // Modal Confirmación Eliminación
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Cargar productos del servidor
  const fetchProducts = async () => {
    try {
      const response = await apiFetch(`${API_URL}/products`, {
        headers: {
          'x-user-id': user ? user.id.toString() : '',
          'x-shop-id': activeShop ? activeShop.id.toString() : ''
        }
      });
      const data = await response.json();
      setProducts(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('Error al cargar productos:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchProducts();
    }
  }, [isFocused, activeShop]);

  const { moduleSettings, saveModuleSettings } = useModules();

  const isFilterLoaded = React.useRef(false);

  // Cargar preferencias de filtros
  useEffect(() => {
    if (moduleSettings.unicontrol_inventory_filter && !isFilterLoaded.current) {
      isFilterLoaded.current = true;
      try {
        const saved = moduleSettings.unicontrol_inventory_filter;
        const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
        if (parsed.sortBy) setSortBy(parsed.sortBy);
        if (parsed.stockFilter) setStockFilter(parsed.stockFilter);
      } catch (e) {
        console.error('Error al cargar filtros de inventario:', e);
      }
    }
  }, [moduleSettings.unicontrol_inventory_filter]);

  // Guardar preferencias de filtros
  useEffect(() => {
    const saveFilters = async () => {
      try {
        // Evitamos guardar si no ha cargado los ajustes de modulos (evita sobrescribir en el primer render con valores por defecto)
        if (moduleSettings.unicontrol_inventory_filter !== undefined || sortBy !== 'name_asc' || stockFilter !== 'all') {
          await saveModuleSettings({ ...moduleSettings, unicontrol_inventory_filter: { sortBy, stockFilter } });
        }
      } catch (e) {
        console.error('Error al guardar filtros de inventario:', e);
      }
    };
    saveFilters();
  }, [sortBy, stockFilter]);

  // Manejar el envío de formulario (Crear/Editar)
  const handleSaveProduct = async () => {
    if (!code.trim() || !name.trim() || !minStock.trim()) {
      showToast('Completa todos los campos obligatorios (Código, Nombre y Alerta Stock).', 'warning');
      return;
    }

    const qty = parseInt(stock, 10) || 0;
    if (!editingId && qty > 0 && (!costPrice.trim() || !price.trim())) {
      showToast('Si ingresas un Stock Inicial, debes indicar también el Costo Neto y el Precio Público.', 'warning');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      price: price ? parseFloat(price) : 0,
      stock: qty,
      cost_price: costPrice ? parseFloat(costPrice) : 0,
      profit_margin: profitMargin ? parseFloat(profitMargin) : 0,
      code: code.trim(),
      min_stock: parseInt(minStock, 10),
    };

    setIsSavingClient(true);
    try {
      setLoading(true);
      if (editingId) {
        // Editar
        const response = await apiFetch(`${API_URL}/products/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user ? user.id.toString() : '',
            'x-shop-id': activeShop ? activeShop.id.toString() : ''
          },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          fetchProducts();
          showToast(data.message || 'Producto actualizado correctamente.', 'success');
        } else {
          showToast('No se pudo actualizar el producto.', 'error');
        }
      } else {
        // Crear nuevo
        const response = await apiFetch(`${API_URL}/products`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user ? user.id.toString() : '',
            'x-shop-id': activeShop ? activeShop.id.toString() : ''
          },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          fetchProducts();
          showToast(data.message || 'Producto registrado correctamente.', 'success');
        } else {
          showToast('No se pudo registrar el producto.', 'error');
        }
      }
      setModalVisible(false);
      clearForm();
    } catch (error) {
      console.error('Error al guardar producto:', error);
      setLoading(false);
      showToast('Error de red al guardar el producto.', 'error');
    } finally {
      setIsSavingClient(false);
    }
  };

  const clearForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setPrice('');
    setStock('');
    setCostPrice('');
    setProfitMargin('');
    setCode('');
    setMinStock('5');
  };

  const openEditModal = (product) => {
    setEditingId(product.id);
    setName(product.name);
    setDescription(product.description || '');
    setPrice(product.price.toString());
    setStock(product.stock.toString());
    setCostPrice(product.cost_price ? product.cost_price.toString() : '');
    setProfitMargin(product.profit_margin ? product.profit_margin.toString() : '');
    setCode(product.code || '');
    setMinStock(product.min_stock !== null && product.min_stock !== undefined ? product.min_stock.toString() : '5');
    setModalVisible(true);
  };

  const openDeleteModal = (product) => {
    setItemToDelete(product);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    setIsSavingClient(true);
    try {
      setLoading(true);
      const response = await apiFetch(`${API_URL}/products/${itemToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': user ? user.id.toString() : '',
          'x-shop-id': activeShop ? activeShop.id.toString() : ''
        }
      });
      if (response.ok) {
        fetchProducts();
      }
      setDeleteModalVisible(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error al eliminar producto:', error);
      setLoading(false);
    } finally {
      setIsSavingClient(false);
    }
  };

  // Procesamiento local de ordenación, filtros y búsquedas
  const getProcessedProducts = () => {
    let result = [...products];

    // 1. Búsqueda por texto
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // 2. Filtro por Stock
    if (stockFilter === 'low') {
      result = result.filter(p => {
        const limit = p.min_stock !== null && p.min_stock !== undefined ? p.min_stock : 5;
        return p.stock > 0 && p.stock <= limit;
      });
    } else if (stockFilter === 'out') {
      result = result.filter(p => p.stock === 0);
    } else if (stockFilter === 'in') {
      result = result.filter(p => p.stock > 0);
    }

    // 3. Ordenación
    result.sort((a, b) => {
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'name_desc') {
        return b.name.localeCompare(a.name);
      }
      if (sortBy === 'stock_desc') {
        return b.stock - a.stock;
      }
      if (sortBy === 'stock_asc') {
        return a.stock - b.stock;
      }
      if (sortBy === 'price_desc') {
        return parseFloat(b.price) - parseFloat(a.price);
      }
      if (sortBy === 'price_asc') {
        return parseFloat(a.price) - parseFloat(b.price);
      }
      return 0;
    });

    return result;
  };

  // Cálculos estadísticos rápidos
  const uniqueItemsCount = products.length;
  const totalStockCount = products.reduce((acc, p) => acc + (p.stock || 0), 0);
  const totalEstimatedValue = products.reduce((acc, p) => acc + ((p.stock || 0) * parseFloat(p.price || 0)), 0);

  const processedProducts = getProcessedProducts();

  const headerRightComponent = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Button
        onPress={handleRefresh}
        variant="secondary"
        style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
        icon={<Ionicons name="refresh" size={20} color={theme.text} />}
      />
      <Button
        onPress={() => setExportModalVisible(true)}
        variant="secondary"
        style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
        icon={<Ionicons name="download-outline" size={20} color={theme.text} />}
      />
      <Button
        onPress={() => setFilterMenuVisible(true)}
        variant="secondary"
        style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
        icon={<Ionicons name="options-outline" size={20} color={theme.text} />}
      />
    </View>
  );

  return (
    <SidebarLayout navigation={navigation} title="Inventario" activeRoute="Inventory" headerRight={headerRightComponent}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: 10 }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.accent]}
              tintColor={theme.accent}
            />
          }
        >

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
            <Button
              onPress={() => navigation.goBack()}
              variant="secondary"
              style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, marginRight: 10, borderWidth: 0 }]}
              icon={<Ionicons name="chevron-back" size={22} color={theme.text} />}
            />
            <Text style={[styles.title, { color: theme.text }]}>
              Stock
            </Text>
          </View>

          {/* TARJETAS RESUMEN */}
          <View style={[styles.statsRow, { marginBottom: 10 }]}>
            <View style={[styles.statCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Ítems Únicos</Text>
              <Text style={[styles.statValue, { color: theme.text }]}>{uniqueItemsCount}</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Cant. Total</Text>
              <Text style={[styles.statValue, { color: theme.text }]}>{totalStockCount}</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: theme.card, shadowColor: theme.shadow, flex: 1.2 }]}>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Valor Estimado</Text>
              <Text style={[styles.statValue, { color: theme.accent }]} numberOfLines={1} adjustsFontSizeToFit>
                $ {isMobile ? formatCompact(totalEstimatedValue) : formatNumber(totalEstimatedValue)}
              </Text>
            </View>
          </View>

          {/* BARRA DE BÚSQUEDA */}
          <Input
            icon="search"
            placeholder="Buscar producto o descripción..."
            value={search}
            onChangeText={setSearch}
            rightElement={
              search.length > 0 ? (
                <TouchableOpacity onPress={() => setSearch('')} style={{ paddingRight: 8 }}>
                  <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              ) : null
            }
            containerStyle={{ marginBottom: 8, marginHorizontal: 0 }}
          />

          {/* LISTADO DE PRODUCTOS */}
          {loading ? (
            <View style={{ paddingVertical: 60, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={{ color: theme.textSecondary, marginTop: 12, fontSize: 14 }}>Cargando datos...</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {processedProducts.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Ionicons name="cube-outline" size={48} color={theme.textSecondary} style={{ marginBottom: 10 }} />
                  <Text style={{ color: theme.textSecondary, fontSize: 16, textAlign: 'center' }}>
                    No se encontraron productos en el inventario.
                  </Text>
                </View>
              ) : (
                processedProducts.map(product => {
                  // Determinar color de stock
                  const isOutOfStock = product.stock === 0;
                  const minStockLimit = product.min_stock !== null && product.min_stock !== undefined ? product.min_stock : 5;
                  const isLowStock = product.stock > 0 && product.stock <= minStockLimit;
                  const stockBadgeColor = isOutOfStock ? theme.danger : isLowStock ? '#F59E0B' : theme.accent;
                  const stockBadgeBg = isOutOfStock ? theme.danger + '15' : isLowStock ? '#F59E0B15' : theme.accent + '15';

                  return (
                    <View key={product.id} style={[styles.productCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                      {/* INFO DEL PRODUCTO */}
                      <View style={{ flex: 1 }}>
                        {product.code ? (
                          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.5, marginBottom: 2 }}>
                            #{product.code}
                          </Text>
                        ) : null}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                          <Text style={[styles.productName, { color: theme.text, flexShrink: 1, marginRight: 5 }]} numberOfLines={1}>
                            {product.name}
                          </Text>
                          {(String(product.id).startsWith('temp_') || product.hasPendingChanges) ? (
                            <Ionicons name="cloud-offline-outline" size={14} color="#F59E0B" />
                          ) : (
                            <Ionicons name="cloud-done-outline" size={14} color="#10B981" />
                          )}
                        </View>
                        {product.description ? (
                          <Text style={[styles.productDesc, { color: theme.textSecondary }]} numberOfLines={2}>{product.description}</Text>
                        ) : null}

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
                          <Text style={[styles.productPrice, { color: theme.accent }]}>
                            $ {formatNumber(parseFloat(product.price))}
                          </Text>

                          {product.cost_price !== null && product.cost_price !== undefined && product.cost_price !== 0 && (
                            <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                              Costo: ${formatNumber(parseFloat(product.cost_price))}
                            </Text>
                          )}

                          {product.profit_margin !== null && product.profit_margin !== undefined && product.profit_margin !== 0 && (
                            <View style={{ backgroundColor: isDarkMode ? '#2E7D3230' : '#E8F5E9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#4CAF50' }}>
                                +{product.profit_margin}%
                              </Text>
                            </View>
                          )}

                          <View style={[styles.stockBadge, { backgroundColor: stockBadgeBg }]}>
                            <View style={[styles.stockDot, { backgroundColor: stockBadgeColor }]} />
                            <Text style={[styles.stockText, { color: stockBadgeColor }]}>
                              Stock: {product.stock}
                            </Text>
                          </View>

                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: isDarkMode ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.08)',
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 12,
                          }}>
                            <Ionicons name="layers-outline" size={11} color="#8B5CF6" style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#8B5CF6' }}>
                              Lotes: {product.total_batches || 0} ({product.available_batches || 0} disp.)
                            </Text>
                          </View>
                        </View>

                        {product.created_at ? (
                          <Text style={{ fontSize: 10, color: theme.textSecondary, marginTop: 6 }}>
                            Creado: {formatDateToLocal(product.created_at)}
                          </Text>
                        ) : null}
                      </View>

                      {/* BOTONES DE ACCIÓN - fila debajo */}
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          onPress={() => openRechargeModal(product)}
                          style={[styles.actionBtn, { backgroundColor: '#10B98115', flex: 1 }]}
                        >
                          <Ionicons name="add-circle" size={18} color="#10B981" />
                          {!isMobile && <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '600', marginLeft: 4 }}>Recargar</Text>}
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => openBatchesModal(product)}
                          style={[styles.actionBtn, { backgroundColor: '#8B5CF615', flex: 1 }]}
                        >
                          <Ionicons name="time" size={18} color="#8B5CF6" />
                          {!isMobile && <Text style={{ fontSize: 11, color: '#8B5CF6', fontWeight: '600', marginLeft: 4 }}>Lotes</Text>}
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => openEditModal(product)}
                          style={[styles.actionBtn, { backgroundColor: theme.accent + '15', flex: 1 }]}
                        >
                          <Ionicons name="create" size={18} color={theme.accent} />
                          {!isMobile && <Text style={{ fontSize: 11, color: theme.accent, fontWeight: '600', marginLeft: 4 }}>Editar</Text>}
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => openDeleteModal(product)}
                          style={[styles.actionBtn, { backgroundColor: theme.danger + '15', flex: 1 }]}
                        >
                          <Ionicons name="trash" size={18} color={theme.danger} />
                          {!isMobile && <Text style={{ fontSize: 11, color: theme.danger, fontWeight: '600', marginLeft: 4 }}>Eliminar</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

        </ScrollView>

        {/* MODAL DE EXPORTACIÓN */}
        <Modal
          visible={exportModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setExportModalVisible(false)}
        >
          <Pressable style={[styles.modalOverlay, {
            padding: isMobile ? 10 : 20
          }]} onPress={() => setExportModalVisible(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: theme.card, maxWidth: 450, alignSelf: 'center', borderRadius: 20, padding: isMobile ? 10 : 20 }]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.modalTitle, { textAlign: 'left', marginBottom: 2, fontSize: 18, color: theme.text }]}>Exportar Inventario</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Selecciona los productos a exportar</Text>
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
                  Descarga el catálogo de productos y stock en formato Excel (.xlsx).
                </Text>

                <TouchableOpacity
                  style={[styles.exportBtn, { backgroundColor: theme.accent }]}
                  onPress={() => handleExportProducts('all')}
                >
                  <Ionicons name="document-text-outline" size={20} color="#FFF" />
                  <Text style={styles.exportBtnText}>Todo el inventario ({products.length})</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.exportBtn, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }]}
                  onPress={() => handleExportProducts('filtered')}
                >
                  <Ionicons name="funnel-outline" size={20} color={theme.text} />
                  <Text style={[styles.exportBtnText, { color: theme.text }]}>Productos filtrados/buscados ({processedProducts.length})</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* FAB PARA CREAR PRODUCTO */}
        <TouchableOpacity onPress={() => { clearForm(); setModalVisible(true); }} style={[styles.fab, { backgroundColor: theme.accent }]}>
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>

        {/* MODAL CREAR / EDITAR PRODUCTO */}
        <Modal
          visible={modalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          <Pressable style={[styles.modalOverlay, {
            padding: isMobile ? 10 : 20
          }]} onPress={() => setModalVisible(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: theme.card, padding: isMobile ? 10 : 20 }]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingId ? 'Editar Producto' : 'Nuevo Producto'}
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <View style={{ width: '38%' }}>
                  <Input
                    label="Código *"
                    placeholder="Ej. CER01"
                    value={code}
                    onChangeText={setCode}
                  />
                </View>

                <View style={{ width: '58%' }}>
                  <Input
                    label="Nombre *"
                    placeholder="Ej. Cerveza Corona 355ml"
                    value={name}
                    onChangeText={setName}
                  />
                </View>
              </View>

              <Input
                label="Descripción (Opcional)"
                placeholder="Ej. Bebida embotellada fría"
                value={description}
                onChangeText={setDescription}
                multiline={true}
                numberOfLines={3}
              />

              {/* Campos condicionales para Stock / Costo sólo en creación */}
              {!editingId ? (
                <>
                  <View style={{ height: 1, backgroundColor: theme.border || 'rgba(0,0,0,0.08)', marginVertical: 10 }} />
                  <Text style={[styles.inputLabel, { color: theme.accent, fontSize: 13, marginBottom: 8 }]}>
                    Carga de Stock Inicial (Opcional)
                  </Text>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ width: '48%' }}>
                      <Input
                        label="Costo Neto ($)"
                        placeholder="Ej. 2000"
                        value={costPrice}
                        onChangeText={handleCostPriceChange}
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={{ width: '48%' }}>
                      <Input
                        label="Ganancia (%)"
                        placeholder="Ej. 30"
                        value={profitMargin}
                        onChangeText={handleProfitMarginChange}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ width: '34%' }}>
                      <Input
                        label="Precio Público ($)"
                        placeholder="Ej. 2600"
                        value={price}
                        onChangeText={handlePriceChange}
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={{ width: '31%' }}>
                      <Input
                        label="Stock Inicial"
                        placeholder="Ej. 24"
                        value={stock}
                        onChangeText={setStock}
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={{ width: '31%' }}>
                      <Input
                        label="Alerta Stock *"
                        placeholder="Ej. 5"
                        value={minStock}
                        onChangeText={setMinStock}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </>
              ) : (
                <View style={{ width: '100%', marginTop: 5 }}>
                  <Input
                    label="Alerta Stock *"
                    placeholder="Ej. 5"
                    value={minStock}
                    onChangeText={setMinStock}
                    keyboardType="numeric"
                  />
                </View>
              )}

              <View style={styles.modalButtons}>
                <Button
                  title="Cancelar"
                  onPress={() => setModalVisible(false)}
                  variant="secondary"
                  style={{ flex: 1 }}
                  loading={false}
                />
                <Button
                  title="Guardar"
                  onPress={handleSaveProduct}
                  variant="primary"
                  loading={isSavingClient}
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* MODAL CONFIRMACIÓN ELIMINACIÓN */}
        <Modal
          visible={deleteModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setDeleteModalVisible(false)}
        >
          <Pressable style={[styles.modalOverlay, {
            padding: isMobile ? 10 : 20
          }]} onPress={() => setDeleteModalVisible(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: theme.card, padding: isMobile ? 10 : 20 }]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Eliminar Producto</Text>
              <Text style={{ color: theme.textSecondary, marginBottom: 20, textAlign: 'center', fontSize: 16 }}>
                ¿Seguro que deseas eliminar este producto del inventario? Esta acción no se puede deshacer.
              </Text>
              <View style={styles.modalButtons}>
                <Button
                  title="Cancelar"
                  onPress={() => setDeleteModalVisible(false)}
                  variant="secondary"
                  loading={false}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Eliminar"
                  onPress={confirmDelete}
                  loading={isSavingClient}
                  variant="danger"
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* MODAL RECARGAR STOCK */}
        <Modal
          visible={rechargeModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setRechargeModalVisible(false)}
        >
          <Pressable style={[styles.modalOverlay, {
            padding: isMobile ? 10 : 20
          }]} onPress={() => setRechargeModalVisible(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: theme.card, padding: isMobile ? 10 : 20 }]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Recargar Stock</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 15 }}>
                Producto: {selectedProductForRecharge?.name}
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <View style={{ width: '48%' }}>
                  <Input
                    label="Costo Neto ($) *"
                    placeholder="Ej. 2000"
                    value={rechargeCost}
                    onChangeText={handleRechargeCostChange}
                    keyboardType="numeric"
                  />
                </View>

                <View style={{ width: '48%' }}>
                  <Input
                    label="Ganancia (%) *"
                    placeholder="Ej. 30"
                    value={rechargeMargin}
                    onChangeText={handleRechargeMarginChange}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <View style={{ width: '48%' }}>
                  <Input
                    label="Precio Público ($) *"
                    placeholder="Ej. 2600"
                    value={rechargePrice}
                    onChangeText={handleRechargePriceChange}
                    keyboardType="numeric"
                  />
                </View>

                <View style={{ width: '48%' }}>
                  <Input
                    label="Cant. a Cargar *"
                    placeholder="Ej. 50"
                    value={rechargeQty}
                    onChangeText={setRechargeQty}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.modalButtons}>
                <Button
                  title="Cancelar"
                  onPress={() => setRechargeModalVisible(false)}
                  variant="secondary"
                  loading={false}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Cargar"
                  onPress={handleSaveRecharge}
                  loading={isSavingClient}
                  variant="primary"
                  backgroundColor="#10B981"
                  hoverBackgroundColor="#059669"
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* MODAL HISTORIAL DE LOTES / RECARGAS */}
        <Modal
          visible={batchesModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setBatchesModalVisible(false)}
        >
          <Pressable style={[styles.modalOverlay, {
            padding: isMobile ? 10 : 20
          }]} onPress={() => setBatchesModalVisible(false)}>
            <Pressable style={[
              styles.modalContent,
              {
                backgroundColor: theme.card,
                height: isMobile ? '80%' : '75%',
                width: '90%',
                maxWidth: 450,
                padding: isMobile ? 16 : 20
              }
            ]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 0 }]}>Historial de Lotes</Text>
                <TouchableOpacity onPress={() => setBatchesModalVisible(false)} style={{ padding: 5 }}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>

              <Text style={{ color: theme.textSecondary, fontSize: 14, fontWeight: '700', marginBottom: 15 }}>
                Producto: {selectedProductForBatches?.name}
              </Text>

              <View style={{ flex: 1, marginBottom: 15 }}>
                {loadingBatches ? (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.accent} />
                    <Text style={{ marginTop: 10, color: theme.textSecondary }}>Cargando lotes...</Text>
                  </View>
                ) : productBatches.length === 0 ? (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
                    <Ionicons name="layers-outline" size={40} color={theme.textSecondary} style={{ marginBottom: 10 }} />
                    <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>No hay recargas registradas para este producto.</Text>
                  </View>
                ) : (
                  <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    {productBatches.map((batch, index) => {
                      const isAgotado = batch.quantity === 0;
                      return (
                        <View
                          key={batch.id || index.toString()}
                          style={[
                            {
                              backgroundColor: theme.background,
                              borderColor: isAgotado ? theme.border : '#10B98130',
                              borderWidth: 1,
                              borderRadius: 12,
                              padding: 12,
                              marginBottom: 10
                            }
                          ]}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: theme.textSecondary }}>
                                Recarga: {formatDateToLocal(batch.created_at)}
                              </Text>
                              {String(batch.id).startsWith('temp_') ? (
                                <Ionicons name="cloud-offline-outline" size={12} color="#F59E0B" />
                              ) : (
                                <Ionicons name="cloud-done-outline" size={12} color="#10B981" />
                              )}
                            </View>
                            <View style={{
                              backgroundColor: isAgotado ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 6
                            }}>
                              <Text style={{
                                fontSize: 10,
                                fontWeight: '700',
                                color: isAgotado ? theme.danger : '#10B981'
                              }}>
                                {isAgotado ? 'Agotado' : `${batch.quantity} / ${batch.initial_quantity} u.`}
                              </Text>
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                            <Text style={{ fontSize: 12, color: theme.text }}>
                              Costo: <Text style={{ fontWeight: '700' }}>${formatNumber(batch.cost_price)}</Text>
                            </Text>
                            <Text style={{ fontSize: 12, color: theme.text }}>
                              Precio: <Text style={{ fontWeight: '700', color: theme.accent }}>${formatNumber(batch.price)}</Text>
                            </Text>
                            {batch.profit_margin !== null && (
                              <Text style={{ fontSize: 12, color: '#4CAF50', fontWeight: '700' }}>
                                +{batch.profit_margin}%
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <TouchableOpacity
                style={[styles.filterApplyBtn, { backgroundColor: theme.accent, marginTop: 0 }]}
                onPress={() => setBatchesModalVisible(false)}
              >
                <Text style={styles.filterApplyBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* MODAL DE FILTROS Y ORDENAMIENTO */}
        <Modal
          visible={filterMenuVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setFilterMenuVisible(false)}
        >
          <Pressable style={[styles.modalOverlay, {
            padding: isMobile ? 10 : 20
          }]} onPress={() => setFilterMenuVisible(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: theme.card, maxWidth: 360, padding: isMobile ? 10 : 20 }]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>
              <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 15 }]}>Organizar y Filtrar</Text>

              {/* ORDENAR POR CATEGORÍA */}
              <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Ordenar por</Text>

              {/* Nombre */}
              <Text style={[styles.subFilterLabel, { color: theme.textSecondary }]}>Nombre de Producto</Text>
              <View style={styles.filterGroupRow}>
                <TouchableOpacity
                  style={[styles.filterBadge, sortBy === 'name_asc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  onPress={() => setSortBy('name_asc')}
                >
                  <Text style={[styles.filterBadgeText, { color: sortBy === 'name_asc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'name_asc' ? '700' : 'normal' }]}>A - Z</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterBadge, sortBy === 'name_desc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  onPress={() => setSortBy('name_desc')}
                >
                  <Text style={[styles.filterBadgeText, { color: sortBy === 'name_desc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'name_desc' ? '700' : 'normal' }]}>Z - A</Text>
                </TouchableOpacity>
              </View>

              {/* Stock */}
              <Text style={[styles.subFilterLabel, { color: theme.textSecondary }]}>Cantidad (Stock)</Text>
              <View style={styles.filterGroupRow}>
                <TouchableOpacity
                  style={[styles.filterBadge, sortBy === 'stock_desc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  onPress={() => setSortBy('stock_desc')}
                >
                  <Text style={[styles.filterBadgeText, { color: sortBy === 'stock_desc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'stock_desc' ? '700' : 'normal' }]}>Mayor Stock</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterBadge, sortBy === 'stock_asc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  onPress={() => setSortBy('stock_asc')}
                >
                  <Text style={[styles.filterBadgeText, { color: sortBy === 'stock_asc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'stock_asc' ? '700' : 'normal' }]}>Menor Stock</Text>
                </TouchableOpacity>
              </View>

              {/* Precio */}
              <Text style={[styles.subFilterLabel, { color: theme.textSecondary }]}>Precio</Text>
              <View style={styles.filterGroupRow}>
                <TouchableOpacity
                  style={[styles.filterBadge, sortBy === 'price_desc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  onPress={() => setSortBy('price_desc')}
                >
                  <Text style={[styles.filterBadgeText, { color: sortBy === 'price_desc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'price_desc' ? '700' : 'normal' }]}>Mayor Precio</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterBadge, sortBy === 'price_asc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  onPress={() => setSortBy('price_asc')}
                >
                  <Text style={[styles.filterBadgeText, { color: sortBy === 'price_asc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'price_asc' ? '700' : 'normal' }]}>Menor Precio</Text>
                </TouchableOpacity>
              </View>

              {/* FILTRAR POR STOCK */}
              <Text style={[styles.filterLabel, { color: theme.textSecondary, marginTop: 15 }]}>Filtrar por Disponibilidad</Text>
              <View style={styles.filterGroupRow}>
                <TouchableOpacity
                  style={[styles.filterBadge, stockFilter === 'all' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  onPress={() => setStockFilter('all')}
                >
                  <Text style={[styles.filterBadgeText, { color: stockFilter === 'all' ? '#FFF' : theme.textSecondary, fontWeight: stockFilter === 'all' ? '700' : 'normal' }]}>Todos</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterBadge, stockFilter === 'in' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  onPress={() => setStockFilter('in')}
                >
                  <Text style={[styles.filterBadgeText, { color: stockFilter === 'in' ? '#FFF' : theme.textSecondary, fontWeight: stockFilter === 'in' ? '700' : 'normal' }]}>Disponible</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterBadge, stockFilter === 'low' && { backgroundColor: '#F59E0B', borderColor: '#F59E0B' }]}
                  onPress={() => setStockFilter('low')}
                >
                  <Text style={[styles.filterBadgeText, { color: stockFilter === 'low' ? '#FFF' : theme.textSecondary, fontWeight: stockFilter === 'low' ? '700' : 'normal' }]}>Stock Bajo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterBadge, stockFilter === 'out' && { backgroundColor: theme.danger, borderColor: theme.danger }]}
                  onPress={() => setStockFilter('out')}
                >
                  <Text style={[styles.filterBadgeText, { color: stockFilter === 'out' ? '#FFF' : theme.textSecondary, fontWeight: stockFilter === 'out' ? '700' : 'normal' }]}>Agotado</Text>
                </TouchableOpacity>
              </View>

              {/* BOTÓN APLICAR */}
              <TouchableOpacity
                style={[styles.filterApplyBtn, { backgroundColor: theme.accent }]}
                onPress={() => setFilterMenuVisible(false)}
              >
                <Text style={styles.filterApplyBtnText}>Aplicar Filtros</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

      </KeyboardAvoidingView>
    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  filterMenuBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    height: 48,
    borderRadius: 12,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  list: {
    flexDirection: 'column',
  },
  productCard: {
    flexDirection: 'column',
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
  },
  productDesc: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '800',
    marginRight: 12,
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  stockText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 25,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalInput: {
    padding: 12,
    borderRadius: 12,
    fontSize: 15,
    marginBottom: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  modalBtnCancel: {
    padding: 15,
    flex: 0.48,
    alignItems: 'center',
    borderRadius: 12,
  },
  modalBtnText: {
    fontWeight: '600',
    fontSize: 16,
  },
  modalBtnSave: {
    padding: 15,
    flex: 0.48,
    alignItems: 'center',
    borderRadius: 12,
  },
  modalBtnTextSave: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
  // Filter Styles
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  subFilterLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 5,
    marginTop: 5,
  },
  filterGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 5,
  },
  filterBadge: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  filterBadgeText: {
    fontSize: 13,
  },
  filterApplyBtn: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  filterApplyBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
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
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    marginBottom: 5,
  },
  closeModalBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
