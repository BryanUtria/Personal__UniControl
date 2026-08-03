import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, Modal, ActivityIndicator, ScrollView, useWindowDimensions, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../../utils/offlineSync';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDateToLocal } from '../../utils/dateUtils';
import { Ionicons } from '@expo/vector-icons';
import SidebarLayout from '../../navigation/SidebarLayout';
import Input from '../../components/Input';
import { useModules } from '../../context/ModuleContext';
import { useShop } from '../../context/ShopContext';

const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const formatCurrency = (amount, isMobile = false) => {
  const value = Math.abs(amount);
  let sign = '';
  if (amount > 0) {
    sign = '- ';
  } else if (amount < 0) {
    sign = '+ ';
  }

  return `${sign}$ ${formatNumber(value)}`;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function DebtorsListScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { activeShop } = useShop();
  const { moduleSettings, saveModuleSettings } = useModules();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [search, setSearch] = useState('');
  const [debtors, setDebtors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDebtors();
    setRefreshing(false);
  };

  // Estados para el Modal CRUD
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [identification, setIdentification] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState('deudor'); // 'deudor' | 'deuda' | 'ahorro'
  const [isSavingClient, setIsSavingClient] = useState(false);

  // Modal Confirmación de Eliminación
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Cargar clientes desde el servidor backend
  const fetchDebtors = async () => {
    try {
      const response = await apiFetch(`${API_URL}/debtors`, {
        headers: {
          'x-user-id': user ? user.id.toString() : '',
          'x-shop-id': activeShop ? activeShop.id.toString() : ''
        }
      });
      const data = await response.json();
      setDebtors(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('Error al cargar deudores:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchDebtors();
    }
  }, [isFocused, activeShop]);

  // Estados para filtros y ordenación
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [sortBy, setSortBy] = useState('date_desc'); // date_desc, date_asc, name_asc, name_desc, balance_desc
  const [unifiedFilter, setUnifiedFilter] = useState('all'); // all, deben, deudores, saving, zero

  const isFilterLoaded = React.useRef(false);

  // Cargar filtros del storage al iniciar
  useEffect(() => {
    if (moduleSettings.unicontrol_debtors_filter && !isFilterLoaded.current) {
      isFilterLoaded.current = true;
      try {
        const saved = moduleSettings.unicontrol_debtors_filter;
        const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
        if (parsed.sortBy) setSortBy(parsed.sortBy);
        if (parsed.unifiedFilter) {
          setUnifiedFilter(parsed.unifiedFilter);
        } else if (parsed.balanceFilter || parsed.typeFilter) {
          // Migrar antiguos filtros si existieran
          if (parsed.balanceFilter === 'zero') {
            setUnifiedFilter('zero');
          } else if (parsed.balanceFilter === 'credit') {
            setUnifiedFilter('saving');
          } else if (parsed.typeFilter === 'supplier') {
            setUnifiedFilter('deben');
          } else if (parsed.typeFilter === 'client') {
            setUnifiedFilter('deudores');
          }
        }
      } catch (e) {
        console.error('Error al cargar filtros de clientes:', e);
      }
    }
  }, [moduleSettings.unicontrol_debtors_filter]);

  // Guardar filtros en el storage cuando cambien
  useEffect(() => {
    const saveFilters = async () => {
      try {
        if (moduleSettings.unicontrol_debtors_filter !== undefined || sortBy !== 'date_desc' || unifiedFilter !== 'all') {
          await saveModuleSettings({ ...moduleSettings, unicontrol_debtors_filter: { sortBy, unifiedFilter } });
        }
      } catch (e) {
        console.error('Error al guardar filtros de clientes:', e);
      }
    };
    saveFilters();
  }, [sortBy, unifiedFilter]);

  const getProcessedDebtors = () => {
    let result = [...debtors];

    // 1. Filtrar por búsqueda de texto
    if (search.trim()) {
      result = result.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
    }

    // 2. Filtrar por el filtro unificado (Todo, Deben, Deudores, Ahorro, Al dia)
    if (unifiedFilter === 'deben') {
      // Deben (Deudas / Suppliers con saldo > 0)
      result = result.filter(d => d.type === 'deuda' && d.totalDebt > 0);
    } else if (unifiedFilter === 'deudores') {
      // Deudores (Clients con saldo > 0)
      result = result.filter(d => (d.type === 'deudor' || !d.type) && d.totalDebt > 0);
    } else if (unifiedFilter === 'saving') {
      // Ahorro (type saving o cualquier cuenta con saldo a favor < 0)
      result = result.filter(d => d.type === 'ahorro' || d.totalDebt < 0);
    } else if (unifiedFilter === 'zero') {
      // Al día (saldo 0)
      result = result.filter(d => d.totalDebt === 0 || !d.totalDebt);
    }

    // 3. Ordenar por fecha, nombre o saldo
    result.sort((a, b) => {
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'name_desc') {
        return b.name.localeCompare(a.name);
      } else if (sortBy === 'date_asc') {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      } else if (sortBy === 'date_desc') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      } else if (sortBy === 'balance_desc') {
        // Ordenar por magnitud de saldo (los que más deben o tienen saldo a favor primero)
        return Math.abs(b.totalDebt || 0) - Math.abs(a.totalDebt || 0);
      } else if (sortBy === 'balance_asc') {
        // Ordenar por menor magnitud de saldo (los que menos deben o están al día primero)
        return Math.abs(a.totalDebt || 0) - Math.abs(b.totalDebt || 0);
      }
      return 0;
    });

    return result;
  };

  const filteredDebtors = getProcessedDebtors();

  // Abrir Modal para Crear o Editar
  const openModal = (debtor = null) => {
    if (debtor) {
      setEditingId(debtor.id);
      setName(debtor.name);
      setPhone(debtor.phone || '');
      setEmail(debtor.email || '');
      setIdentification(debtor.identification || '');
      setAddress(debtor.address || '');
      setNotes(debtor.notes || '');
      setType(debtor.type || 'deudor');
    } else {
      setEditingId(null);
      setName('');
      setPhone('');
      setEmail('');
      setIdentification('');
      setAddress('');
      setNotes('');
      setType('deudor');
    }
    setModalVisible(true);
  };

  // Guardar Cliente (Crear o Actualizar)
  const saveClient = async () => {
    if (!name.trim()) return;

    setIsSavingClient(true);
    try {
      if (editingId) {
        // Actualizar existente en base de datos
        const response = await apiFetch(`${API_URL}/debtors/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user ? user.id.toString() : '',
            'x-shop-id': activeShop ? activeShop.id.toString() : ''
          },
          body: JSON.stringify({ name, phone, email, identification, address, notes, type }),
        });
        if (response.ok) fetchDebtors();
      } else {
        // Crear nuevo en base de datos
        const response = await apiFetch(`${API_URL}/debtors`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user ? user.id.toString() : '',
            'x-shop-id': activeShop ? activeShop.id.toString() : ''
          },
          body: JSON.stringify({ name, phone, email, identification, address, notes, type }),
        });
        if (response.ok) fetchDebtors();
      }
      setModalVisible(false);
    } catch (error) {
      console.error('Error al guardar cliente:', error);
    } finally {
      setIsSavingClient(false);
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    setIsSavingClient(true);
    try {
      // Eliminar de la base de datos
      const response = await apiFetch(`${API_URL}/debtors/${itemToDelete}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': user ? user.id.toString() : ''
        }
      });
      if (response.ok) fetchDebtors();
      setDeleteModalVisible(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error al eliminar cliente:', error);
    } finally {
      setIsSavingClient(false);
    }
  };

  const deleteClient = (id) => {
    setItemToDelete(id);
    setDeleteModalVisible(true);
  };

  const renderItem = ({ item }) => {
    const isDebt = item.totalDebt > 0;
    const isCredit = item.totalDebt < 0;
    const isSupplier = item.type === 'deuda';
    const isSaving = item.type === 'ahorro';

    // Determinar colores y etiquetas según tipo
    let amountColor = theme.textSecondary;
    let statusLabel = 'Al día';

    if (isSaving) {
      if (isCredit) {
        amountColor = '#10B981'; // Verde para ahorro
        statusLabel = 'Ahorro';
      } else if (isDebt) {
        amountColor = '#EF4444'; // Rojo para déficit
        statusLabel = 'Déficit';
      }
    } else if (isSupplier) {
      if (isDebt) {
        amountColor = '#EF4444'; // Rojo para proveedor al que le debemos (Deuda)
        statusLabel = 'Le debo';
      } else if (isCredit) {
        amountColor = '#10B981'; // Verde para saldo a favor nuestro
        statusLabel = 'Ahorro';
      }
    } else {
      // Cliente/Deudor
      if (isDebt) {
        amountColor = '#8B5CF6'; // Morado si nos debe (Deudor)
        statusLabel = 'Me debe';
      } else if (isCredit) {
        amountColor = theme.accent; // Azul/Celeste para saldo a favor de cliente
        statusLabel = 'Ahorro';
      }
    }

    // Configurar Badge dinámico
    let badgeBgColor = '#6B728012';
    let badgeBorderColor = '#6B728025';
    let badgeTextColor = '#6B7280';
    let badgeIcon = 'person-outline';
    let badgeText = 'Deudor';

    if (isSaving) {
      badgeBgColor = '#10B98112';
      badgeBorderColor = '#10B98125';
      badgeTextColor = '#10B981';
      badgeIcon = 'wallet-outline';
      badgeText = 'Ahorro';
    } else if (isSupplier) {
      if (isDebt) {
        badgeBgColor = '#EF444412';
        badgeBorderColor = '#EF444425';
        badgeTextColor = '#EF4444';
        badgeIcon = 'card-outline';
        badgeText = 'Deuda';
      } else if (isCredit) {
        badgeBgColor = '#10B98112';
        badgeBorderColor = '#10B98125';
        badgeTextColor = '#10B981';
        badgeIcon = 'wallet-outline';
        badgeText = 'Ahorro';
      } else {
        badgeBgColor = '#6B728012';
        badgeBorderColor = '#6B728025';
        badgeTextColor = '#6B7280';
        badgeIcon = 'card-outline';
        badgeText = 'Deuda';
      }
    } else {
      // Deudor/Client
      if (isDebt) {
        badgeBgColor = '#8B5CF612';
        badgeBorderColor = '#8B5CF625';
        badgeTextColor = '#8B5CF6';
        badgeIcon = 'person-outline';
        badgeText = 'Deudor';
      } else if (isCredit) {
        badgeBgColor = '#3B82F612';
        badgeBorderColor = '#3B82F625';
        badgeTextColor = '#3B82F6';
        badgeIcon = 'wallet-outline';
        badgeText = 'Ahorro';
      } else {
        badgeBgColor = '#6B728012';
        badgeBorderColor = '#6B728025';
        badgeTextColor = '#6B7280';
        badgeIcon = 'person-outline';
        badgeText = 'Deudor';
      }
    }

    return (
      <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
        {/* Contenido clickeable que lleva al detalle */}
        <TouchableOpacity
          style={[styles.cardContent, { padding: isMobile ? 10 : 20 }]}
          onPress={() => navigation.navigate('DebtorDetail', { debtor: item })}
        >
          <View style={styles.cardInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <Text style={[styles.name, { color: theme.text, marginBottom: 0, flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">
                {item.name}
              </Text>
              {item.isSynced === 0 && (
                <Ionicons name="cloud-done-outline" size={16} color="#10B981" style={{ marginLeft: 6 }} />
              )}
            </View>

            {/* Distintivo de Tipo (Deudor, Deuda o Ahorro) */}
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <View style={[
                styles.typeBadge,
                {
                  backgroundColor: badgeBgColor,
                  borderColor: badgeBorderColor
                }
              ]}>
                <Ionicons
                  name={badgeIcon}
                  size={10}
                  color={badgeTextColor}
                  style={{ marginRight: 4 }}
                />
                <Text style={[
                  styles.typeBadgeText,
                  {
                    color: badgeTextColor
                  }
                ]}>
                  {badgeText}
                </Text>
              </View>
            </View>

            <Text style={[styles.phone, { color: theme.textSecondary }]}>{item.phone || 'Sin teléfono'}</Text>
            <Text style={[styles.date, { color: theme.textSecondary }]}>
              Creado: {formatDateToLocal(item.createdAt)}
            </Text>
          </View>
          <View style={styles.cardAmount}>
            <Text
              style={[
                styles.amount,
                { color: amountColor }
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCurrency(item.totalDebt, isMobile)}
            </Text>
            <Text style={[styles.status, { color: theme.textSecondary }]}>
              {statusLabel}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Botones de acción CRUD */}
        <View style={[styles.cardActions, { borderTopColor: isDarkMode ? '#333' : '#F0F0F0' }]}>
          <TouchableOpacity onPress={() => openModal(item)} style={styles.actionBtn}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="pencil" size={14} color={theme.accent} style={{ marginRight: 6 }} />
              <Text style={[styles.actionText, { color: theme.accent }]}>Editar</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => deleteClient(item.id)} style={styles.actionBtn}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="trash-outline" size={14} color={theme.danger} style={{ marginRight: 6 }} />
              <Text style={[styles.actionText, { color: theme.danger }]}>Eliminar</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const headerRightComponent = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Button
        onPress={() => {
          setLoading(true);
          handleRefresh();
        }}
        variant="secondary"
        style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
        icon={<Ionicons name="refresh" size={20} color={theme.text} />}
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
    <SidebarLayout navigation={navigation} title="Deudas y Ahorros" activeRoute="DebtorsList" headerRight={headerRightComponent}>

      <View style={{ paddingHorizontal: isMobile ? 10 : 20, paddingTop: 8, paddingBottom: 10 }}>
        <Input
          icon="search-outline"
          placeholder="Buscar deudor o deuda..."
          value={search}
          onChangeText={setSearch}
          backgroundColor={theme.card}
          rightElement={
            search.length > 0 ? (
              <TouchableOpacity onPress={() => setSearch('')} style={{ paddingRight: 8 }}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            ) : null
          }
          containerStyle={{ marginBottom: 0 }}
        />
      </View>

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={{ color: theme.textSecondary, marginTop: 12, fontSize: 14 }}>Cargando datos...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredDebtors}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingHorizontal: isMobile ? 10 : 20, paddingBottom: isMobile ? 10 : 20, paddingTop: 5 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.accent]}
              tintColor={theme.accent}
            />
          }
        />
      )}

      {/* FAB para agregar cliente */}
      <TouchableOpacity onPress={() => openModal()} style={[styles.fab, { backgroundColor: theme.accent }]}>
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* Modal para Crear / Editar Cliente */}
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
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingId ? (type === 'deudor' ? 'Editar Deudor' : (type === 'ahorro' ? 'Editar Ahorro' : 'Editar Deuda')) : (type === 'deudor' ? 'Nuevo Deudor' : (type === 'ahorro' ? 'Nuevo Ahorro' : 'Nueva Deuda'))}
            </Text>

            {/* Selector de Tipo (Deudor vs Deuda vs Ahorro) */}
            <View style={[styles.typeSelectorContainer, { backgroundColor: isDarkMode ? '#1e1e1e' : '#F3F4F6' }]}>
              <TouchableOpacity
                style={[
                  styles.typeSelectorBtn,
                  type === 'deudor' && { backgroundColor: '#8B5CF6' }
                ]}
                onPress={() => setType('deudor')}
              >
                <Text style={[
                  styles.typeSelectorBtnText,
                  { color: type === 'deudor' ? '#FFF' : theme.textSecondary }
                ]}>
                  Deudor
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeSelectorBtn,
                  type === 'deuda' && { backgroundColor: '#EF4444' }
                ]}
                onPress={() => setType('deuda')}
              >
                <Text style={[
                  styles.typeSelectorBtnText,
                  { color: type === 'deuda' ? '#FFF' : theme.textSecondary }
                ]}>
                  Deuda
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeSelectorBtn,
                  type === 'ahorro' && { backgroundColor: '#10B981' }
                ]}
                onPress={() => setType('ahorro')}
              >
                <Text style={[
                  styles.typeSelectorBtnText,
                  { color: type === 'ahorro' ? '#FFF' : theme.textSecondary }
                ]}>
                  Ahorro
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrolltor={false} contentContainerStyle={{ paddingBottom: 10 }}>
              <Input
                label="Nombre *"
                placeholder="Nombre completo"
                value={name}
                onChangeText={setName}
              />

              <Input
                label="Teléfono"
                placeholder="Ej. +57 300 123 4567"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />

              <Input
                label="N° Identificación"
                placeholder="Cédula, NIT o Pasaporte"
                value={identification}
                onChangeText={setIdentification}
              />

              <Input
                label="Correo Electrónico"
                placeholder="Ej. cliente@correo.com"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />

              <Input
                label="Dirección"
                placeholder="Ej. Calle 10 # 5-20"
                value={address}
                onChangeText={setAddress}
              />

              <Input
                label="Notas / Observaciones"
                placeholder="Notas adicionales..."
                multiline={true}
                numberOfLines={3}
                value={notes}
                onChangeText={setNotes}
              />
            </ScrollView>

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
                onPress={saveClient}
                variant="primary"
                loading={isSavingClient}
                style={{ flex: 1 }}
              />
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
            <Text style={[styles.modalTitle, { color: theme.text }]}>Eliminar Registro</Text>
            <Text style={{ color: theme.textSecondary, marginBottom: 20, textAlign: 'center', fontSize: 16 }}>
              ¿Seguro que deseas eliminar este registro? Se borrará todo su historial.
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
            <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Ordenar por</Text>

            {/* Categoría: Fecha */}
            <Text style={[styles.subFilterLabel, { color: theme.textSecondary }]}>Fecha de Registro</Text>
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

            {/* Categoría: Nombre */}
            <Text style={[styles.subFilterLabel, { color: theme.textSecondary }]}>Nombre</Text>
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

            {/* Categoría: Saldo */}
            <Text style={[styles.subFilterLabel, { color: theme.textSecondary }]}>Saldo Neto</Text>
            <View style={styles.filterGroupRow}>
              <TouchableOpacity
                style={[styles.filterBadge, sortBy === 'balance_desc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setSortBy('balance_desc')}
              >
                <Text style={[styles.filterBadgeText, { color: sortBy === 'balance_desc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'balance_desc' ? '700' : 'normal' }]}>Mayor saldo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBadge, sortBy === 'balance_asc' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setSortBy('balance_asc')}
              >
                <Text style={[styles.filterBadgeText, { color: sortBy === 'balance_asc' ? '#FFF' : theme.textSecondary, fontWeight: sortBy === 'balance_asc' ? '700' : 'normal' }]}>Menor saldo</Text>
              </TouchableOpacity>
            </View>

            {/* FILTRAR POR ESTADO */}
            <Text style={[styles.filterLabel, { color: theme.textSecondary, marginTop: 15 }]}>Filtrar por estado</Text>
            <View style={styles.filterGroupRow}>
              <TouchableOpacity
                style={[styles.filterBadge, unifiedFilter === 'all' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setUnifiedFilter('all')}
              >
                <Text style={[styles.filterBadgeText, { color: unifiedFilter === 'all' ? '#FFF' : theme.textSecondary, fontWeight: unifiedFilter === 'all' ? '700' : 'normal' }]}>Todo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterBadge, unifiedFilter === 'deben' && { backgroundColor: '#EF4444', borderColor: '#EF4444' }]}
                onPress={() => setUnifiedFilter('deben')}
              >
                <Text style={[styles.filterBadgeText, { color: unifiedFilter === 'deben' ? '#FFF' : theme.textSecondary, fontWeight: unifiedFilter === 'deben' ? '700' : 'normal' }]}>Deuda</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterBadge, unifiedFilter === 'deudores' && { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }]}
                onPress={() => setUnifiedFilter('deudores')}
              >
                <Text style={[styles.filterBadgeText, { color: unifiedFilter === 'deudores' ? '#FFF' : theme.textSecondary, fontWeight: unifiedFilter === 'deudores' ? '700' : 'normal' }]}>Deudores</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterBadge, unifiedFilter === 'saving' && { backgroundColor: '#10B981', borderColor: '#10B981' }]}
                onPress={() => setUnifiedFilter('saving')}
              >
                <Text style={[styles.filterBadgeText, { color: unifiedFilter === 'saving' ? '#FFF' : theme.textSecondary, fontWeight: unifiedFilter === 'saving' ? '700' : 'normal' }]}>Ahorro</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterBadge, unifiedFilter === 'zero' && { backgroundColor: isDarkMode ? '#444' : '#CCC', borderColor: isDarkMode ? '#444' : '#CCC' }]}
                onPress={() => setUnifiedFilter('zero')}
              >
                <Text style={[styles.filterBadgeText, { color: unifiedFilter === 'zero' ? '#FFF' : theme.textSecondary, fontWeight: unifiedFilter === 'zero' ? '700' : 'normal' }]}>Al día</Text>
              </TouchableOpacity>
            </View>

            {/* BOTÓN APLICAR */}
            <Button
              title="Aplicar Filtros"
              onPress={() => setFilterMenuVisible(false)}
              variant="primary"
              style={{ marginTop: 15 }}
            />
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
    paddingTop: 20,
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
  searchContainer: { marginVertical: 10 },
  searchInput: {
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  list: { paddingTop: 0 },
  card: {
    borderRadius: 16,
    marginBottom: 15,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardInfo: { flex: 1, marginRight: 15, justifyContent: 'center' },
  name: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  phone: { fontSize: 14, marginBottom: 4 },
  date: { fontSize: 11, fontStyle: 'italic', opacity: 0.8 },
  cardAmount: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 100, maxWidth: '40%', flexShrink: 0 },
  amount: { fontSize: 18, fontWeight: '800', marginBottom: 4, width: '100%', textAlign: 'right' },
  status: { fontSize: 12, fontWeight: '600' },

  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionText: {
    fontWeight: '600',
    fontSize: 14,
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

  // Estilos del Modal
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
  modalInput: {
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
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
  typeSelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    borderRadius: 12,
    padding: 4,
  },
  typeSelectorBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeSelectorBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

