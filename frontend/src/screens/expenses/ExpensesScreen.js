import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Modal, ScrollView, Platform, Alert, RefreshControl, Switch, useWindowDimensions, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/Button';
import Input from '../../components/Input';
import SidebarLayout from '../../navigation/SidebarLayout';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const formatCurrency = (amount) => {
  return `$ ${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
};

const ICONS = ['wallet-outline', 'home-outline', 'car-outline', 'cart-outline', 'bulb-outline', 'fast-food-outline', 'medkit-outline', 'school-outline', 'airplane-outline'];
const COLORS = ['#4caf50', '#f44336', '#2196f3', '#ff9800', '#9c27b0', '#00bcd4', '#795548', '#607d8b', '#e91e63'];

export default function ExpensesScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [incomeModalVisible, setIncomeModalVisible] = useState(false);
  const [deleteExpenseId, setDeleteExpenseId] = useState(null);
  const [deleteIncomeId, setDeleteIncomeId] = useState(null);

  // Expense Form State
  const [editId, setEditId] = useState(null);
  const [formCategory, setFormCategory] = useState(null);
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formIsPaid, setFormIsPaid] = useState(false);

  // Category Form State
  const [editCatId, setEditCatId] = useState(null);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState(ICONS[0]);
  const [catColor, setCatColor] = useState(COLORS[0]);

  // Income Form State
  const [editIncomeId, setEditIncomeId] = useState(null);
  const [formIncomeDesc, setFormIncomeDesc] = useState('');
  const [formIncomeAmount, setFormIncomeAmount] = useState('');
  const [incomes, setIncomes] = useState([]);

  const monthYearString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const displayMonth = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchExpenses();
    fetchIncomes();
  }, [monthYearString]);

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API_URL}/expenses/categories`, {
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchIncomes = async () => {
    try {
      const response = await fetch(`${API_URL}/expenses/incomes?month_year=${monthYearString}`, {
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        const data = await response.json();
        setIncomes(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/expenses?month_year=${monthYearString}`, {
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        const data = await response.json();
        setExpenses(data);
      }
    } catch (e) {
      console.error(e);
      showToast('Error al cargar gastos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchExpenses(), fetchIncomes()]).then(() => setRefreshing(false));
  }, [monthYearString]);

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const resetExpenseForm = () => {
    setEditId(null);
    setFormCategory(categories.length > 0 ? categories[0].id : null);
    setFormDescription('');
    setFormAmount('');
    setFormIsRecurring(false);
    setFormIsPaid(false);
  };

  const openExpenseModal = (expense = null) => {
    if (categories.length === 0) {
      showToast('Debes crear al menos una categoría primero', 'warning');
      setEditCatId(null);
      setCatName('');
      setCatIcon(ICONS[0]);
      setCatColor(COLORS[0]);
      setCategoryModalVisible(true);
      return;
    }

    if (expense) {
      setEditId(expense.id);
      setFormCategory(expense.category_id);
      setFormDescription(expense.description);
      setFormAmount(expense.amount.toString());
      setFormIsRecurring(!!expense.is_recurring);
      setFormIsPaid(!!expense.is_paid);
    } else {
      resetExpenseForm();
    }
    setExpenseModalVisible(true);
  };

  const handleSaveExpense = async () => {
    if (!formCategory || !formDescription || !formAmount) {
      showToast('Llena todos los campos', 'error');
      return;
    }

    const payload = {
      category_id: formCategory,
      month_year: monthYearString,
      description: formDescription,
      amount: parseFloat(formAmount),
      is_recurring: formIsRecurring,
      is_paid: formIsPaid
    };

    try {
      const url = editId ? `${API_URL}/expenses/${editId}` : `${API_URL}/expenses`;
      const method = editId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        showToast(editId ? 'Gasto actualizado' : 'Gasto creado', 'success');
        setExpenseModalVisible(false);
        fetchExpenses();
      } else {
        const errorData = await response.json();
        showToast(errorData.error || 'Error al guardar', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    }
  };

  const handleDeleteExpense = (id) => {
    setDeleteExpenseId(id);
  };

  const confirmDeleteExpense = async () => {
    if (!deleteExpenseId) return;
    try {
      const response = await fetch(`${API_URL}/expenses/${deleteExpenseId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        showToast('Gasto eliminado', 'success');
        setDeleteExpenseId(null);
        fetchExpenses();
      }
    } catch (e) {
      showToast('Error al eliminar', 'error');
    }
  };

  const resetIncomeForm = () => {
    setEditIncomeId(null);
    setFormIncomeDesc('');
    setFormIncomeAmount('');
  };

  const openIncomeModal = (income = null) => {
    if (income) {
      setEditIncomeId(income.id);
      setFormIncomeDesc(income.description);
      setFormIncomeAmount(income.amount.toString());
    } else {
      resetIncomeForm();
    }
    setIncomeModalVisible(true);
  };

  const handleSaveIncome = async () => {
    if (!formIncomeDesc || !formIncomeAmount) {
      showToast('Llena todos los campos', 'error');
      return;
    }
    try {
      const url = editIncomeId ? `${API_URL}/expenses/incomes/${editIncomeId}` : `${API_URL}/expenses/incomes`;
      const method = editIncomeId ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id.toString() },
        body: JSON.stringify({
          month_year: monthYearString,
          description: formIncomeDesc,
          amount: parseFloat(formIncomeAmount)
        })
      });
      if (response.ok) {
        showToast(editIncomeId ? 'Ingreso actualizado' : 'Ingreso creado', 'success');
        setIncomeModalVisible(false);
        fetchIncomes();
      } else {
        showToast('Error al guardar ingreso', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    }
  };

  const confirmDeleteIncome = async () => {
    if (!deleteIncomeId) return;
    try {
      const response = await fetch(`${API_URL}/expenses/incomes/${deleteIncomeId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        showToast('Ingreso eliminado', 'success');
        setDeleteIncomeId(null);
        fetchIncomes();
      }
    } catch (e) {
      showToast('Error al eliminar', 'error');
    }
  };

  const togglePaidStatus = async (expense) => {
    try {
      const payload = { ...expense, is_paid: !expense.is_paid };
      const response = await fetch(`${API_URL}/expenses/${expense.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        fetchExpenses();
      }
    } catch (e) {
      showToast('Error al cambiar estado', 'error');
    }
  };

  const handleSaveCategory = async () => {
    if (!catName) {
      showToast('El nombre de la categoría es obligatorio', 'error');
      return;
    }
    try {
      const url = editCatId ? `${API_URL}/expenses/categories/${editCatId}` : `${API_URL}/expenses/categories`;
      const method = editCatId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ name: catName, icon: catIcon, color: catColor })
      });
      if (response.ok) {
        showToast(editCatId ? 'Categoría actualizada' : 'Categoría creada', 'success');
        setEditCatId(null);
        setCatName('');
        setCatIcon(ICONS[0]);
        setCatColor(COLORS[0]);
        fetchCategories();
      } else {
        const errorData = await response.json();
        showToast(errorData.error || 'Error al guardar categoría', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    }
  };

  const openEditCategory = (cat) => {
    setEditCatId(cat.id);
    setCatName(cat.name);
    setCatIcon(cat.icon);
    setCatColor(cat.color);
  };

  const handleDeleteCategory = async (id) => {
    try {
      const response = await fetch(`${API_URL}/expenses/categories/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        showToast('Categoría eliminada', 'success');
        fetchCategories();
      } else {
        const errorData = await response.json();
        showToast(errorData.error || 'Error al eliminar', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    }
  };

  const handleGenerateMonth = async () => {
    const prevDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const prevMonthString = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    try {
      const response = await fetch(`${API_URL}/expenses/generate-month`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ previous_month: prevMonthString, target_month: monthYearString })
      });
      if (response.ok) {
        const data = await response.json();
        showToast(`Se importaron ${data.generated} gastos recurrentes de ${monthNames[prevDate.getMonth()]}`, 'success');
        fetchExpenses();
      } else {
        showToast('Error al importar', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    }
  };

  const totalExpenses = expenses.reduce((sum, item) => sum + parseFloat(item.amount), 0);
  const paidExpenses = expenses.filter(i => i.is_paid).reduce((sum, item) => sum + parseFloat(item.amount), 0);
  const pendingExpenses = totalExpenses - paidExpenses;

  const totalIncomes = incomes.reduce((sum, item) => sum + parseFloat(item.amount), 0);
  const restante = totalIncomes - totalExpenses;

  return (
    <SidebarLayout navigation={navigation}>
      <FlatList
        ListHeaderComponent={
          <>
            <View style={[styles.header, { paddingHorizontal: isMobile ? 10 : 20, paddingTop: isMobile ? 10 : 20 }]}>
              <Text style={[styles.title, { color: theme.text }]}>Control de Gastos</Text>
              <Button
                title="Categorías"
                variant="secondary"
                icon={<Ionicons name="grid-outline" size={18} color={theme.text} />}
                onPress={() => {
                  setEditCatId(null);
                  setCatName('');
                  setCatIcon(ICONS[0]);
                  setCatColor(COLORS[0]);
                  setCategoryModalVisible(true);
                }}
              />
            </View>

            <View style={[styles.monthSelector, { backgroundColor: theme.card, padding: isMobile ? 10 : 15, marginHorizontal: isMobile ? 10 : 20 }]}>
              <TouchableOpacity onPress={prevMonth} style={styles.monthBtn}>
                <Ionicons name="chevron-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.monthText, { color: theme.text }]}>{displayMonth}</Text>
              <TouchableOpacity onPress={nextMonth} style={styles.monthBtn}>
                <Ionicons name="chevron-forward" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.summaryContainer, { paddingHorizontal: isMobile ? 10 : 20 }]}>
              <View style={[styles.summaryCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Ingresos</Text>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(totalIncomes)}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Gastos</Text>
                <Text style={[styles.summaryValue, { color: theme.text }]}>{formatCurrency(totalExpenses)}</Text>
                <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4 }}>Pagado: {formatCurrency(paidExpenses)}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Restante</Text>
                <Text style={[styles.summaryValue, { color: restante < 0 ? '#EF4444' : (restante > 0 ? '#10B981' : theme.text) }]}>{formatCurrency(restante)}</Text>
              </View>
            </View>

            <View style={{ marginBottom: 10, paddingHorizontal: isMobile ? 10 : 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>Ingresos del Mes</Text>
                <Button
                  title="Ingreso"
                  variant="secondary"
                  icon={<Ionicons name="add" size={16} color={theme.text} />}
                  onPress={() => openIncomeModal()}
                />
              </View>
              {incomes.map(inc => (
                <View key={inc.id} style={[styles.expenseCard, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 5, padding: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.expenseDesc, { color: theme.text }]}>{inc.description}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                    <Text style={[styles.expenseAmount, { color: '#10B981' }]}>+{formatCurrency(inc.amount)}</Text>
                    <TouchableOpacity onPress={() => openIncomeModal(inc)}>
                      <Ionicons name="pencil" size={18} color={theme.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDeleteIncomeId(inc.id)}>
                      <Ionicons name="trash" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {incomes.length === 0 && (
                <Text style={{ color: theme.textSecondary, textAlign: 'center', marginVertical: 10 }}>No hay ingresos registrados este mes.</Text>
              )}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: isMobile ? 10 : 20 }}>
              <Button
                title={isMobile ? "Importar" : "Importar Mes Anterior"}
                variant="secondary"
                icon={<Ionicons name="sync-outline" size={18} color={theme.text} />}
                onPress={handleGenerateMonth}
              />
              <Button
                title={isMobile ? "Gasto" : "Nuevo Gasto"}
                variant="primary"
                icon={<Ionicons name="add" size={18} color="#FFF" />}
                onPress={() => openExpenseModal()}
              />
            </View>
          </>
        }
        data={expenses}
        keyExtractor={item => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyContainer}>
              <Ionicons name="wallet-outline" size={64} color={theme.border} />
              <Text style={{ color: theme.textSecondary, marginTop: 10, fontSize: 16 }}>No hay gastos en este mes</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={[styles.expenseCard, { backgroundColor: theme.card, borderColor: theme.border, padding: isMobile ? 10 : 15, marginHorizontal: isMobile ? 10 : 20 }]}>
            <TouchableOpacity onPress={() => togglePaidStatus(item)} style={styles.checkbox}>
              <Ionicons
                name={item.is_paid ? "checkmark-circle" : "ellipse-outline"}
                size={28}
                color={item.is_paid ? '#10B981' : theme.textSecondary}
              />
            </TouchableOpacity>

            <View style={[styles.catIconWrap, { backgroundColor: item.category_color + '20' }]}>
              <Ionicons name={item.category_icon || 'wallet-outline'} size={20} color={item.category_color} />
            </View>

            <View style={styles.expenseInfo}>
              <Text style={[styles.expenseDesc, { color: theme.text, textDecorationLine: item.is_paid ? 'line-through' : 'none' }]}>
                {item.description}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{item.category_name}</Text>
                {item.is_recurring ? (
                  <View style={{ backgroundColor: '#F59E0B20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: 'bold' }}>Recurrente</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.expenseRight}>
              <Text style={[styles.expenseAmount, { color: item.is_paid ? '#10B981' : theme.text }]}>
                {formatCurrency(item.amount)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <TouchableOpacity onPress={() => openExpenseModal(item)}>
                  <Ionicons name="pencil" size={18} color={theme.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteExpense(item.id)}>
                  <Ionicons name="trash" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

      {/* MODAL GASTOS */}
      <Modal visible={expenseModalVisible} transparent animationType="fade" onRequestClose={() => setExpenseModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setExpenseModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: theme.card, padding: 0 }]}>
                <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>{editId ? 'Editar Gasto' : 'Nuevo Gasto'}</Text>

                  <Text style={{ color: theme.text, marginBottom: 5 }}>Categoría</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 }}>
                    {categories.map(cat => (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => setFormCategory(cat.id)}
                        style={[
                          styles.catBadge,
                          { backgroundColor: cat.color + '15', borderColor: formCategory === cat.id ? cat.color : 'transparent' }
                        ]}
                      >
                        <Ionicons name={cat.icon} size={16} color={cat.color} />
                        <Text style={{ color: cat.color, fontSize: 12, fontWeight: formCategory === cat.id ? 'bold' : 'normal' }}>{cat.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Input label="Descripción" value={formDescription} onChangeText={setFormDescription} placeholder="Ej. Pago de Luz" />
                  <Input label="Valor" value={formAmount} onChangeText={setFormAmount} keyboardType="numeric" placeholder="0.00" />

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 15, paddingHorizontal: 5 }}>
                    <Text style={{ color: theme.text }}>Gasto Recurrente mensual</Text>
                    <Switch value={formIsRecurring} onValueChange={setFormIsRecurring} trackColor={{ false: '#767577', true: theme.accent }} />
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
                    <Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => setExpenseModalVisible(false)} />
                    <Button title="Guardar" variant="primary" style={{ flex: 1 }} onPress={handleSaveExpense} />
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL CATEGORIAS */}
      <Modal visible={categoryModalVisible} transparent animationType="fade" onRequestClose={() => { setCategoryModalVisible(false); setEditCatId(null); }}>
        <TouchableWithoutFeedback onPress={() => { setCategoryModalVisible(false); setEditCatId(null); }}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: theme.card, width: '90%', maxWidth: 500, padding: 0 }]}>
                <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 0 }]}>Mis Categorías</Text>
                    <TouchableOpacity onPress={() => { setCategoryModalVisible(false); setEditCatId(null); }}>
                      <Ionicons name="close" size={24} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ marginBottom: 20 }}>
                    <Input label={editCatId ? "Editar Categoría" : "Nueva Categoría"} value={catName} onChangeText={setCatName} placeholder="Nombre de categoría" />

                    <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 5 }}>Color</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 }}>
                      {COLORS.map(c => (
                        <TouchableOpacity
                          key={c}
                          onPress={() => setCatColor(c)}
                          style={[styles.colorDot, { backgroundColor: c, borderWidth: catColor === c ? 2 : 0, borderColor: theme.text }]}
                        />
                      ))}
                    </View>

                    <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 5 }}>Ícono</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 }}>
                      {ICONS.map(i => (
                        <TouchableOpacity
                          key={i}
                          onPress={() => setCatIcon(i)}
                          style={{ padding: 8, borderRadius: 8, backgroundColor: catIcon === i ? theme.accent + '20' : 'transparent' }}
                        >
                          <Ionicons name={i} size={24} color={catIcon === i ? theme.accent : theme.textSecondary} />
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {editCatId && (
                        <Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => { setEditCatId(null); setCatName(''); }} />
                      )}
                      <Button title={editCatId ? "Guardar" : "Añadir Categoría"} variant="primary" style={{ flex: 1 }} onPress={handleSaveCategory} />
                    </View>
                  </View>

                  <Text style={{ color: theme.text, fontWeight: 'bold', marginBottom: 10, marginTop: 10 }}>Categorías Existentes</Text>
                  <View>
                    {categories.map(cat => (
                      <View key={cat.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Ionicons name={cat.icon} size={20} color={cat.color} />
                          <Text style={{ color: theme.text }}>{cat.name}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 15 }}>
                          <TouchableOpacity onPress={() => openEditCategory(cat)}>
                            <Ionicons name="pencil" size={18} color={theme.accent} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteCategory(cat.id)}>
                            <Ionicons name="trash" size={18} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL CONFIRMAR ELIMINAR */}
      <Modal visible={deleteExpenseId !== null} transparent animationType="fade" onRequestClose={() => setDeleteExpenseId(null)}>
        <TouchableWithoutFeedback onPress={() => setDeleteExpenseId(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: theme.card, maxWidth: 350, padding: 20 }]}>
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#EF444420', justifyContent: 'center', alignItems: 'center', marginBottom: 15 }}>
                    <Ionicons name="trash-outline" size={30} color="#EF4444" />
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.text, textAlign: 'center', marginBottom: 10 }}>¿Eliminar este gasto?</Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center' }}>Esta acción no se puede deshacer.</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => setDeleteExpenseId(null)} />
                  <Button title="Eliminar" variant="primary" style={{ flex: 1, backgroundColor: '#EF4444', borderColor: '#EF4444' }} onPress={confirmDeleteExpense} />
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL INGRESOS */}
      <Modal visible={incomeModalVisible} transparent animationType="fade" onRequestClose={() => setIncomeModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setIncomeModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: theme.card, padding: 0 }]}>
                <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>{editIncomeId ? 'Editar Ingreso' : 'Nuevo Ingreso'}</Text>
                  <Input label="Descripción" value={formIncomeDesc} onChangeText={setFormIncomeDesc} placeholder="Ej. Sueldo, Venta, etc." />
                  <Input label="Valor" value={formIncomeAmount} onChangeText={setFormIncomeAmount} keyboardType="numeric" placeholder="0.00" />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
                    <Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => setIncomeModalVisible(false)} />
                    <Button title="Guardar" variant="primary" style={{ flex: 1 }} onPress={handleSaveIncome} />
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL CONFIRMAR ELIMINAR INGRESO */}
      <Modal visible={deleteIncomeId !== null} transparent animationType="fade" onRequestClose={() => setDeleteIncomeId(null)}>
        <TouchableWithoutFeedback onPress={() => setDeleteIncomeId(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: theme.card, maxWidth: 350, padding: 20 }]}>
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#EF444420', justifyContent: 'center', alignItems: 'center', marginBottom: 15 }}>
                    <Ionicons name="trash-outline" size={30} color="#EF4444" />
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.text, textAlign: 'center', marginBottom: 10 }}>¿Eliminar este ingreso?</Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center' }}>Esta acción no se puede deshacer.</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => setDeleteIncomeId(null)} />
                  <Button title="Eliminar" variant="primary" style={{ flex: 1, backgroundColor: '#EF4444', borderColor: '#EF4444' }} onPress={confirmDeleteIncome} />
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 15, paddingTop: 15 },
  title: { fontSize: 24, fontWeight: 'bold' },
  monthSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderRadius: 12, marginBottom: 10, marginHorizontal: 15 },
  monthBtn: { padding: 5 },
  monthText: { fontSize: 18, fontWeight: 'bold' },
  summaryContainer: { flexDirection: 'row', gap: 10, marginBottom: 10, paddingHorizontal: 15 },
  summaryCard: { flex: 1, padding: 10, borderRadius: 12, alignItems: 'center', elevation: 2 },
  summaryLabel: { fontSize: 12, marginBottom: 5 },
  summaryValue: { fontSize: 16, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  expenseCard: { flexDirection: 'row', padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 10, alignItems: 'center', height: 70 },
  checkbox: { marginRight: 10 },
  catIconWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  expenseInfo: { flex: 1 },
  expenseDesc: { fontSize: 16, fontWeight: '600' },
  expenseRight: { alignItems: 'flex-end' },
  expenseAmount: { fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 400, borderRadius: 20, padding: 0, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  colorDot: { width: 30, height: 30, borderRadius: 15 }
});
