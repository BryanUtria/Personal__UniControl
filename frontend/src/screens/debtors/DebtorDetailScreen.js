import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Modal, ActivityIndicator, Linking, Switch, useWindowDimensions, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../../utils/offlineSync';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import Input from '../../components/Input';
import Button from '../../components/Button';
import SidebarLayout from '../../navigation/SidebarLayout';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const formatTxDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return dateStr;
  }
};

export default function DebtorDetailScreen({ route, navigation }) {
  const { debtor } = route.params;
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  // Historial de movimientos conectado a la base de datos
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all'); // 'all', 'debt', 'payment'
  const [shareMenuVisible, setShareMenuVisible] = useState(false);
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [sortBy, setSortBy] = useState('date_desc'); // 'date_desc', 'date_asc', 'amount_desc', 'amount_asc', 'desc_asc'
  const [disabledTxIds, setDisabledTxIds] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  };

  // Cargar filtros de movimientos del storage al iniciar
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const saved = await AsyncStorage.getItem('@unicontrol_debtors_items_filter');
        if (saved) {
          const { sortBy: savedSort, filterType: savedFilter } = JSON.parse(saved);
          if (savedSort) setSortBy(savedSort);
          if (savedFilter) setFilterType(savedFilter);
        }
      } catch (e) {
        console.error('Error al cargar filtros de ítems:', e);
      }
    };
    loadFilters();
  }, []);

  // Guardar filtros de movimientos en el storage cuando cambien
  useEffect(() => {
    const saveFilters = async () => {
      try {
        await AsyncStorage.setItem('@unicontrol_debtors_items_filter', JSON.stringify({ sortBy, filterType }));
      } catch (e) {
        console.error('Error al guardar filtros de ítems:', e);
      }
    };
    saveFilters();
  }, [sortBy, filterType]);

  const toggleTxActive = (id) => {
    setDisabledTxIds(prev =>
      prev.includes(id) ? prev.filter(txId => txId !== id) : [...prev, id]
    );
  };

  // Estados para el Modal CRUD de Ítems
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Campos del formulario
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [type, setType] = useState('debt');

  // Modal Confirmación de Eliminación
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Cargar movimientos desde el backend
  const fetchTransactions = async () => {
    try {
      const response = await apiFetch(`${API_URL}/debtors/${debtor.id}/debts`, {
        headers: {
          'x-user-id': user ? user.id.toString() : ''
        }
      });
      const data = await response.json();
      setTransactions(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('Error al cargar movimientos:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      const response = await apiFetch(`${API_URL}/debts/${itemToDelete}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': user ? user.id.toString() : ''
        }
      });
      if (response.ok) {
        fetchTransactions();
      }
      setDeleteModalVisible(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error al eliminar movimiento:', error);
    }
  };

  const deleteTransaction = (id) => {
    setItemToDelete(id);
    setDeleteModalVisible(true);
  };

  // Calcular totales (Deudas, Abonos y Balance)
  const calculateTotals = () => {
    return transactions.reduce((acc, curr) => {
      if (disabledTxIds.includes(curr.id)) return acc; // IGNORAR si está desactivado temporalmente
      const itemTotal = curr.amount * (curr.quantity || 1);
      if (curr.type === 'debt') acc.debts += itemTotal;
      if (curr.type === 'payment') acc.payments += itemTotal;
      return acc;
    }, { debts: 0, payments: 0 });
  };

  const { debts: totalDebts, payments: totalPayments } = calculateTotals();
  const currentBalance = totalDebts - totalPayments;
  const isGlobalDebt = currentBalance > 0;
  const isGlobalCredit = currentBalance < 0;

  // Obtener los IDs de transacciones que pusieron la cuenta al día (saldo en 0)
  const zeroBalanceIds = useMemo(() => {
    // Las transacciones en el estado vienen ordenadas de más nuevas a más antiguas (id DESC).
    // Invertimos el arreglo para recorrerlas cronológicamente de forma 100% segura.
    const chronological = [...transactions]
      .filter(t => !disabledTxIds.includes(t.id))
      .reverse();

    const zeroIds = new Set();
    let runningBalance = 0;
    let hadHistory = false;

    for (const t of chronological) {
      const val = t.amount * (t.quantity || 1);
      const change = t.type === 'debt' ? val : -val;
      runningBalance += change;

      if (Math.abs(runningBalance) > 0.01) {
        hadHistory = true;
      }

      if (hadHistory && Math.abs(runningBalance) < 0.01) {
        zeroIds.add(t.id);
        hadHistory = false; // Reiniciar para detectar la siguiente vez que se mueva de 0 y vuelva a 0
      }
    }
    return zeroIds;
  }, [transactions, disabledTxIds]);

  // Filtrado y ordenación de movimientos
  const getProcessedTransactions = () => {
    let result = [...transactions];

    // 1. Filtrar por tipo
    if (filterType !== 'all') {
      result = result.filter(t => t.type === filterType);
    }

    // 2. Ordenar según el criterio seleccionado
    result.sort((a, b) => {
      const aVal = a.amount * (a.quantity || 1);
      const bVal = b.amount * (b.quantity || 1);

      if (sortBy === 'amount_desc') {
        return bVal - aVal;
      } else if (sortBy === 'amount_asc') {
        return aVal - bVal;
      } else if (sortBy === 'desc_asc') {
        return (a.description || '').localeCompare(b.description || '');
      } else if (sortBy === 'desc_desc') {
        return (b.description || '').localeCompare(a.description || '');
      } else if (sortBy === 'date_asc') {
        // Usar created_at o date
        const aDate = new Date(a.created_at || a.date || 0);
        const bDate = new Date(b.created_at || b.date || 0);
        return aDate - bDate;
      } else {
        // date_desc (por defecto)
        const aDate = new Date(a.created_at || a.date || 0);
        const bDate = new Date(b.created_at || b.date || 0);
        return bDate - aDate;
      }
    });

    return result;
  };

  const filteredTransactions = getProcessedTransactions();

  // Exportar reporte de movimientos a formato .xlsx real de Excel
  const exportToExcel = async () => {
    if (transactions.length === 0) {
      showToast('No hay movimientos para exportar.', 'warning');
      return;
    }

    try {
      // 1. Formatear datos de transacciones en un array de objetos
      const excelData = transactions.map(t => {
        const total = t.amount * t.quantity;
        const totalSigned = t.type === 'debt' ? total : -total;
        const isDisabled = disabledTxIds.includes(t.id);
        const typeLabel = t.type === 'debt'
          ? (debtor.type === 'deuda' ? 'Compra' : 'Deuda')
          : (debtor.type === 'deuda' ? 'Pago' : 'Abono');
        return {
          'Fecha': formatTxDate(t.date),
          'Descripción': t.description || 'Sin descripción',
          'Cantidad': t.quantity || 1,
          'Valor Unidad ($)': t.amount,
          'Total ($)': totalSigned,
          'Tipo': typeLabel,
          'Estado para Saldo': isDisabled ? 'Omitido' : 'Activo'
        };
      });

      // 2. Crear un libro de trabajo (Workbook) y una hoja de cálculo (Worksheet)
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Configurar anchos de columna óptimos
      const wscols = [
        { wch: 22 }, // Fecha
        { wch: 25 }, // Descripción
        { wch: 10 }, // Cantidad
        { wch: 18 }, // Valor Unidad
        { wch: 18 }, // Total
        { wch: 12 }, // Tipo
        { wch: 18 }  // Estado para Saldo
      ];
      ws['!cols'] = wscols;

      XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');

      // 3. Nombre del archivo sanitizado (.xlsx)
      const sanitizedClientName = debtor.name.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Reporte_${sanitizedClientName}_${new Date().toISOString().split('T')[0]}.xlsx`;

      // 4. Lógica de descarga para Plataforma WEB
      if (Platform.OS === 'web') {
        XLSX.writeFile(wb, filename);
        showToast('Descargando reporte de Excel.', 'success');
        return;
      }

      // 5. Lógica de guardado/compartido para Plataforma MÓVIL (Android / iOS)
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      // Guardar localmente en formato base64
      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: 'base64'
      });

      // Compartir usando el diálogo nativo del dispositivo (admite WhatsApp y Descarga directa)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `Reporte de ${debtor.name}`,
          UTI: 'com.microsoft.excel.xlsx'
        });
        showToast('Reporte generado correctamente.', 'success');
      } else {
        showToast('La función de compartir no está disponible en este dispositivo.', 'error');
      }
    } catch (error) {
      console.error('Error al exportar reporte .xlsx:', error);
      showToast('Hubo un error al generar el archivo .xlsx de Excel.', 'error');
    }
  };

  // Enviar resumen de cuenta por WhatsApp
  const sendWhatsAppSummary = () => {
    // 1. Calcular totales
    const { debts: totalDebts, payments: totalPayments } = calculateTotals();
    const currentBalance = totalDebts - totalPayments;
    const isGlobalDebt = currentBalance > 0;

    // 2. Construir el cuerpo del mensaje de forma extremadamente limpia y compatible sin emojis
    const labelRole = debtor.type === 'deuda' ? 'Deuda con' : 'Deudor';
    const labelDebts = 'Total Deudas';
    const labelPayments = debtor.type === 'deuda' ? 'Total Pagos' : 'Total Abonos';

    let message = `*ESTADO DE CUENTA - UNICONTROL*\n\n`;
    message += `*${labelRole}:* ${debtor.name}\n`;
    if (debtor.identification) message += `*Identificación:* ${debtor.identification}\n`;
    if (debtor.phone) message += `*Teléfono:* ${debtor.phone}\n`;
    message += `*Fecha de Reporte:* ${new Date().toLocaleDateString()}\n\n`;

    message += `-----------------------------------\n`;
    message += `*Resumen Financiero:*\n`;
    message += `*${labelDebts}:* $ ${totalDebts.toLocaleString()}\n`;
    message += `*${labelPayments}:* $ ${totalPayments.toLocaleString()}\n`;

    if (currentBalance === 0) {
      message += `*Saldo Actual:* $ 0 (Al día)\n`;
    } else if (isGlobalDebt) {
      const balanceLabel = debtor.type === 'deuda' ? 'Deuda (Por Pagar)' : 'Deudor (Por Cobrar)';
      message += `*${balanceLabel}:* $ ${Math.abs(currentBalance).toLocaleString()}\n`;
    } else {
      const balanceLabel = 'Ahorro';
      message += `*${balanceLabel}:* $ ${Math.abs(currentBalance).toLocaleString()}\n`;
    }
    message += `-----------------------------------\n\n`;

    // Agregar todos los movimientos si existen
    if (transactions.length > 0) {
      message += `*Detalle de Movimientos:*\n`;
      transactions.forEach(t => {
        const isDebt = t.type === 'debt';
        const typeLabel = isDebt
          ? 'DEUDA'
          : (debtor.type === 'deuda' ? 'PAGO' : 'ABONO');
        const sign = isDebt ? '-' : '+';
        const itemTotal = t.amount * (t.quantity || 1);
        const isDisabled = disabledTxIds.includes(t.id);

        if (isDisabled) {
          message += `• *[${typeLabel}]* (Omitido para Saldo) ${formatTxDate(t.date)}\n`;
          message += `  ~${t.description || 'Sin descripción'} (x${t.quantity || 1} a $ ${t.amount.toLocaleString()}): ${sign}$ ${itemTotal.toLocaleString()}~\n\n`;
        } else {
          message += `• *[${typeLabel}]* ${formatTxDate(t.date)}\n`;
          message += `  ${t.description || 'Sin descripción'} (x${t.quantity || 1} a $ ${t.amount.toLocaleString()}): ${sign}$ ${itemTotal.toLocaleString()}\n\n`;
        }
      });
    }

    message += `*¡Muchas gracias por su atención y confianza!*`;

    // 3. Limpiar teléfono del deudor
    const cleanPhone = debtor.phone ? debtor.phone.replace(/[^0-9]/g, '') : '';

    // 4. Abrir WhatsApp
    let url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    if (cleanPhone) {
      url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    }

    Linking.openURL(url).catch(() => {
      showToast('No se pudo abrir WhatsApp. Asegúrate de tener la aplicación instalada.', 'error');
    });
  };

  // Abrir modal para crear o editar
  const openModal = (transactionType, item = null) => {
    if (item) {
      setEditingId(item.id);
      setDescription(item.description || '');
      setAmount(item.amount.toString());
      setQuantity((item.quantity || 1).toString());
      setType(item.type);
    } else {
      setEditingId(null);
      setDescription('');
      setAmount('');
      setQuantity('1');
      setType(transactionType);
    }
    setModalVisible(true);
  };

  // Guardar Transacción
  const saveTransaction = async () => {
    if (!description.trim() || !amount || !quantity) {
      showToast('Completa la descripción, monto y cantidad.', 'warning');
      return;
    }

    const numAmount = parseFloat(amount);
    const numQty = parseInt(quantity, 10);

    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('El monto debe ser un número mayor a cero.', 'warning');
      return;
    }
    if (isNaN(numQty) || numQty <= 0) {
      showToast('La cantidad debe ser mayor a cero.', 'warning');
      return;
    }

    try {
      if (editingId) {
        // Actualizar en backend
        const response = await apiFetch(`${API_URL}/debts/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user ? user.id.toString() : ''
          },
          body: JSON.stringify({ amount: numAmount, quantity: numQty, description, type }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          fetchTransactions();
          showToast(data.message || 'Movimiento actualizado correctamente.', 'success');
        } else {
          showToast('No se pudo actualizar el movimiento.', 'error');
        }
      } else {
        // Crear nuevo en backend
        const response = await apiFetch(`${API_URL}/debtors/${debtor.id}/debts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user ? user.id.toString() : ''
          },
          body: JSON.stringify({ amount: numAmount, quantity: numQty, description, type }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          fetchTransactions();
          showToast(data.message || 'Movimiento registrado correctamente.', 'success');
        } else {
          showToast('No se pudo registrar el movimiento.', 'error');
        }
      }
      setModalVisible(false);
    } catch (error) {
      console.error('Error al guardar movimiento:', error);
      showToast('Error de red al guardar el movimiento.', 'error');
    }
  };

  const renderItem = ({ item }) => {
    const isDebt = item.type === 'debt';
    const qty = item.quantity || 1;
    const totalItem = item.amount * qty;
    const isEnabled = !disabledTxIds.includes(item.id);
    const isSupplier = debtor.type === 'deuda';

    // Determinar color de monto según rol y tipo de transacción
    let tAmountColor = theme.textSecondary;
    if (isSupplier) {
      tAmountColor = isDebt ? '#8B5CF6' : '#10B981';
    } else {
      tAmountColor = isDebt ? theme.danger : theme.accent;
    }

    return (
      <View style={[styles.transactionCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]} key={item.id}>

        {/* Cuerpo de la tarjeta con opacidad condicional según switch */}
        <View style={{ opacity: isEnabled ? 1 : 0.4 }}>
          <View style={styles.tContent}>
            <View style={styles.tInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.tDesc, { color: theme.text, textDecorationLine: isEnabled ? 'none' : 'line-through', flexShrink: 1 }]}>
                  {item.description || 'Sin descripción'}
                </Text>
                {String(item.id).startsWith('temp_') ? (
                  <Ionicons name="cloud-offline-outline" size={13} color="#F59E0B" style={{ marginLeft: 5 }} />
                ) : (
                  <Ionicons name="cloud-done-outline" size={13} color="#10B981" style={{ marginLeft: 5 }} />
                )}
              </View>
              <Text style={[styles.tDate, { color: theme.textSecondary }]}>{formatTxDate(item.date)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.tAmount, { color: tAmountColor, textDecorationLine: isEnabled ? 'none' : 'line-through' }]}>
                {isDebt ? '-' : '+'}$ {formatNumber(totalItem)}
              </Text>
              <Text style={[styles.tSubDesc, { color: theme.textSecondary, marginTop: 4, textAlign: 'right' }]}>
                (x{qty} Und. a $ {formatNumber(item.amount)})
              </Text>
            </View>
          </View>
        </View>

        {/* Acciones del Ítem y el Switch */}
        <View style={[styles.tActions, { borderTopColor: isDarkMode ? '#333' : '#F0F0F0' }]}>

          <View style={[styles.tActionBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}>
            <Switch
              value={isEnabled}
              onValueChange={() => toggleTxActive(item.id)}
              trackColor={{ false: isDarkMode ? '#444' : '#D1D5DB', true: theme.accent + '50' }}
              thumbColor={isEnabled ? theme.accent : '#9CA3AF'}
              style={Platform.OS === 'web' ? { cursor: 'pointer' } : { transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }], height: 20, marginVertical: -5 }}
            />
            <Text style={[styles.tActionText, { color: isEnabled ? theme.textSecondary : '#9CA3AF', fontSize: 11, marginLeft: 5 }]}>
              {isEnabled ? 'Activo' : 'Omitido'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => openModal(item.type, item)}
            style={styles.tActionBtn}
            disabled={!isEnabled}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: isEnabled ? 1 : 0.4 }}>
              <Ionicons name="pencil" size={14} color={theme.accent} style={{ marginRight: 6 }} />
              <Text style={[styles.tActionText, { color: theme.accent }]}>Editar</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => deleteTransaction(item.id)}
            style={styles.tActionBtn}
            disabled={!isEnabled}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: isEnabled ? 1 : 0.4 }}>
              <Ionicons name="trash-outline" size={14} color={theme.danger} style={{ marginRight: 6 }} />
              <Text style={[styles.tActionText, { color: theme.danger }]}>Eliminar</Text>
            </View>
          </TouchableOpacity>
        </View>

      </View>
    );
  };

  const screenTitle = debtor.type === 'deuda' ? 'Detalle Deuda' : (debtor.type === 'ahorro' ? 'Detalle Ahorro' : 'Detalle Deudor');

  const headerRightComponent = (
    <View style={{ flexDirection: 'row', gap: isMobile ? 5 : 8, alignItems: 'center' }}>
      <Button
        onPress={handleRefresh}
        variant="secondary"
        style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
        icon={<Ionicons name="refresh" size={22} color={theme.text} />}
      />
      <Button
        onPress={() => setFilterMenuVisible(true)}
        variant="secondary"
        style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
        icon={<Ionicons name="options-outline" size={22} color={theme.text} />}
      />
      <Button
        onPress={() => setShareMenuVisible(true)}
        variant="secondary"
        style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
        icon={<Ionicons name="menu" size={24} color={theme.text} />}
      />
    </View>
  );

  return (
    <SidebarLayout
      navigation={navigation}
      title="Deudas y Ahorros"
      activeRoute="DebtorsList"
      headerRight={headerRightComponent}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.accent]}
            tintColor={theme.accent}
          />
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: isMobile ? 10 : 20 }}>
          <Button
            onPress={() => navigation.goBack()}
            variant="secondary"
            style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, marginRight: 10, borderWidth: 0 }]}
            icon={<Ionicons name="chevron-back" size={22} color={theme.text} />}
          />
          <Text style={[styles.title, { color: theme.text }]}>
            {screenTitle}
          </Text>
        </View>

        <View style={[styles.clientHeader, { paddingHorizontal: isMobile ? 10 : 20 }]}>
          <Text style={[styles.clientName, { color: theme.text }]}>{debtor.name}</Text>
          <Text style={[styles.clientPhone, { color: theme.textSecondary }]}>{debtor.phone || 'Sin teléfono'}</Text>

          {/* Tarjetas Pequeñas de Resumen */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                {debtor.type === 'ahorro' ? 'Total Retiros' : 'Total Deudas'}
              </Text>
              <Text style={[styles.summaryValue, { color: debtor.type === 'deuda' ? '#EF4444' : (debtor.type === 'ahorro' ? '#EF4444' : '#8B5CF6') }]} numberOfLines={1} adjustsFontSizeToFit>$ {formatNumber(totalDebts)}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                {debtor.type === 'ahorro' ? 'Total Ahorrado' : (debtor.type === 'deuda' ? 'Total Pagos' : 'Total Abonos')}
              </Text>
              <Text style={[styles.summaryValue, { color: debtor.type === 'deuda' ? '#10B981' : (debtor.type === 'ahorro' ? '#10B981' : theme.accent) }]} numberOfLines={1} adjustsFontSizeToFit>$ {formatNumber(totalPayments)}</Text>
            </View>
          </View>

          {/* Tarjeta del Saldo Dinámico */}
          <View style={[styles.balanceCard, { backgroundColor: isDarkMode ? '#2A2A2A' : '#E5E7EB' }]}>
            <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>
              {debtor.type === 'ahorro'
                ? (isGlobalDebt ? 'Déficit (Retiros exceden ahorros)' : 'Ahorro')
                : (isGlobalCredit
                  ? 'Ahorro'
                  : (debtor.type === 'deuda' ? 'Deuda (Por Pagar)' : 'Deudor (Por Cobrar)'))}
            </Text>
            <Text
              style={[
                styles.balanceAmount,
                {
                  color: debtor.type === 'ahorro'
                    ? (isGlobalDebt ? theme.danger : '#10B981')
                    : (isGlobalDebt
                      ? (debtor.type === 'deuda' ? '#EF4444' : '#8B5CF6')
                      : isGlobalCredit
                        ? (debtor.type === 'deuda' ? '#10B981' : theme.accent)
                        : theme.textSecondary)
                }
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              $ {formatNumber(Math.abs(currentBalance))}
            </Text>
          </View>

          {/* Información Adicional */}
          {(debtor.identification || debtor.email || debtor.address || debtor.notes) && (
            <View style={[styles.infoCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <Text style={[styles.infoCardTitle, { color: theme.textSecondary }]}>
                {debtor.type === 'deuda' ? 'Información de la Deuda' : 'Información del Deudor'}
              </Text>

              {debtor.identification ? (
                <View style={styles.infoRow}>
                  <Ionicons name="card-outline" size={16} color={theme.textSecondary} style={styles.infoIcon} />
                  <Text style={[styles.infoText, { color: theme.text }]}>ID: {debtor.identification}</Text>
                </View>
              ) : null}

              {debtor.email ? (
                <View style={styles.infoRow}>
                  <Ionicons name="mail-outline" size={16} color={theme.textSecondary} style={styles.infoIcon} />
                  <Text style={[styles.infoText, { color: theme.text }]}>{debtor.email}</Text>
                </View>
              ) : null}

              {debtor.address ? (
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={16} color={theme.textSecondary} style={styles.infoIcon} />
                  <Text style={[styles.infoText, { color: theme.text }]}>{debtor.address}</Text>
                </View>
              ) : null}

              {debtor.notes ? (
                <View style={[styles.infoRow, { alignItems: 'flex-start' }]}>
                  <Ionicons name="document-text-outline" size={16} color={theme.textSecondary} style={[styles.infoIcon, { marginTop: 2 }]} />
                  <Text style={[styles.infoText, { color: theme.textSecondary, fontStyle: 'italic' }]}>
                    "{debtor.notes}"
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <Text style={[styles.historyTitle, { color: theme.text, paddingHorizontal: isMobile ? 10 : 20 }]}>Historial de Movimientos</Text>



        {loading ? (
          <View style={{ paddingVertical: 40, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.accent} />
          </View>
        ) : (
          <View style={[styles.list, { paddingHorizontal: isMobile ? 10 : 20 }]}>
            {filteredTransactions.length === 0 ? (
              <Text style={{ color: theme.textSecondary, textAlign: 'center', marginVertical: 30, fontSize: 16 }}>
                No hay movimientos para este filtro.
              </Text>
            ) : (
              filteredTransactions.map((item, idx) => {
                const isZeroBalance = zeroBalanceIds.has(item.id);
                const isOldestFirst = sortBy === 'date_asc';
                return (
                  <View key={item.id}>
                    {/* Mostrar divisor ARRIBA del elemento si es orden descendente (más nuevo arriba) */}
                    {isZeroBalance && !isOldestFirst && (
                      <View style={styles.settledDividerContainer}>
                        <View style={[styles.settledDividerLine, { backgroundColor: '#10B98140' }]} />
                        <View style={[styles.settledDividerBadge, { backgroundColor: '#10B98115', borderColor: '#10B98150' }]}>
                          <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginRight: 5 }} />
                          <Text style={[styles.settledDividerText, { color: '#10B981' }]}>
                            {debtor.type === 'ahorro' ? 'Cuenta en Ceros' : 'Puesto al Día'}
                          </Text>
                        </View>
                        <View style={[styles.settledDividerLine, { backgroundColor: '#10B98140' }]} />
                      </View>
                    )}

                    {renderItem({ item })}

                    {/* Mostrar divisor ABAJO del elemento si es orden ascendente (más antiguo arriba) */}
                    {isZeroBalance && isOldestFirst && (
                      <View style={styles.settledDividerContainer}>
                        <View style={[styles.settledDividerLine, { backgroundColor: '#10B98140' }]} />
                        <View style={[styles.settledDividerBadge, { backgroundColor: '#10B98115', borderColor: '#10B98150' }]}>
                          <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginRight: 5 }} />
                          <Text style={[styles.settledDividerText, { color: '#10B981' }]}>
                            {debtor.type === 'ahorro' ? 'Cuenta en Ceros' : 'Puesto al Día'}
                          </Text>
                        </View>
                        <View style={[styles.settledDividerLine, { backgroundColor: '#10B98140' }]} />
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* FAB para agregar movimiento */}
      <TouchableOpacity onPress={() => openModal('debt')} style={[styles.fab, { backgroundColor: theme.accent }]}>
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* Modal CRUD para Transacciones */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { padding: isMobile ? 10 : 20 }]}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: theme.card, padding: isMobile ? 10 : 20 }]}
            onPress={(e) => {
              if (Platform.OS === 'web') e.stopPropagation();
            }}
          >
            <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 15 }]}>
              {editingId
                ? 'Editar Movimiento'
                : (type === 'debt'
                  ? 'Nueva Deuda'
                  : (debtor.type === 'deuda' ? 'Nuevo Pago' : 'Nuevo Abono'))}
            </Text>

            {editingId && (
              <View style={{
                alignSelf: 'flex-start',
                marginBottom: 15,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: type === 'debt'
                  ? (debtor.type === 'deuda' ? '#8B5CF620' : theme.danger + '20')
                  : (debtor.type === 'deuda' ? '#10B98120' : theme.accent + '20')
              }}>
                <Text style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: type === 'debt'
                    ? (debtor.type === 'deuda' ? '#8B5CF6' : theme.danger)
                    : (debtor.type === 'deuda' ? '#10B981' : theme.accent)
                }}>
                  Tipo: {type === 'debt'
                    ? 'Deuda'
                    : (debtor.type === 'deuda' ? 'Pago' : 'Abono')}
                </Text>
              </View>
            )}

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Descripción del ítem</Text>
            <Input
              placeholder="Ej. Pantalón o Materiales"
              value={description}
              onChangeText={setDescription}
            />

            <View style={styles.rowInputs}>
              <View style={styles.halfInput}>
                <Input
                  label="Cantidad"
                  placeholder="1"
                  keyboardType="numeric"
                  value={quantity}
                  onChangeText={setQuantity}
                />
              </View>

              <View style={styles.halfInput}>
                <Input
                  label="Valor Unidad ($)"
                  placeholder="0.00"
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
              </View>
            </View>

            {/* Selector de Tipo (Solo editable al crear nuevo) */}
            {!editingId && (
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[
                    styles.typeBtn,
                    type === 'debt' && { backgroundColor: debtor.type === 'ahorro' ? '#EF4444' : (debtor.type === 'deuda' ? '#EF4444' : '#8B5CF6') }
                  ]}
                  onPress={() => setType('debt')}
                >
                  <Text style={[styles.typeBtnText, { color: type === 'debt' ? '#FFF' : theme.textSecondary }]}>
                    {debtor.type === 'ahorro' ? 'Retiro' : 'Deuda'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeBtn,
                    type === 'payment' && { backgroundColor: debtor.type === 'ahorro' ? '#10B981' : (debtor.type === 'deuda' ? '#10B981' : theme.accent) }
                  ]}
                  onPress={() => setType('payment')}
                >
                  <Text style={[styles.typeBtnText, { color: type === 'payment' ? '#FFF' : theme.textSecondary }]}>
                    {debtor.type === 'ahorro' ? 'Ahorro' : (debtor.type === 'deuda' ? 'Pago' : 'Abono')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtnSave, { backgroundColor: theme.accent }]} onPress={saveTransaction}>
                <Text style={styles.modalBtnTextSave}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal de Confirmación de Eliminación */}
      <Modal
        visible={deleteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { padding: isMobile ? 10 : 20 }]}
          onPress={() => setDeleteModalVisible(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: theme.card, padding: isMobile ? 10 : 20 }]}
            onPress={(e) => {
              if (Platform.OS === 'web') e.stopPropagation();
            }}
          >
            <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 15 }]}>Eliminar Movimiento</Text>
            <Text style={{ color: theme.textSecondary, marginBottom: 20, textAlign: 'center', fontSize: 16 }}>
              ¿Seguro que deseas eliminar este movimiento? Afectará el saldo del {debtor.type === 'deuda' ? 'proveedor' : 'cliente'}.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setDeleteModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtnSave, { backgroundColor: theme.danger }]} onPress={confirmDelete}>
                <Text style={styles.modalBtnTextSave}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal de Filtros y Ordenamiento */}
      <Modal
        visible={filterMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFilterMenuVisible(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { padding: isMobile ? 10 : 20 }]}
          onPress={() => setFilterMenuVisible(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: theme.card, maxWidth: 360, padding: isMobile ? 10 : 20 }]}
            onPress={(e) => {
              if (Platform.OS === 'web') e.stopPropagation();
            }}
          >
            <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 15 }]}>Organizar y Filtrar</Text>

            {/* ORDENAR POR CATEGORÍA */}
            <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Ordenar movimientos por</Text>

            {/* Categoría: Fecha */}
            <Text style={[styles.subFilterLabel, { color: theme.textSecondary }]}>Fecha del Movimiento</Text>
            <View style={styles.filterGroupRow}>
              <TouchableOpacity
                style={[styles.filterBadge, sortBy === 'date_desc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setSortBy('date_desc')}
              >
                <Text style={[styles.filterBadgeText, { color: sortBy === 'date_desc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'date_desc' ? '700' : 'normal' }]}>Recientes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBadge, sortBy === 'date_asc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setSortBy('date_asc')}
              >
                <Text style={[styles.filterBadgeText, { color: sortBy === 'date_asc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'date_asc' ? '700' : 'normal' }]}>Antiguos</Text>
              </TouchableOpacity>
            </View>

            {/* Categoría: Valor */}
            <Text style={[styles.subFilterLabel, { color: theme.textSecondary }]}>Valor del Movimiento</Text>
            <View style={styles.filterGroupRow}>
              <TouchableOpacity
                style={[styles.filterBadge, sortBy === 'amount_desc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setSortBy('amount_desc')}
              >
                <Text style={[styles.filterBadgeText, { color: sortBy === 'amount_desc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'amount_desc' ? '700' : 'normal' }]}>Mayor valor</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBadge, sortBy === 'amount_asc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setSortBy('amount_asc')}
              >
                <Text style={[styles.filterBadgeText, { color: sortBy === 'amount_asc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'amount_asc' ? '700' : 'normal' }]}>Menor valor</Text>
              </TouchableOpacity>
            </View>

            {/* Categoría: Descripción */}
            <Text style={[styles.subFilterLabel, { color: theme.textSecondary }]}>Descripción</Text>
            <View style={styles.filterGroupRow}>
              <TouchableOpacity
                style={[styles.filterBadge, sortBy === 'desc_asc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setSortBy('desc_asc')}
              >
                <Text style={[styles.filterBadgeText, { color: sortBy === 'desc_asc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'desc_asc' ? '700' : 'normal' }]}>A - Z</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBadge, sortBy === 'desc_desc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setSortBy('desc_desc')}
              >
                <Text style={[styles.filterBadgeText, { color: sortBy === 'desc_desc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'desc_desc' ? '700' : 'normal' }]}>Z - A</Text>
              </TouchableOpacity>
            </View>

            {/* FILTRAR POR TIPO */}
            <Text style={[styles.filterLabel, { color: theme.textSecondary, marginTop: 15 }]}>Filtrar por tipo</Text>
            <View style={styles.filterGroupRow}>
              <TouchableOpacity
                style={[styles.filterBadge, filterType === 'all' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setFilterType('all')}
              >
                <Text style={[styles.filterBadgeText, { color: filterType === 'all' ? '#FFF' : theme.textSecondary, fontWeight: filterType === 'all' ? '700' : 'normal' }]}>Todos</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterBadge,
                  filterType === 'debt' && {
                    backgroundColor: debtor.type === 'deudor' ? '#8B5CF6' : '#EF4444',
                    borderColor: debtor.type === 'deudor' ? '#8B5CF6' : '#EF4444'
                  }
                ]}
                onPress={() => setFilterType('debt')}
              >
                <Text style={[
                  styles.filterBadgeText,
                  {
                    color: filterType === 'debt' ? '#FFF' : theme.textSecondary,
                    fontWeight: filterType === 'debt' ? '700' : 'normal'
                  }
                ]}>
                  {debtor.type === 'ahorro' ? 'Retiros' : 'Deudas'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterBadge,
                  filterType === 'payment' && {
                    backgroundColor: '#10B981',
                    borderColor: '#10B981'
                  }
                ]}
                onPress={() => setFilterType('payment')}
              >
                <Text style={[
                  styles.filterBadgeText,
                  {
                    color: filterType === 'payment' ? '#FFF' : theme.textSecondary,
                    fontWeight: filterType === 'payment' ? '700' : 'normal'
                  }
                ]}>
                  {debtor.type === 'ahorro' ? 'Ahorros' : (debtor.type === 'deuda' ? 'Pagos' : 'Abonos')}
                </Text>
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

      {/* Modal de Menú de Compartir / Reportes */}
      <Modal
        visible={shareMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShareMenuVisible(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { padding: isMobile ? 10 : 20 }]}
          onPress={() => setShareMenuVisible(false)}
        >
          <Pressable
            style={[styles.shareMenuContent, { backgroundColor: theme.card, padding: isMobile ? 10 : 20 }]}
            onPress={(e) => {
              if (Platform.OS === 'web') e.stopPropagation();
            }}
          >
            <View style={styles.shareMenuHeader}>
              <Text style={[styles.shareMenuTitle, { color: theme.text }]}>Opciones de Reporte</Text>
              <TouchableOpacity onPress={() => setShareMenuVisible(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.shareMenuDesc, { color: theme.textSecondary }]}>
              Elige el formato en el que deseas compartir o descargar el resumen de cuenta de {debtor.name}.
            </Text>

            <TouchableOpacity
              style={[styles.shareMenuBtn, { backgroundColor: theme.accent }]}
              onPress={() => {
                setShareMenuVisible(false);
                exportToExcel();
              }}
            >
              <Ionicons name="document-text-outline" size={20} color="#FFF" style={{ marginRight: 10 }} />
              <Text style={styles.shareMenuBtnText}>Descargar Excel (.xlsx)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareMenuBtn, { backgroundColor: '#25D366' }]}
              onPress={() => {
                setShareMenuVisible(false);
                sendWhatsAppSummary();
              }}
            >
              <Ionicons name="logo-whatsapp" size={20} color="#FFF" style={{ marginRight: 10 }} />
              <Text style={styles.shareMenuBtnText}>Enviar por WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareMenuBtnCancel, { borderColor: isDarkMode ? '#333' : '#E5E7EB', borderWidth: 1 }]}
              onPress={() => setShareMenuVisible(false)}
            >
              <Text style={[styles.shareMenuBtnCancelText, { color: theme.textSecondary }]}>Cerrar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20
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
  backArrowText: { fontSize: 28, fontWeight: '300', marginTop: -4 },
  title: { fontSize: 20, fontWeight: 'bold' },
  placeholder: { width: 40 },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  filterTab: {
    flex: 0.31,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '700',
  },

  clientHeader: { alignItems: 'center', marginBottom: 20 },
  clientName: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  clientPhone: { fontSize: 16, marginBottom: 15 },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 15,
  },
  summaryCard: {
    flex: 0.48,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', marginBottom: 5 },
  summaryValue: { fontSize: 18, fontWeight: '800' },

  balanceCard: { padding: 20, borderRadius: 16, width: '100%', alignItems: 'center' },
  balanceLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  balanceAmount: { fontSize: 32, fontWeight: '900' },

  historyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15 },
  list: { paddingBottom: 20 },

  transactionCard: {
    borderRadius: 12,
    marginBottom: 10,
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    overflow: 'hidden',
  },
  tContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
  },
  tInfo: { flex: 1 },
  tDesc: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  tSubDesc: { fontSize: 12 },
  tDate: { fontSize: 12 },
  tAmount: { fontSize: 16, fontWeight: '800' },

  tActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  tActionBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tActionText: {
    fontWeight: '600',
    fontSize: 13,
  },

  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  fabIcon: { color: 'white', fontSize: 30, fontWeight: '600', marginTop: -2 },

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
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '600',
  },
  modalInput: {
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 15,
  },
  rowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    flex: 0.48,
  },
  typeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    backgroundColor: 'transparent',
  },
  typeBtn: {
    flex: 0.48,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  typeBtnText: {
    fontWeight: '700',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  infoCard: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    marginTop: 15,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  infoCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoIcon: {
    marginRight: 10,
  },
  infoText: {
    fontSize: 14,
    flex: 1,
  },
  shareMenuContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    alignItems: 'stretch',
    elevation: 10,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
  },
  shareMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  shareMenuTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  shareMenuDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  shareMenuBtn: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  shareMenuBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  shareMenuBtnCancel: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  shareMenuBtnCancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  filterGroup: {
    width: '100%',
    marginBottom: 8,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  filterOptionText: {
    fontSize: 14,
    marginLeft: 10,
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
    marginTop: 10,
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
  subFilterLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 5,
    marginTop: 5,
  },
  settledDividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 15,
    paddingHorizontal: 10,
  },
  settledDividerLine: {
    flex: 1,
    height: 1,
  },
  settledDividerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 10,
  },
  settledDividerText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
