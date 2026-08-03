import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Modal, ActivityIndicator, KeyboardAvoidingView, useWindowDimensions, Alert, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme/ThemeContext';
import { useAuth } from '../../../context/AuthContext';
import { useShop } from '../../../context/ShopContext';
import { useToast } from '../../../context/ToastContext';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { apiFetch } from '../../../utils/offlineSync';
import { formatDateToLocal } from '../../../utils/dateUtils';
import SidebarLayout from '../../../navigation/SidebarLayout';
import Input from '../../../components/Input';
import Button from '../../../components/Button';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export default function POSScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { activeShop } = useShop();
  const { showToast } = useToast();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const [isSavingClient, setIsSavingClient] = useState(false);

  // Pestaña activa en celulares: 'products' o 'cart'
  const [activeTab, setActiveTab] = useState('products');

  // Estados de datos generales
  const [products, setProducts] = useState([]);
  const [debtors, setDebtors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Estados para Pedidos en Cola (Mesas)
  const [orders, setOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [cart, setCart] = useState([]); // Sincronizado con los items de la orden activa
  const [loadingItems, setLoadingItems] = useState(false);

  // Modal para Nueva Orden (Mesa)
  const [newOrderModalVisible, setNewOrderModalVisible] = useState(false);
  const [newOrderReference, setNewOrderReference] = useState('');

  // Estados de Pago / Checkout
  const [saleType, setSaleType] = useState('cash'); // 'cash' o 'credit'
  const [selectedDebtor, setSelectedDebtor] = useState(null);
  const [debtorSearch, setDebtorSearch] = useState('');
  const [debtorDropdownVisible, setDebtorDropdownVisible] = useState(false);
  const [savingSale, setSavingSale] = useState(false);

  // Solo el dueño de la tienda puede vender a crédito (deuda)
  const canSellOnCredit = !!activeShop && (activeShop.is_owner === true || activeShop.member_role === 'owner');

  // Modal para agregar deudor rápido
  const [newDebtorModalVisible, setNewDebtorModalVisible] = useState(false);
  const [newDebtorName, setNewDebtorName] = useState('');
  const [newDebtorPhone, setNewDebtorPhone] = useState('');

  // Modal de confirmación personalizado para eliminar pedido
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);

  // Modal de historial/trazabilidad del pedido
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [orderHistory, setOrderHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Modal de cantidad (digitar unidades)
  const [qtyModalVisible, setQtyModalVisible] = useState(false);
  const [qtyModalMode, setQtyModalMode] = useState('addFromCatalog'); // 'addFromCatalog' | 'add' | 'remove'
  const [qtyModalProduct, setQtyModalProduct] = useState(null); // Para agregar desde catálogo
  const [qtyModalTargetItem, setQtyModalTargetItem] = useState(null); // Para líneas del carrito
  const [qtyInput, setQtyInput] = useState('1');
  const [qtyMax, setQtyMax] = useState(1);

  // Cargar productos del servidor
  const fetchProducts = async () => {
    try {
      const headers = { 'x-user-id': user ? user.id.toString() : '', 'x-shop-id': activeShop ? activeShop.id.toString() : '' };
      const res = await apiFetch(`${API_URL}/products`, { headers });
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al actualizar productos:', error);
    }
  };

  // Cargar productos, deudores y órdenes pendientes del servidor
  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = { 'x-user-id': user ? user.id.toString() : '', 'x-shop-id': activeShop ? activeShop.id.toString() : '' };

      const [resDebtors, resOrders] = await Promise.all([
        apiFetch(`${API_URL}/debtors`, { headers }),
        apiFetch(`${API_URL}/orders`, { headers })
      ]);

      const dataDebtors = await resDebtors.json();
      const dataOrders = await resOrders.json();

      await fetchProducts();
      setDebtors(Array.isArray(dataDebtors) ? dataDebtors : []);

      const ordersList = Array.isArray(dataOrders) ? dataOrders : [];
      setOrders(ordersList);

      // Si hay una orden activa seleccionada, actualizar su estado o verificar si aún existe
      if (activeOrder) {
        const stillExists = ordersList.find(o => o.id.toString() === activeOrder.id.toString());
        if (stillExists) {
          fetchOrderItems(activeOrder.id);
        } else {
          setActiveOrder(null);
          setCart([]);
        }
      }
    } catch (error) {
      console.error('Error al cargar datos del POS:', error);
    } finally {
      setLoading(false);
    }
  };

  // Cargar los artículos consumidos de la orden activa
  const fetchOrderItems = async (orderId) => {
    try {
      setLoadingItems(true);
      const response = await apiFetch(`${API_URL}/orders/${orderId}/items`, {
        headers: { 'x-user-id': user ? user.id.toString() : '', 'x-shop-id': activeShop ? activeShop.id.toString() : '' }
      });
      const data = await response.json();
      if (response.ok) {
        setCart(Array.isArray(data) ? data : []);
        // Sincronizar catálogo de productos en el POS
        fetchProducts();
      }
      setLoadingItems(false);
    } catch (error) {
      console.error('Error al cargar items de la orden:', error);
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchData();
    }
  }, [isFocused, activeShop]);

  // Manejar selección de orden/mesa
  const handleSelectOrder = (order) => {
    setActiveOrder(order);
    fetchOrderItems(order.id);
  };

  // Crear nueva mesa/pedido en cola
  const handleCreateOrder = async () => {
    if (!newOrderReference.trim()) {
      showToast('Debes ingresar un nombre o referencia para el pedido.', 'warning');
      return;
    }

    setIsSavingClient(true);
    try {
      const response = await apiFetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user ? user.id.toString() : '',
          'x-shop-id': activeShop ? activeShop.id.toString() : ''
        },
        body: JSON.stringify({ reference: newOrderReference.trim() })
      });

      const data = await response.json();
      if (response.ok && (data.id || data.offline)) {
        setNewOrderReference('');
        setNewOrderModalVisible(false);

        // Recargar órdenes y seleccionar la recién creada
        const headers = { 'x-user-id': user ? user.id.toString() : '', 'x-shop-id': activeShop ? activeShop.id.toString() : '' };
        const resOrders = await apiFetch(`${API_URL}/orders`, { headers });
        const dataOrders = await resOrders.json();
        const updatedOrders = Array.isArray(dataOrders) ? dataOrders : [];
        setOrders(updatedOrders);

        const created = updatedOrders.find(o => o.id === data.id);
        if (created) {
          handleSelectOrder(created);
        }
        showToast('Pedido abierto correctamente.', 'success');
      } else {
        showToast('Error al crear el pedido: ' + (data.error || 'Intenta de nuevo.'), 'error');
      }
    } catch (error) {
      console.error('Error al crear orden:', error);
      showToast('Error de red al registrar el pedido.', 'error');
    } finally {
      setIsSavingClient(false);
    }
  };

  // Eliminar/Cancelar pedido completo (Iniciador)
  const handleDeleteOrder = (orderId, reference) => {
    setOrderToDelete({ id: orderId, reference });
    setDeleteModalVisible(true);
  };

  // Confirmar y realizar la eliminación física en backend
  const confirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      const response = await apiFetch(`${API_URL}/orders/${orderToDelete.id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user ? user.id.toString() : '', 'x-shop-id': activeShop ? activeShop.id.toString() : '' }
      });
      if (response.ok) {
        if (activeOrder && activeOrder.id === orderToDelete.id) {
          setActiveOrder(null);
          setCart([]);
        }
        fetchData();
        showToast('Pedido cancelado y eliminado.', 'success');
      } else {
        showToast('No se pudo eliminar el pedido.', 'error');
      }
    } catch (error) {
      console.error('Error al eliminar orden:', error);
      showToast('Error de red al eliminar el pedido.', 'error');
    } finally {
      setDeleteModalVisible(false);
      setOrderToDelete(null);
    }
  };

  // Agregar un producto al pedido activo (qty por defecto 1)
  const addToCart = async (product, qty = 1) => {
    if (!activeOrder) {
      showToast('Por favor, selecciona o crea un pedido primero.', 'warning');
      return;
    }

    const qtyToAdd = parseInt(qty, 10) || 1;
    if (qtyToAdd <= 0) {
      showToast('La cantidad debe ser mayor a 0.', 'warning');
      return;
    }

    if (product.stock <= 0) {
      showToast('Este producto no tiene stock disponible en el inventario.', 'error');
      return;
    }

    if (qtyToAdd > product.stock) {
      showToast(`Stock insuficiente. Solo quedan ${product.stock} unidades.`, 'warning');
      return;
    }

    try {
      const response = await apiFetch(`${API_URL}/orders/${activeOrder.id}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user ? user.id.toString() : '',
          'x-shop-id': activeShop ? activeShop.id.toString() : ''
        },
        body: JSON.stringify({
          product_id: product.id,
          quantity: qtyToAdd
        })
      });

      if (response.ok) {
        fetchOrderItems(activeOrder.id);
        showToast(qtyToAdd > 1 ? `${qtyToAdd} unidades agregadas al pedido.` : 'Producto agregado al pedido.', 'success');
      } else {
        const err = await response.json();
        showToast('Error al agregar item: ' + (err.error || 'Intenta nuevamente.'), 'error');
      }
    } catch (error) {
      console.error('Error al agregar item:', error);
    }
  };

  // Modificar cantidad de un producto consumido en el pedido
  const updateQuantity = async (productId, newQty, additionalStock, itemId) => {
    if (!activeOrder) return;

    if (newQty <= 0) {
      removeFromCart(itemId);
      return;
    }

    // Calcular la diferencia con la cantidad actual en el carrito
    const oldItem = cart.find(item => item.id === itemId);
    const oldQty = oldItem ? oldItem.quantity : 0;
    const diff = newQty - oldQty;

    // Si se quiere sumar stock, verificar el stock libre adicional disponible en base de datos
    if (diff > 0 && diff > additionalStock) {
      showToast(`No hay stock suficiente. El inventario libre tiene solo ${additionalStock} unidades más.`, 'warning');
      return;
    }

    try {
      const response = await apiFetch(`${API_URL}/orders/${activeOrder.id}/items/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user ? user.id.toString() : '',
          'x-shop-id': activeShop ? activeShop.id.toString() : ''
        },
        body: JSON.stringify({ quantity: newQty })
      });

      if (response.ok) {
        fetchOrderItems(activeOrder.id);
      } else {
        const err = await response.json();
        showToast('Error al modificar cantidad: ' + (err.error || 'Intenta de nuevo.'), 'error');
      }
    } catch (error) {
      console.error('Error al actualizar cantidad:', error);
    }
  };

  // --- FUNCIONES DEL MODAL DE CANTIDAD ---
  // Abrir modal para agregar unidades desde el catálogo
  const openAddFromCatalog = (product) => {
    if (product.stock <= 0) {
      showToast('Este producto no tiene stock disponible en el inventario.', 'error');
      return;
    }
    setQtyModalMode('addFromCatalog');
    setQtyModalProduct(product);
    setQtyModalTargetItem(null);
    setQtyMax(product.stock);
    setQtyInput('1');
    setQtyModalVisible(true);
  };

  // Abrir modal para AGREGAR más unidades a una línea existente del carrito
  const openAddQty = (item) => {
    if (item.stock <= 0) {
      showToast('No hay stock libre adicional para este producto.', 'error');
      return;
    }
    setQtyModalMode('add');
    setQtyModalTargetItem(item);
    setQtyModalProduct(null);
    setQtyMax(item.stock);
    setQtyInput('1');
    setQtyModalVisible(true);
  };

  // Abrir modal para QUITAR unidades de una línea existente del carrito
  const openRemoveQty = (item) => {
    if (item.quantity <= 1) {
      // Si solo hay 1, quitarlo directamente
      removeFromCart(item.id);
      return;
    }
    setQtyModalMode('remove');
    setQtyModalTargetItem(item);
    setQtyModalProduct(null);
    setQtyMax(item.quantity);
    setQtyInput('1');
    setQtyModalVisible(true);
  };

  // Cargar el historial de movimientos del pedido activo
  const fetchOrderHistory = async () => {
    if (!activeOrder) {
      showToast('Selecciona un pedido primero.', 'warning');
      return;
    }
    try {
      setLoadingHistory(true);
      const response = await apiFetch(`${API_URL}/orders/${activeOrder.id}/history`, {
        headers: { 'x-user-id': user ? user.id.toString() : '', 'x-shop-id': activeShop ? activeShop.id.toString() : '' }
      });
      const data = await response.json();
      if (response.ok) {
        setOrderHistory(Array.isArray(data) ? data : []);
      } else {
        showToast('No se pudo cargar el historial.', 'error');
      }
    } catch (error) {
      console.error('Error al cargar historial del pedido:', error);
      showToast('Error de red al cargar el historial.', 'error');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Abrir el modal de historial
  const openHistoryModal = () => {
    if (!activeOrder) return;
    setHistoryModalVisible(true);
    fetchOrderHistory();
  };

  // Confirmar la cantidad digitada en el modal
  const handleConfirmQty = () => {
    const qty = parseInt(qtyInput, 10);
    if (!qty || qty <= 0) {
      showToast('Ingresa una cantidad válida.', 'warning');
      return;
    }
    if (qty > qtyMax) {
      showToast(`La cantidad máxima permitida es ${qtyMax} unidades.`, 'warning');
      return;
    }

    if (qtyModalMode === 'addFromCatalog' && qtyModalProduct) {
      addToCart(qtyModalProduct, qty);
    } else if (qtyModalMode === 'add' && qtyModalTargetItem) {
      // Sumar a lo ya consumido: nueva cantidad total = actual + qty
      const item = qtyModalTargetItem;
      updateQuantity(item.product_id, item.quantity + qty, item.stock, item.id);
    } else if (qtyModalMode === 'remove' && qtyModalTargetItem) {
      // Restar de lo ya consumido: nueva cantidad total = actual - qty
      const item = qtyModalTargetItem;
      updateQuantity(item.product_id, item.quantity - qty, item.stock, item.id);
    }

    setQtyModalVisible(false);
  };

  // Eliminar un artículo de la mesa activa
  const removeFromCart = async (itemId) => {
    if (!activeOrder) return;

    try {
      const response = await apiFetch(`${API_URL}/orders/${activeOrder.id}/items/${itemId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user ? user.id.toString() : '', 'x-shop-id': activeShop ? activeShop.id.toString() : '' }
      });

      if (response.ok) {
        fetchOrderItems(activeOrder.id);
        showToast('Artículo eliminado del pedido.', 'info');
      } else {
        showToast('No se pudo eliminar el artículo.', 'error');
      }
    } catch (error) {
      console.error('Error al eliminar item:', error);
    }
  };

  // Limpiar/Cerrar la venta activa (vaciar selección)
  const clearSelection = () => {
    setActiveOrder(null);
    setCart([]);
    setSaleType('cash');
    setSelectedDebtor(null);
    setDebtorSearch('');
  };

  // Si el usuario NO es dueño, forzar siempre venta en efectivo
  useEffect(() => {
    if (!canSellOnCredit && saleType === 'credit') {
      setSaleType('cash');
      setSelectedDebtor(null);
    }
  }, [canSellOnCredit, saleType]);

  // Registrar venta final (Checkout de la mesa activa)
  const handleCheckout = async () => {
    if (!activeOrder) return;

    if (cart.length === 0) {
      showToast('El pedido no tiene ningún artículo.', 'warning');
      return;
    }

    if (saleType === 'credit' && !selectedDebtor) {
      showToast('Por favor selecciona el cliente que asumirá la deuda.', 'warning');
      return;
    }

    try {
      setSavingSale(true);
      const response = await apiFetch(`${API_URL}/orders/${activeOrder.id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user ? user.id.toString() : '',
          'x-shop-id': activeShop ? activeShop.id.toString() : ''
        },
        body: JSON.stringify({
          debtor_id: saleType === 'credit' ? selectedDebtor.id : null
        })
      });

      const data = await response.json();
      if (response.ok && (data.success || data.offline)) {
        showToast(`¡Venta Registrada! Facturado correctamente por $ ${formatNumber(data.total)}.`, 'success');
        clearSelection();
        fetchData(); // Recargar todo
        if (isMobile) setActiveTab('products');
      } else {
        showToast('Error al facturar el pedido: ' + (data.error || 'Intenta nuevamente.'), 'error');
      }
    } catch (error) {
      console.error('Error en checkout de orden:', error);
      showToast('Error de red al procesar el pago.', 'error');
    } finally {
      setSavingSale(false);
    }
  };

  // Crear deudor express
  const handleCreateDebtor = async () => {
    if (!newDebtorName.trim()) {
      showToast('El nombre es obligatorio.', 'warning');
      return;
    }

    const payload = {
      name: newDebtorName.trim(),
      phone: newDebtorPhone.trim() || null
    };

    try {
      const response = await apiFetch(`${API_URL}/debtors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user ? user.id.toString() : '',
          'x-shop-id': activeShop ? activeShop.id.toString() : ''
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (response.ok && (data.id || data.offline)) {
        setSelectedDebtor(data || { name: payload.name });
        setDebtorSearch(data.name);
        setDebtorDropdownVisible(false);
        setNewDebtorModalVisible(false);
        setNewDebtorName('');
        setNewDebtorPhone('');
        fetchData();
        showToast('Cliente creado y seleccionado correctamente.', 'success');
      } else {
        showToast('Error al crear el cliente: ' + (data.error || 'Intenta de nuevo.'), 'error');
      }
    } catch (error) {
      console.error('Error al crear deudor express:', error);
      showToast('Error al registrar el cliente.', 'error');
    }
  };

  // Filtrar productos por búsqueda
  const filteredProducts = products.filter(p => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q));
  });

  // Filtrar deudores por búsqueda en dropdown
  const filteredDebtors = debtors.filter(d =>
    d.name.toLowerCase().includes(debtorSearch.toLowerCase())
  );

  // Totales de la orden activa
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cart.reduce((sum, item) => sum + parseFloat(item.subtotal || (item.quantity * item.price)), 0);

  // Agrupar items del carrito por producto para mostrar desglose de precios
  const groupedCart = Object.values(
    cart.reduce((acc, item) => {
      const key = item.product_id.toString();
      if (!acc[key]) {
        acc[key] = {
          product_id: item.product_id,
          name: item.name,
          code: item.code,
          stock: item.stock,
          lines: [],
          totalQty: 0,
          totalSubtotal: 0
        };
      }
      acc[key].lines.push(item);
      acc[key].totalQty += parseInt(item.quantity, 10);
      acc[key].totalSubtotal += parseFloat(item.subtotal || (item.quantity * item.price));
      return acc;
    }, {})
  );

  const handleRefresh = () => {
    setLoading(true);
    fetchData();
  };

  const headerRightComponent = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Button
        onPress={openHistoryModal}
        variant="secondary"
        style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
        icon={<Ionicons name="time-outline" size={20} color={theme.text} />}
      />
      <Button
        onPress={handleRefresh}
        variant="secondary"
        style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
        icon={<Ionicons name="refresh-outline" size={20} color={theme.text} />}
      />
    </View>
  );

  return (
    <SidebarLayout navigation={navigation} title="Punto de Venta" activeRoute="POS" headerRight={headerRightComponent}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

        {/* --- SECCIÓN DE PEDIDOS / CUENTAS PENDIENTES --- */}
        <View style={[styles.ordersBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: isMobile ? 10 : 15, paddingBottom: 10 }}>
            <Button
              onPress={() => navigation.goBack()}
              variant="secondary"
              style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, marginRight: 10, borderWidth: 0 }]}
              icon={<Ionicons name="chevron-back" size={22} color={theme.text} />}
            />
            <Text style={[styles.title, { color: theme.text }]}>
              Pedidos
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ordersScroll}>
            {orders.map(order => {
              const isSelected = activeOrder && activeOrder.id === order.id;
              return (
                <TouchableOpacity
                  key={order.id}
                  style={[
                    styles.orderChip,
                    {
                      backgroundColor: isSelected ? theme.accent + '15' : theme.card,
                      borderColor: isSelected ? theme.accent : theme.border,
                      shadowColor: theme.shadow
                    }
                  ]}
                  onPress={() => handleSelectOrder(order)}
                >
                  <Ionicons name="receipt-outline" size={15} color={isSelected ? theme.accent : theme.textSecondary} style={{ marginRight: 6 }} />
                  <Text style={[styles.orderChipText, { color: isSelected ? theme.accent : theme.text, marginRight: 4 }]}>
                    {order.reference}
                  </Text>
                  {String(order.id).startsWith('temp_') ? (
                    <Ionicons name="cloud-offline-outline" size={12} color="#F59E0B" style={{ marginRight: 6 }} />
                  ) : (
                    <Ionicons name="cloud-done-outline" size={12} color="#10B981" style={{ marginRight: 6 }} />
                  )}
                  <TouchableOpacity
                    style={[
                      styles.deleteOrderChipBtn,
                      { backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)' }
                    ]}
                    onPress={() => handleDeleteOrder(order.id, order.reference)}
                  >
                    <Ionicons name="close" size={11} color={theme.danger} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.addOrderBtn, { backgroundColor: theme.accent, paddingHorizontal: isMobile ? 10 : 15 }]}
              onPress={() => setNewOrderModalVisible(true)}
            >
              <Ionicons name="add" size={16} color="#FFF" style={{ marginRight: 4 }} />
              <Text style={styles.addOrderBtnText}>Nuevo Pedido</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Pestañas para vista móvil (sólo si hay pedido activo) */}
        {isMobile && activeOrder && (
          <View style={[styles.tabBar, { backgroundColor: theme.card }]}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'products' && { borderBottomColor: theme.accent }]}
              onPress={() => setActiveTab('products')}
            >
              <Text style={[styles.tabText, { color: activeTab === 'products' ? theme.accent : theme.textSecondary }]}>
                Catálogo ({filteredProducts.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'cart' && { borderBottomColor: theme.accent }, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
              onPress={() => setActiveTab('cart')}
            >
              <Text style={[styles.tabText, { color: activeTab === 'cart' ? theme.accent : theme.textSecondary }]}>
                Pedido ({totalItems})
              </Text>
              {totalItems > 0 && (
                <View style={[styles.cartBadge, { backgroundColor: theme.accent }]}>
                  <Text style={styles.cartBadgeText}>{totalItems}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={{ marginTop: 10, color: theme.textSecondary }}>Cargando datos...</Text>
          </View>
        ) : !activeOrder ? (
          /* PANTALLA DE INVITACIÓN A SELECCIONAR PEDIDO */
          <View style={[styles.noActiveOrderContainer, { padding: isMobile ? 10 : 20 }]}>
            <Ionicons name="receipt-outline" size={80} color={theme.textSecondary} style={{ marginBottom: 15 }} />
            <Text style={[styles.noActiveOrderTitle, { color: theme.text }]}>¡Bienvenido al POS!</Text>
            <Text style={[styles.noActiveOrderSub, { color: theme.textSecondary }]}>
              Para registrar consumos o realizar ventas, selecciona una cuenta o pedido arriba o crea uno nuevo.
            </Text>
            <TouchableOpacity
              style={[styles.noActiveOrderBtn, { backgroundColor: theme.accent }]}
              onPress={() => setNewOrderModalVisible(true)}
            >
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 15 }}>Crear Nuevo Pedido</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* VISTA PRINCIPAL CON ORDEN SELECCIONADA */
          <View style={[styles.mainContent, { flexDirection: isMobile ? 'column' : 'row' }]}>

            {/* LADO DE PRODUCTOS (Catálogo) */}
            {(!isMobile || activeTab === 'products') && (
              <View style={[styles.productsPane, isMobile ? { width: '100%', flex: 1 } : { width: '60%' }, { padding: isMobile ? 10 : 20 }]}>

                {/* Buscador de Productos */}
                <Input
                  icon="search"
                  placeholder="Buscar por nombre o código..."
                  value={search}
                  onChangeText={setSearch}
                  rightElement={
                    search.length > 0 ? (
                      <TouchableOpacity onPress={() => setSearch('')} style={{ paddingRight: 8 }}>
                        <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                      </TouchableOpacity>
                    ) : null
                  }
                  containerStyle={{ marginBottom: 8 }}
                />

                {/* Grid / Lista de Productos */}
                <ScrollView contentContainerStyle={styles.productList}>
                  {filteredProducts.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="cube-outline" size={48} color={theme.textSecondary} style={{ marginBottom: 8 }} />
                      <Text style={{ color: theme.textSecondary, fontSize: 16 }}>No se encontraron productos.</Text>
                    </View>
                  ) : (
                    <View style={styles.productGrid}>
                      {filteredProducts.map(product => {
                        const inCartQty = cart.filter(item => item.product_id === product.id).reduce((s, i) => s + i.quantity, 0);
                        const isInCart = inCartQty > 0;
                        const finalStock = product.stock;
                        const isOutOfStock = finalStock <= 0;
                        const isDisabled = isOutOfStock || isInCart;

                        return (
                          <TouchableOpacity
                            key={product.id}
                            disabled={isDisabled}
                            style={[
                              styles.productCard,
                              { backgroundColor: theme.card, shadowColor: theme.shadow },
                              isDisabled && { opacity: 0.5 }
                            ]}
                            onPress={() => openAddFromCatalog(product)}
                          >
                            <View style={{ flex: 1 }}>
                              {product.code ? (
                                <Text style={styles.productCode}>#{product.code}</Text>
                              ) : null}
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                <Text style={[styles.productName, { color: theme.text, flexShrink: 1, marginRight: 5, marginBottom: 0 }]} numberOfLines={2}>
                                  {product.name}
                                </Text>
                                {String(product.id).startsWith('temp_') ? (
                                  <Ionicons name="cloud-offline-outline" size={13} color="#F59E0B" />
                                ) : (
                                  <Ionicons name="cloud-done-outline" size={13} color="#10B981" />
                                )}
                              </View>
                              <Text style={[styles.productPrice, { color: theme.accent }]}>
                                $ {formatNumber(product.price)}
                              </Text>
                            </View>

                            <View style={[styles.stockRow, { backgroundColor: isOutOfStock ? theme.danger + '15' : theme.accent + '15' }]}>
                              <Text style={[styles.stockText, { color: isOutOfStock ? theme.danger : theme.accent }]}>
                                {isOutOfStock ? 'Agotado' : `Stock: ${finalStock}`}
                              </Text>
                              {inCartQty > 0 && (
                                <View style={[styles.inCartIndicator, { backgroundColor: theme.accent }]}>
                                  <Text style={styles.inCartText}>{inCartQty}</Text>
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
              </View>
            )}

            {/* LADO DEL CARRITO / DETALLE DE CUENTA DE LA MESA */}
            {(!isMobile || activeTab === 'cart') && (
              <View style={[styles.cartPane, isMobile ? { width: '100%', flex: 1 } : { width: '40%', borderLeftColor: theme.card, borderLeftWidth: 1 }]}>

                {/* Lista del Carrito */}
                <View style={{ flex: 1, padding: isMobile ? 10 : 15 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.paneTitle, { color: theme.text }]}>Consumo: {activeOrder.reference}</Text>
                    {loadingItems && <ActivityIndicator size="small" color={theme.accent} />}
                  </View>

                  <ScrollView style={{ flex: 1, marginTop: 10 }}>
                    {cart.length === 0 ? (
                      <View style={styles.emptyContainer}>
                        <Ionicons name="cart-outline" size={48} color={theme.textSecondary} style={{ marginBottom: 8 }} />
                        <Text style={{ color: theme.textSecondary, fontSize: 15, textAlign: 'center' }}>
                          No hay consumos registrados en esta mesa.
                        </Text>
                      </View>
                    ) : (
                      groupedCart.map(group => (
                        <View key={group.product_id.toString()} style={[styles.cartItem, { borderBottomColor: theme.card, flexDirection: 'column', alignItems: 'stretch', paddingBottom: 10 }]}>
                          {/* Encabezado del producto agrupado */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.cartItemName, { color: theme.text }]} numberOfLines={1}>{group.name}</Text>
                              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 1 }}>
                                Total: <Text style={{ color: theme.accent, fontWeight: '800' }}>$ {formatNumber(group.totalSubtotal)}</Text> · {group.totalQty} u.
                              </Text>
                            </View>
                            {/* Botón para agregar 1 más (del lote más barato disponible) */}
                            <TouchableOpacity
                              onPress={() => addToCart({ id: group.product_id, name: group.name, stock: group.stock, price: group.lines[0]?.price || 0 }, 1)}
                              style={[styles.qtyBtn, { backgroundColor: theme.accent + '20', marginRight: 8 }]}
                            >
                              <Ionicons name="add" size={16} color={theme.accent} />
                            </TouchableOpacity>
                          </View>

                          {/* Desglose de líneas por lote (con precio diferenciado) */}
                          {group.lines.map(item => (
                            <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: theme.accent + '40' }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                                  Lote @ <Text style={{ color: theme.accent, fontWeight: '700' }}>$ {formatNumber(item.price)}</Text> c/u
                                </Text>
                              </View>
                              <View style={styles.qtyContainer}>
                                <TouchableOpacity
                                  onPress={() => openRemoveQty(item)}
                                  style={[styles.qtyBtn, { backgroundColor: theme.card }]}
                                >
                                  <Ionicons name="remove" size={15} color={theme.text} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => openAddQty(item)}>
                                  <Text style={[styles.qtyText, { color: theme.text }]}>{item.quantity}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => openAddQty(item)}
                                  style={[styles.qtyBtn, { backgroundColor: theme.card }]}
                                >
                                  <Ionicons name="add" size={15} color={theme.text} />
                                </TouchableOpacity>
                              </View>
                              <TouchableOpacity onPress={() => removeFromCart(item.id)} style={[styles.removeCartBtn, { marginLeft: 6 }]}>
                                <Ionicons name="trash" size={15} color={theme.danger} />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      ))
                    )}
                  </ScrollView>
                </View>

                {/* Formulario de Checkout */}
                <View style={[styles.checkoutPanel, { backgroundColor: theme.card, borderTopColor: theme.border, padding: isMobile ? 10 : 15 }]}>

                  {/* Tipo de Venta */}
                  <Text style={[styles.checkoutLabel, { color: theme.textSecondary }]}>Método de Pago</Text>
                  <View style={styles.saleTypeRow}>
                    <TouchableOpacity
                      style={[
                        styles.saleTypeBtn,
                        { borderColor: theme.border },
                        saleType === 'cash' && { backgroundColor: theme.accent, borderColor: theme.accent }
                      ]}
                      onPress={() => { setSaleType('cash'); setSelectedDebtor(null); }}
                    >
                      <Ionicons name="cash" size={18} color={saleType === 'cash' ? '#FFF' : theme.text} style={{ marginRight: 6 }} />
                      <Text style={[styles.saleTypeBtnText, { color: saleType === 'cash' ? '#FFF' : theme.text }]}>
                        Efectivo
                      </Text>
                    </TouchableOpacity>

                    {canSellOnCredit && (
                      <TouchableOpacity
                        style={[
                          styles.saleTypeBtn,
                          { borderColor: theme.border },
                          saleType === 'credit' && { backgroundColor: theme.danger, borderColor: theme.danger }
                        ]}
                        onPress={() => setSaleType('credit')}
                      >
                        <Ionicons name="people" size={18} color={saleType === 'credit' ? '#FFF' : theme.text} style={{ marginRight: 6 }} />
                        <Text style={[styles.saleTypeBtnText, { color: saleType === 'credit' ? '#FFF' : theme.text }]}>
                          Crédito (Deuda)
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Selección de Deudor si es crédito (solo visible para el dueño) */}
                  {saleType === 'credit' && canSellOnCredit && (
                    <View style={{ marginTop: 15, zIndex: 999 }}>
                      <Text style={[styles.checkoutLabel, { color: theme.textSecondary }]}>Cliente / Deudor *</Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1, position: 'relative' }}>
                          <Input
                            placeholder="Buscar cliente..."
                            value={debtorSearch}
                            onFocus={() => setDebtorDropdownVisible(true)}
                            onChangeText={(text) => {
                              setDebtorSearch(text);
                              setDebtorDropdownVisible(true);
                              if (selectedDebtor && text !== selectedDebtor.name) {
                                setSelectedDebtor(null);
                              }
                            }}
                            containerStyle={{ marginBottom: 0 }}
                          />
                          {debtorDropdownVisible && debtorSearch.length > 0 && (
                            <View style={[styles.dropdownContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                              <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 150 }}>
                                {filteredDebtors.map(debtor => (
                                  <TouchableOpacity
                                    key={debtor.id}
                                    style={[styles.dropdownItem, { borderBottomColor: theme.background }]}
                                    onPress={() => {
                                      setSelectedDebtor(debtor);
                                      setDebtorSearch(debtor.name);
                                      setDebtorDropdownVisible(false);
                                    }}
                                  >
                                    <Text style={{ color: theme.text, fontSize: 14 }}>{debtor.name}</Text>
                                    <Text style={{ color: theme.textSecondary, fontSize: 11 }}>Tel: {debtor.phone || 'N/A'}</Text>
                                  </TouchableOpacity>
                                ))}
                                {filteredDebtors.length === 0 && (
                                  <Text style={{ color: theme.textSecondary, padding: 12, textAlign: 'center' }}>
                                    No se encontraron deudores.
                                  </Text>
                                )}
                              </ScrollView>
                            </View>
                          )}
                        </View>

                        <TouchableOpacity
                          style={[styles.addDebtorExpressBtn, { backgroundColor: theme.accent }]}
                          onPress={() => setNewDebtorModalVisible(true)}
                        >
                          <Ionicons name="person-add" size={18} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Detalle de Totales */}
                  <View style={[styles.totalsSection, { borderTopColor: theme.background }]}>
                    <View style={styles.totalRow}>
                      <Text style={{ fontSize: 15, color: theme.textSecondary }}>Artículos:</Text>
                      <Text style={{ fontSize: 15, color: theme.text, fontWeight: '700' }}>{totalItems}</Text>
                    </View>
                    <View style={styles.totalRow}>
                      <Text style={{ fontSize: 18, color: theme.text, fontWeight: 'bold' }}>Total a pagar:</Text>
                      <Text style={{ fontSize: 22, color: theme.accent, fontWeight: '900' }}>
                        $ {formatNumber(totalAmount)}
                      </Text>
                    </View>
                  </View>

                  {/* Botón de Checkout */}
                  <Button
                    title={saleType === 'credit' ? 'Cobrar como Crédito' : 'Cobrar Pedido'}
                    onPress={handleCheckout}
                    disabled={cart.length === 0}
                    loading={savingSale}
                    variant="primary"
                    backgroundColor={saleType === 'credit' ? theme.danger : theme.accent}
                    icon={!savingSale ? <Ionicons name="checkmark-circle-outline" size={22} color="#FFF" style={{ marginRight: 8 }} /> : null}
                    style={styles.checkoutBtn}
                    textStyle={styles.checkoutBtnText}
                  />

                </View>
              </View>
            )}

          </View>
        )}

        {/* MODAL CREAR NUEVA ORDEN / PEDIDO */}
        <Modal
          visible={newOrderModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setNewOrderModalVisible(false)}
        >
          <Pressable style={[styles.modalOverlay, { padding: isMobile ? 10 : 20 }]} onPress={() => setNewOrderModalVisible(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: theme.card, padding: isMobile ? 10 : 20 }]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Abrir Nuevo Pedido / Cuenta</Text>

              <Input
                label="Referencia del Pedido / Cuenta *"
                placeholder="Ej. Pedido 4, Barra, Brayan A., Mesa 2"
                value={newOrderReference}
                onChangeText={setNewOrderReference}
                autoFocus={true}
              />

              <View style={styles.modalButtons}>
                <Button
                  title="Cancelar"
                  onPress={() => { setNewOrderReference(''); setNewOrderModalVisible(false); }}
                  variant="secondary"
                  style={{ flex: 1 }}
                  loading={false}
                />
                <Button
                  title="Guardar"
                  onPress={handleCreateOrder}
                  variant="primary"
                  loading={isSavingClient}
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* MODAL CREAR CLIENTE RÁPIDO */}
        <Modal
          visible={newDebtorModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setNewDebtorModalVisible(false)}
        >
          <Pressable style={[styles.modalOverlay, { padding: isMobile ? 10 : 20 }]} onPress={() => setNewDebtorModalVisible(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: theme.card, padding: isMobile ? 10 : 20 }]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Registrar Deudor Express</Text>

              <Input
                label="Nombre del Cliente *"
                placeholder="Ej. Juan Pérez"
                value={newDebtorName}
                onChangeText={setNewDebtorName}
              />

              <Input
                label="Celular (Opcional)"
                placeholder="Ej. 3001234567"
                value={newDebtorPhone}
                onChangeText={setNewDebtorPhone}
                keyboardType="phone-pad"
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setNewDebtorModalVisible(false)}>
                  <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtnSave, { backgroundColor: theme.accent }]} onPress={handleCreateDebtor}>
                  <Text style={styles.modalBtnTextSave}>Crear y Seleccionar</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* MODAL HISTORIAL / TRAZABILIDAD DEL PEDIDO */}
        <Modal
          visible={historyModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setHistoryModalVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setHistoryModalVisible(false)}>
            <Pressable style={[
              styles.historyModalContent,
              {
                backgroundColor: theme.card,
                height: isMobile ? '85%' : '70%',
              }
            ]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>

              {/* Header del Modal con icono */}
              <View style={[styles.historyModalHeader, { borderBottomColor: theme.background }]}>
                <View style={styles.historyModalHeaderLeft}>
                  <View style={[styles.historyModalIconCircle, { backgroundColor: '#8B5CF615' }]}>
                    <Ionicons name="time" size={24} color="#8B5CF6" />
                  </View>
                  <View>
                    <Text style={[styles.historyModalTitle, { color: theme.text }]}>Historial del Pedido</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                      {activeOrder?.reference} · Trazabilidad completa
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.closeModalBtn]}
                  onPress={() => setHistoryModalVisible(false)}
                >
                  <Ionicons name="close" size={20} color={theme.text} />
                </TouchableOpacity>
              </View>

              {/* Contenido */}
              {loadingHistory ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={theme.accent} />
                  <Text style={{ marginTop: 10, color: theme.textSecondary }}>Cargando historial...</Text>
                </View>
              ) : orderHistory.length === 0 ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
                  <View style={[styles.historyEmptyIcon, { backgroundColor: theme.background }]}>
                    <Ionicons name="time-outline" size={40} color={theme.textSecondary} />
                  </View>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', marginTop: 15, marginBottom: 5 }}>
                    Sin movimientos aún
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
                    Cuando agregues o quites productos de este pedido, aparecerán aquí los movimientos.
                  </Text>
                </View>
              ) : (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 12 }} showsVerticalScrollIndicator={false}>
                  {orderHistory.map((log, index) => {
                    // Determinar icono, color y etiqueta según la acción
                    let iconName = 'ellipse-outline';
                    let color = theme.textSecondary;
                    let actionLabel = 'Movimiento';
                    if (log.action === 'order_created') { iconName = 'create-outline'; color = '#8B5CF6'; actionLabel = 'Pedido creado'; }
                    else if (log.action === 'items_added') { iconName = 'add-circle-outline'; color = '#10B981'; actionLabel = 'Productos agregados'; }
                    else if (log.action === 'items_increased') { iconName = 'add-circle'; color = '#10B981'; actionLabel = 'Suma de unidades'; }
                    else if (log.action === 'items_decreased') { iconName = 'remove-circle'; color = '#F59E0B'; actionLabel = 'Resta de unidades'; }
                    else if (log.action === 'item_removed') { iconName = 'trash-outline'; color = theme.danger; actionLabel = 'Producto eliminado'; }
                    else if (log.action === 'order_completed') { iconName = 'checkmark-circle'; color = theme.accent; actionLabel = 'Pedido cobrado'; }

                    return (
                      <View key={log.id || index.toString()} style={{ flexDirection: 'row', marginBottom: 4 }}>
                        {/* Línea temporal */}
                        <View style={{ alignItems: 'center', marginRight: 12, width: 36 }}>
                          <View style={[styles.historyNode, { backgroundColor: color + '15', borderColor: color + '40' }]}>
                            <Ionicons name={iconName} size={17} color={color} />
                          </View>
                          {index < orderHistory.length - 1 && (
                            <View style={[styles.historyLine, { backgroundColor: theme.border }]} />
                          )}
                        </View>

                        {/* Card del movimiento */}
                        <View style={[styles.historyCard, { backgroundColor: theme.background, borderLeftColor: color, marginBottom: index === orderHistory.length - 1 ? 0 : 12 }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <Text style={{ color, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              {actionLabel}
                            </Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
                              {formatDateToLocal(log.created_at)}
                            </Text>
                          </View>
                          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>
                            {log.description || 'Movimiento registrado'}
                          </Text>
                          {log.product_name ? (
                            <View style={{ marginTop: 5 }}>
                              <View style={[styles.historyProductChip, { backgroundColor: color + '12' }]}>
                                <Ionicons name="cube-outline" size={11} color={color} />
                                <Text style={{ color: theme.text, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                                  {log.product_name}
                                </Text>
                                {log.quantity > 0 && (
                                  <Text style={{ color, fontSize: 11, fontWeight: '800', marginLeft: 6 }}>
                                    {log.action === 'items_decreased' || log.action === 'item_removed' ? '−' : '+'}{log.quantity} u.
                                  </Text>
                                )}
                              </View>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}

              {/* Pie con botón de cierre */}
              <View style={[styles.historyModalFooter, { borderTopColor: theme.background }]}>
                <TouchableOpacity
                  style={[styles.modalCloseMainBtn, { backgroundColor: theme.accent }]}
                  onPress={() => setHistoryModalVisible(false)}
                >
                  <Text style={styles.modalCloseMainText}>Cerrar Historial</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* MODAL DIGITAR CANTIDAD */}
        <Modal
          visible={qtyModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setQtyModalVisible(false)}
        >
          <Pressable style={[styles.modalOverlay, { padding: isMobile ? 10 : 20 }]} onPress={() => setQtyModalVisible(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: theme.card, padding: isMobile ? 15 : 20 }]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={[styles.qtyModalIcon, { backgroundColor: qtyModalMode === 'remove' ? theme.danger + '15' : theme.accent + '15' }]}>
                  <Ionicons
                    name={qtyModalMode === 'remove' ? 'remove-circle-outline' : 'add-circle-outline'}
                    size={36}
                    color={qtyModalMode === 'remove' ? theme.danger : theme.accent}
                  />
                </View>
                <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 6, marginTop: 8 }]}>
                  {qtyModalMode === 'remove' ? 'Quitar Unidades' : qtyModalMode === 'add' ? 'Sumar Unidades' : 'Agregar al Pedido'}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 14, textAlign: 'center' }}>
                  {qtyModalMode === 'addFromCatalog' ? qtyModalProduct?.name : qtyModalTargetItem?.name || qtyModalTargetItem?.item?.name}
                </Text>
              </View>

              <View style={[styles.qtyInputWrapper, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <TouchableOpacity
                  onPress={() => setQtyInput(prev => Math.max(1, (parseInt(prev, 10) || 1) - 1).toString())}
                  style={[styles.qtyModalStepper, { backgroundColor: theme.danger + '10' }]}
                >
                  <Ionicons name="remove" size={22} color={theme.danger} />
                </TouchableOpacity>
                <TextInput
                  value={qtyInput}
                  onChangeText={setQtyInput}
                  keyboardType="numeric"
                  selectTextOnFocus
                  style={[styles.qtyModalInput, { color: theme.text }]}
                />
                <TouchableOpacity
                  onPress={() => setQtyInput(prev => Math.min(qtyMax, (parseInt(prev, 10) || 0) + 1).toString())}
                  style={[styles.qtyModalStepper, { backgroundColor: theme.accent + '15' }]}
                >
                  <Ionicons name="add" size={22} color={theme.accent} />
                </TouchableOpacity>
              </View>

              <Text style={{ textAlign: 'center', color: theme.textSecondary, fontSize: 12, marginBottom: 18 }}>
                {qtyModalMode === 'addFromCatalog' || qtyModalMode === 'add' 
                  ? `Stock disponible: ${qtyMax} unidades`
                  : `Consumo actual: ${qtyMax} unidades`}
              </Text>

              <View style={styles.modalButtons}>
                <Button
                  title="Cancelar"
                  onPress={() => setQtyModalVisible(false)}
                  variant="secondary"
                  style={{ flex: 1 }}
                  loading={false}
                />
                <Button
                  title="Confirmar"
                  onPress={handleConfirmQty}
                  variant="primary"
                  loading={false}
                  style={{ flex: 1 }}
                  backgroundColor={qtyModalMode === 'remove' ? theme.danger : theme.accent}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* MODAL CONFIRMACIÓN ELIMINAR PEDIDO */}
        <Modal
          visible={deleteModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => { setDeleteModalVisible(false); setOrderToDelete(null); }}
        >
          <Pressable style={[styles.modalOverlay, { padding: isMobile ? 10 : 20 }]} onPress={() => { setDeleteModalVisible(false); setOrderToDelete(null); }}>
            <Pressable style={[styles.modalContent, { backgroundColor: theme.card, alignItems: 'center', padding: isMobile ? 10 : 20 }]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>
              <View style={{ backgroundColor: theme.danger + '15', padding: 12, borderRadius: 50, marginBottom: 15 }}>
                <Ionicons name="trash-outline" size={32} color={theme.danger} />
              </View>

              <Text style={[styles.modalTitle, { color: theme.text, textAlign: 'center', marginBottom: 10 }]}>
                ¿Cancelar Pedido?
              </Text>

              <Text style={{ color: theme.textSecondary, textAlign: 'center', fontSize: 14, lineHeight: 20, marginBottom: 25, paddingHorizontal: 10 }}>
                ¿Estás seguro de que deseas eliminar y cancelar el pedido de "{orderToDelete?.reference}"? Esto devolverá todos sus productos consumidos al stock del inventario.
              </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtnCancel, { flex: 1, marginRight: 8 }]}
                  onPress={() => { setDeleteModalVisible(false); setOrderToDelete(null); }}
                >
                  <Text style={[styles.modalBtnText, { color: theme.textSecondary, textAlign: 'center' }]}>Conservar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnSave, { backgroundColor: theme.danger, flex: 1, marginLeft: 8, width: 120 }]}
                  onPress={confirmDeleteOrder}
                >
                  <Text style={[styles.modalBtnTextSave, { textAlign: 'center' }]}>Sí, Eliminar</Text>
                </TouchableOpacity>
              </View>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  clearBtn: {
    padding: 8,
  },
  ordersBar: {
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  ordersScroll: {
    paddingHorizontal: 15,
    alignItems: 'center',
    gap: 10,
  },
  orderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 6,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  orderChipText: {
    fontSize: 13,
    fontWeight: '700',
    marginRight: 6,
  },
  deleteOrderChipBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  addOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 2,
  },
  addOrderBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cartBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  cartBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noActiveOrderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noActiveOrderTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  noActiveOrderSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    maxWidth: 320,
  },
  noActiveOrderBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
    elevation: 3,
  },
  mainContent: {
    flex: 1,
  },
  productsPane: {
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 44,
    marginBottom: 15,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  productList: {
    paddingBottom: 20,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  productCard: {
    width: '48%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    justifyContent: 'space-between',
    minHeight: 130,
  },
  productCode: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '800',
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  stockText: {
    fontSize: 10,
    fontWeight: '700',
  },
  inCartIndicator: {
    borderRadius: 10,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inCartText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
  },
  cartPane: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  paneTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '700',
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
  },
  qtyText: {
    width: 28,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 'bold',
  },
  removeCartBtn: {
    padding: 6,
  },
  qtyModalIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyLine: {
    flex: 1,
    width: 2,
    minHeight: 24,
  },
  // Estilos del modal de historial/trazabilidad
  historyModalContent: {
    width: '100%',
    maxWidth: 450,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 24,
    elevation: 10,
    overflow: 'hidden',
  },
  historyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  historyModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyModalIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyModalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  historyEmptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyNode: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  historyCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
  },
  historyProductChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  historyModalFooter: {
    padding: 16,
    borderTopWidth: 1,
  },
  modalCloseMainBtn: {
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  modalCloseMainText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  qtyInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    padding: 4,
  },
  qtyModalStepper: {
    width: 46,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyModalInput: {
    width: 180,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    paddingVertical: 10,
  },
  checkoutPanel: {
    borderTopWidth: 1,
    elevation: 10,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  checkoutLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  saleTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  saleTypeBtn: {
    flex: 0.48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  saleTypeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  debtorSearchInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addDebtorExpressBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 46,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    zIndex: 9999,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalsSection: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 15,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkoutBtn: {
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    elevation: 3,
  },
  checkoutBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  // Modal de Deudor Express
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalInput: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  modalBtnCancel: {
    flex: 0.48,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalBtnSave: {
    flex: 0.48,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnTextSave: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
