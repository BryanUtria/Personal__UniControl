import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, SafeAreaView, Platform, Modal, ActivityIndicator, ScrollView, useWindowDimensions, RefreshControl } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../../utils/offlineSync';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

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

  if (isMobile && value >= 1000000) {
    const millions = (value / 1000000).toFixed(3);
    return `${sign}$ ${millions}M`;
  }

  return `${sign}$ ${formatNumber(value)}`;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function DebtorsListScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
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

  // Modal Confirmación de Eliminación
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Cargar clientes desde el servidor backend
  const fetchDebtors = async () => {
    try {
      const response = await apiFetch(`${API_URL}/debtors`, {
        headers: {
          'x-user-id': user ? user.id.toString() : ''
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
  }, [isFocused]);

  // Estados para filtros y ordenación
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [sortBy, setSortBy] = useState('date_desc'); // date_desc, date_asc, name_asc, name_desc, balance_desc
  const [balanceFilter, setBalanceFilter] = useState('all'); // all, debt, credit, zero

  // Cargar filtros del storage al iniciar
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const saved = await AsyncStorage.getItem('@unicontrol_debtors_filter');
        if (saved) {
          const { sortBy: savedSort, balanceFilter: savedFilter } = JSON.parse(saved);
          if (savedSort) setSortBy(savedSort);
          if (savedFilter) setBalanceFilter(savedFilter);
        }
      } catch (e) {
        console.error('Error al cargar filtros de clientes:', e);
      }
    };
    loadFilters();
  }, []);

  // Guardar filtros en el storage cuando cambien
  useEffect(() => {
    const saveFilters = async () => {
      try {
        await AsyncStorage.setItem('@unicontrol_debtors_filter', JSON.stringify({ sortBy, balanceFilter }));
      } catch (e) {
        console.error('Error al guardar filtros de clientes:', e);
      }
    };
    saveFilters();
  }, [sortBy, balanceFilter]);

  const getProcessedDebtors = () => {
    let result = [...debtors];

    // 1. Filtrar por búsqueda de texto
    if (search.trim()) {
      result = result.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
    }

    // 2. Filtrar por tipo de saldo (en contra, a favor, en ceros)
    if (balanceFilter === 'debt') {
      result = result.filter(d => d.totalDebt > 0);
    } else if (balanceFilter === 'credit') {
      result = result.filter(d => d.totalDebt < 0);
    } else if (balanceFilter === 'zero') {
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
    } else {
      setEditingId(null);
      setName('');
      setPhone('');
      setEmail('');
      setIdentification('');
      setAddress('');
      setNotes('');
    }
    setModalVisible(true);
  };

  // Guardar Cliente (Crear o Actualizar)
  const saveClient = async () => {
    if (!name.trim()) return;

    try {
      if (editingId) {
        // Actualizar existente en base de datos
        const response = await apiFetch(`${API_URL}/debtors/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user ? user.id.toString() : ''
          },
          body: JSON.stringify({ name, phone, email, identification, address, notes }),
        });
        if (response.ok) fetchDebtors();
      } else {
        // Crear nuevo en base de datos
        const response = await apiFetch(`${API_URL}/debtors`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user ? user.id.toString() : ''
          },
          body: JSON.stringify({ name, phone, email, identification, address, notes }),
        });
        if (response.ok) fetchDebtors();
      }
      setModalVisible(false);
    } catch (error) {
      console.error('Error al guardar cliente:', error);
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
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
    }
  };

  const deleteClient = (id) => {
    setItemToDelete(id);
    setDeleteModalVisible(true);
  };

  const renderItem = ({ item }) => {
    const isDebt = item.totalDebt > 0;
    const isCredit = item.totalDebt < 0;

    return (
      <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
        {/* Contenido clickeable que lleva al detalle */}
        <TouchableOpacity
          style={[styles.cardContent, { padding: isMobile ? 10 : 20 }]}
          onPress={() => navigation.navigate('DebtorDetail', { debtor: item })}
        >
          <View style={styles.cardInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[styles.name, { color: theme.text, marginBottom: 0, flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">
                {item.name}
              </Text>
              {String(item.id).startsWith('temp_') ? (
                <Ionicons name="cloud-offline-outline" size={16} color="#F59E0B" style={{ marginLeft: 6 }} />
              ) : (
                <Ionicons name="cloud-done-outline" size={16} color="#10B981" style={{ marginLeft: 6 }} />
              )}
            </View>
            <Text style={[styles.phone, { color: theme.textSecondary }]}>{item.phone || 'Sin teléfono'}</Text>
            <Text style={[styles.date, { color: theme.textSecondary }]}>
              Creado: {new Date(item.createdAt).toLocaleString()}
            </Text>
          </View>
          <View style={styles.cardAmount}>
            <Text
              style={[
                styles.amount,
                { color: isDebt ? theme.danger : isCredit ? theme.accent : theme.textSecondary }
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCurrency(item.totalDebt, isMobile)}
            </Text>
            <Text style={[styles.status, { color: theme.textSecondary }]}>
              {isDebt ? 'Debe' : isCredit ? 'A favor' : 'Al día'}
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingHorizontal: isMobile ? 10 : 20, paddingTop: 20 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backCircleBtn, { backgroundColor: theme.card, shadowColor: theme.shadow, marginRight: 10 }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>Deudas y deudores</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 5 : 10 }}>
          <TouchableOpacity onPress={handleRefresh} style={[styles.backCircleBtn, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
            <Ionicons name="refresh" size={22} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFilterMenuVisible(true)} style={[styles.backCircleBtn, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
            <Ionicons name="options-outline" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.searchContainer, { paddingHorizontal: isMobile ? 10 : 20 }]}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.card }]}
          placeholder="Buscar cliente..."
          placeholderTextColor={theme.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredDebtors}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { padding: isMobile ? 10 : 20 }]}
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
        <View style={[styles.modalOverlay, { padding: isMobile ? 10 : 20 }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, padding: isMobile ? 10 : 20 }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingId ? 'Editar Cliente' : 'Nuevo Cliente'}
            </Text>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 5 }}>Nombre *</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text }]}
                placeholder="Nombre completo"
                placeholderTextColor={theme.textSecondary}
                value={name}
                onChangeText={setName}
              />

              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 5 }}>Teléfono</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text }]}
                placeholder="Ej. +57 300 123 4567"
                placeholderTextColor={theme.textSecondary}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />

              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 5 }}>N° Identificación</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text }]}
                placeholder="Cédula, NIT o Pasaporte"
                placeholderTextColor={theme.textSecondary}
                value={identification}
                onChangeText={setIdentification}
              />

              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 5 }}>Correo Electrónico</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text }]}
                placeholder="Ej. cliente@correo.com"
                placeholderTextColor={theme.textSecondary}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />

              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 5 }}>Dirección</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text }]}
                placeholder="Ej. Calle 10 # 5-20"
                placeholderTextColor={theme.textSecondary}
                value={address}
                onChangeText={setAddress}
              />

              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 5 }}>Notas / Observaciones</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, height: 80, textAlignVertical: 'top' }]}
                placeholder="Notas adicionales..."
                placeholderTextColor={theme.textSecondary}
                multiline={true}
                numberOfLines={3}
                value={notes}
                onChangeText={setNotes}
              />
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtnSave, { backgroundColor: theme.accent }]} onPress={saveClient}>
                <Text style={styles.modalBtnTextSave}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Confirmación de Eliminación */}
      <Modal
        visible={deleteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { padding: isMobile ? 10 : 20 }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, padding: isMobile ? 10 : 20 }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Eliminar Cliente</Text>
            <Text style={{ color: theme.textSecondary, marginBottom: 20, textAlign: 'center', fontSize: 16 }}>
              ¿Seguro que deseas eliminar este cliente? Se borrará todo su historial.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setDeleteModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtnSave, { backgroundColor: theme.danger }]} onPress={confirmDelete}>
                <Text style={styles.modalBtnTextSave}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Filtros y Ordenamiento */}
      <Modal
        visible={filterMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFilterMenuVisible(false)}
      >
        <View style={[styles.modalOverlay, { padding: isMobile ? 10 : 20 }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, maxWidth: 360, padding: isMobile ? 10 : 20 }]}>
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
            <Text style={[styles.subFilterLabel, { color: theme.textSecondary }]}>Nombre del Cliente</Text>
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

            {/* FILTRAR POR SALDO */}
            <Text style={[styles.filterLabel, { color: theme.textSecondary, marginTop: 15 }]}>Filtrar por saldo</Text>
            <View style={styles.filterGroupRow}>
              <TouchableOpacity
                style={[styles.filterBadge, balanceFilter === 'all' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setBalanceFilter('all')}
              >
                <Text style={[styles.filterBadgeText, { color: balanceFilter === 'all' ? '#FFF' : theme.textSecondary, fontWeight: balanceFilter === 'all' ? '700' : 'normal' }]}>Todos</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterBadge, balanceFilter === 'debt' && { backgroundColor: theme.danger, borderColor: theme.danger }]}
                onPress={() => setBalanceFilter('debt')}
              >
                <Text style={[styles.filterBadgeText, { color: balanceFilter === 'debt' ? '#FFF' : theme.textSecondary, fontWeight: balanceFilter === 'debt' ? '700' : 'normal' }]}>Deben</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterBadge, balanceFilter === 'credit' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setBalanceFilter('credit')}
              >
                <Text style={[styles.filterBadgeText, { color: balanceFilter === 'credit' ? '#FFF' : theme.textSecondary, fontWeight: balanceFilter === 'credit' ? '700' : 'normal' }]}>A favor</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterBadge, balanceFilter === 'zero' && { backgroundColor: isDarkMode ? '#444' : '#CCC', borderColor: isDarkMode ? '#444' : '#CCC' }]}
                onPress={() => setBalanceFilter('zero')}
              >
                <Text style={[styles.filterBadgeText, { color: balanceFilter === 'zero' ? '#FFF' : theme.textSecondary, fontWeight: balanceFilter === 'zero' ? '700' : 'normal' }]}>Al día</Text>
              </TouchableOpacity>
            </View>

            {/* BOTÓN APLICAR */}
            <TouchableOpacity
              style={[styles.filterApplyBtn, { backgroundColor: theme.accent }]}
              onPress={() => setFilterMenuVisible(false)}
            >
              <Text style={styles.filterApplyBtnText}>Aplicar Filtros</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
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
});
