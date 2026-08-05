import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Modal, ScrollView, Platform, Alert, RefreshControl, Switch, useWindowDimensions, TouchableWithoutFeedback, ActivityIndicator, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/Button';
import Input from '../../components/Input';
import SidebarLayout from '../../navigation/SidebarLayout';
import DateTimePicker from '@react-native-community/datetimepicker';

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
  const [incomeModalVisible, setIncomeModalVisible] = useState(false);
  const [deleteExpenseId, setDeleteExpenseId] = useState(null);
  const [deleteIncomeId, setDeleteIncomeId] = useState(null);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyExpense, setHistoryExpense] = useState(null);
  const [unmarkModalVisible, setUnmarkModalVisible] = useState(false);
  const [unmarkExpense, setUnmarkExpense] = useState(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState(null);
  const [activeTab, setActiveTab] = useState('Pendientes'); // 'Pendientes' or 'Pagadas'

  // Expense Form State
  const [editId, setEditId] = useState(null);
  const [formCategory, setFormCategory] = useState(null);
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formIsPaid, setFormIsPaid] = useState(false);
  const [formReminderDate, setFormReminderDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const onChangeDate = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate && event.type !== 'dismissed') {
      const current = formReminderDate || new Date();
      selectedDate.setHours(current.getHours());
      selectedDate.setMinutes(current.getMinutes());
      setFormReminderDate(selectedDate);
      setShowTimePicker(true);
    }
  };

  const onChangeTime = (event, selectedDate) => {
    setShowTimePicker(false);
    if (selectedDate && event.type !== 'dismissed') {
      const current = formReminderDate || new Date();
      const updated = new Date(current);
      updated.setHours(selectedDate.getHours());
      updated.setMinutes(selectedDate.getMinutes());
      setFormReminderDate(updated);
    }
  };

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

  // Import Modal State
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importCandidates, setImportCandidates] = useState({ expenses: [], incomes: [] });
  const [selectedImportIds, setSelectedImportIds] = useState({ expenses: [], incomes: [] });
  const [loadingImportCandidates, setLoadingImportCandidates] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Payment Modal State
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentExpense, setPaymentExpense] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const monthYearString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const displayMonth = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  useFocusEffect(
    useCallback(() => {
      fetchCategories();
    }, [])
  );

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
    setExpenses([]);
    setIncomes([]);
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setExpenses([]);
    setIncomes([]);
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const resetExpenseForm = () => {
    setEditId(null);
    setFormCategory(categories.length > 0 ? categories[0].id : null);
    setFormDescription('');
    setFormAmount('');
    setFormIsRecurring(false);
    setFormIsPaid(false);
    setFormReminderDate(null);
  };

  const openExpenseModal = (expense = null) => {
    if (categories.length === 0) {
      showToast('Debes crear al menos una categoría primero', 'warning');
      navigation.navigate('ExpensesCategories');
      return;
    }

    if (expense) {
      setEditId(expense.id);
      setFormCategory(expense.category_id);
      setFormDescription(expense.description);
      setFormAmount(expense.amount.toString());
      setFormIsRecurring(!!expense.is_recurring);
      setFormIsPaid(!!expense.is_paid);
      setFormReminderDate(expense.reminder_date ? new Date(expense.reminder_date) : null);
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

    const formatToMySQL = (date) => {
      if (!date) return null;
      const pad = (n) => n < 10 ? '0' + n : n;
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const payload = {
      category_id: formCategory,
      month_year: monthYearString,
      description: formDescription,
      amount: parseFloat(formAmount),
      is_recurring: formIsRecurring,
      is_paid: formIsPaid,
      reminder_date: formatToMySQL(formReminderDate),
      payment_date: formIsPaid ? formatToMySQL(new Date()) : null
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
        showToast(errorData.error || 'Error al guardar el pago', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    }
  };

  const toggleReserved = async (expense) => {
    try {
      const payload = {
        ...expense,
        is_reserved: !expense.is_reserved,
        amount_paid: expense.amount_paid
      };
      const response = await fetch(`${API_URL}/expenses/${expense.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        showToast(expense.is_reserved ? 'Reserva cancelada' : 'Dinero reservado', 'success');
        fetchExpenses();
      } else {
        showToast('Error al actualizar reserva', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    }
  };

  const handleDeleteExpense = async (id) => {
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

  const confirmUnmarkExpense = async () => {
    if (!unmarkExpense) return;
    try {
      const payload = { ...unmarkExpense, is_paid: false, amount_paid: 0, payment_date: null, payment_history: null };
      const response = await fetch(`${API_URL}/expenses/${unmarkExpense.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id.toString() },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        fetchExpenses();
        setUnmarkModalVisible(false);
        setUnmarkExpense(null);
      }
    } catch (e) {
      showToast('Error al cambiar estado', 'error');
    }
  };

  const togglePaidStatus = async (expense) => {
    if (expense.is_paid) {
      setUnmarkExpense(expense);
      setUnmarkModalVisible(true);
    } else {
      setPaymentExpense(expense);
      setPaymentAmount((parseFloat(expense.amount) - parseFloat(expense.amount_paid || 0)).toString());
      setPaymentModalVisible(true);
    }
  };

  const handleSavePayment = async (isComplete = false) => {
    if (!paymentExpense) return;
    let newAmountPaid;
    let isNowPaid = false;

    const formatToMySQL = (date) => {
      if (!date) return null;
      const pad = (n) => n < 10 ? '0' + n : n;
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    let addedAmount = 0;
    if (isComplete) {
      newAmountPaid = parseFloat(paymentExpense.amount);
      addedAmount = parseFloat(paymentExpense.amount) - parseFloat(paymentExpense.amount_paid || 0);
      isNowPaid = true;
    } else {
      const enteredAmount = parseFloat(paymentAmount);
      if (isNaN(enteredAmount) || enteredAmount <= 0) {
        showToast('Ingresa un monto válido', 'error');
        return;
      }
      addedAmount = enteredAmount;
      newAmountPaid = parseFloat(paymentExpense.amount_paid || 0) + enteredAmount;
      if (newAmountPaid >= parseFloat(paymentExpense.amount)) {
        isNowPaid = true;
      }
    }

    const currentDateStr = formatToMySQL(new Date());
    let currentHistory = [];
    if (paymentExpense.payment_history) {
      try {
        currentHistory = JSON.parse(paymentExpense.payment_history);
      } catch (e) { }
    }
    currentHistory.push({
      date: currentDateStr,
      amount: addedAmount
    });

    try {
      const payload = {
        ...paymentExpense,
        is_paid: isNowPaid,
        amount_paid: newAmountPaid,
        payment_date: isNowPaid ? currentDateStr : null,
        payment_history: JSON.stringify(currentHistory)
      };
      const response = await fetch(`${API_URL}/expenses/${paymentExpense.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        showToast(isNowPaid ? 'Pago completado' : 'Pago parcial registrado', 'success');
        setPaymentModalVisible(false);
        fetchExpenses();
      } else {
        showToast('Error al registrar el pago', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    }
  };

  const fetchImportCandidates = async () => {
    setLoadingImportCandidates(true);
    try {
      const prevDate = new Date(currentDate);
      prevDate.setMonth(prevDate.getMonth() - 1);
      const prevMonthString = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

      const [resExp, resInc] = await Promise.all([
        fetch(`${API_URL}/expenses?month_year=${prevMonthString}`, { headers: { 'x-user-id': user.id.toString() } }),
        fetch(`${API_URL}/expenses/incomes?month_year=${prevMonthString}`, { headers: { 'x-user-id': user.id.toString() } })
      ]);

      let prevExpenses = [];
      let prevIncomes = [];

      if (resExp.ok) prevExpenses = await resExp.json();
      if (resInc.ok) prevIncomes = await resInc.json();

      const recurringExp = prevExpenses.filter(e => e.is_recurring);

      const isImportedExp = (exp) => expenses.some(e => e.description === exp.description && parseFloat(e.amount) === parseFloat(exp.amount));
      const isImportedInc = (inc) => incomes.some(i => i.description === inc.description && parseFloat(i.amount) === parseFloat(inc.amount));

      const expensesToSelect = recurringExp.filter(e => !isImportedExp(e)).map(e => e.id);
      const incomesToSelect = prevIncomes.filter(i => !isImportedInc(i)).map(i => i.id);

      setImportCandidates({ expenses: recurringExp, incomes: prevIncomes });
      setSelectedImportIds({
        expenses: expensesToSelect,
        incomes: incomesToSelect
      });

      setImportModalVisible(true);
    } catch (e) {
      showToast('Error cargando datos del mes anterior', 'error');
    } finally {
      setLoadingImportCandidates(false);
    }
  };

  const handleGenerateMonth = async () => {
    setIsImporting(true);
    const prevDate = new Date(currentDate);
    prevDate.setMonth(prevDate.getMonth() - 1);
    const prevMonthString = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    try {
      const response = await fetch(`${API_URL}/expenses/generate-month`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({
          previous_month: prevMonthString,
          target_month: monthYearString,
          expense_ids: selectedImportIds.expenses,
          income_ids: selectedImportIds.incomes
        })
      });
      if (response.ok) {
        const data = await response.json();
        showToast(`Se importaron ${data.generated} gastos y ${data.generated_incomes} ingresos`, 'success');
        setImportModalVisible(false);
        fetchExpenses();
        fetchIncomes();
      } else {
        showToast('Error al importar', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const totalExpenses = expenses.reduce((sum, item) => {
    const amount = parseFloat(item.amount || 0);
    const amountPaid = parseFloat(item.amount_paid || 0);
    return sum + Math.max(amount, amountPaid);
  }, 0);

  const paidExpenses = expenses.reduce((sum, item) => {
    const amount = parseFloat(item.amount || 0);
    const amountPaid = parseFloat(item.amount_paid || 0);
    if (item.is_paid) {
      return sum + Math.max(amountPaid, amount); // Legacy fallback
    }
    return sum + amountPaid;
  }, 0);
  
  const pendingExpenses = totalExpenses - paidExpenses;

  const reservedExpenses = expenses.reduce((sum, item) => {
    const amount = parseFloat(item.amount || 0);
    const amountPaid = parseFloat(item.amount_paid || 0);
    return sum + (!item.is_paid && item.is_reserved ? Math.max(0, amount - amountPaid) : 0);
  }, 0);
  const pendingWithoutReserve = pendingExpenses - reservedExpenses;

  const totalIncomes = incomes.reduce((sum, item) => sum + parseFloat(item.amount), 0);
  const restante = totalIncomes - totalExpenses;

  const filteredAndSortedExpenses = useMemo(() => {
    let filtered = expenses;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(exp => (exp.description || '').toLowerCase().includes(q));
    }

    if (filterCategory !== null) {
      filtered = filtered.filter(exp => exp.category_id === filterCategory);
    }

    // Filter by Tab
    if (activeTab === 'Pendientes') {
      filtered = filtered.filter(exp => !exp.is_paid);
    } else {
      filtered = filtered.filter(exp => exp.is_paid);
    }

    return [...filtered].sort((a, b) => {
      // First sort by recurring
      if (a.is_recurring !== b.is_recurring) return a.is_recurring ? -1 : 1;

      // Then by category
      const catA = a.category_name || '';
      const catB = b.category_name || '';
      if (catA.localeCompare(catB) !== 0) return catA.localeCompare(catB);

      // Finally by description
      const descA = a.description || '';
      const descB = b.description || '';
      return descA.localeCompare(descB);
    });
  }, [expenses, searchQuery, filterCategory, activeTab]);

  return (
    <SidebarLayout navigation={navigation} activeRoute="Expenses">
      <FlatList
        ListHeaderComponent={
          <>
            <View style={[styles.header, { paddingHorizontal: 10, paddingTop: 10 }]}>
              <Text style={[styles.title, { color: theme.text }]}>Control de Gastos</Text>
              <Button
                title="Categorías"
                variant="secondary"
                icon={<Ionicons name="grid-outline" size={18} color={theme.text} />}
                onPress={() => {
                  navigation.navigate('ExpensesCategories');
                }}
              />
            </View>

            <View style={[styles.monthSelector, { backgroundColor: theme.card, padding: isMobile ? 10 : 15, marginHorizontal: 10 }]}>
              <TouchableOpacity onPress={prevMonth} style={styles.monthBtn}>
                <Ionicons name="chevron-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.monthText, { color: theme.text }]}>{displayMonth}</Text>
              <TouchableOpacity onPress={nextMonth} style={styles.monthBtn}>
                <Ionicons name="chevron-forward" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.summaryContainer, { paddingHorizontal: 10, marginBottom: 10 }]}>
              <View style={[styles.summaryCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Ingresos</Text>
                <Text style={[styles.summaryValue, { color: '#10B981', fontSize: 14 }]}>{formatCurrency(totalIncomes)}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Gastos Tot.</Text>
                <Text style={[styles.summaryValue, { color: theme.text, fontSize: 14 }]}>{formatCurrency(totalExpenses)}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Restante</Text>
                <Text style={[styles.summaryValue, { color: restante < 0 ? '#EF4444' : (restante > 0 ? '#10B981' : theme.text), fontSize: 14 }]}>{formatCurrency(restante)}</Text>
              </View>
            </View>

            <View style={[styles.summaryContainer, { paddingHorizontal: 10 }]}>
              <View style={[styles.summaryCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]} numberOfLines={1}>Pagado</Text>
                <Text style={[styles.summaryValue, { color: '#10B981', fontSize: 14 }]} numberOfLines={1}>{formatCurrency(paidExpenses)}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]} numberOfLines={1}>Pdte. Total</Text>
                <Text style={[styles.summaryValue, { color: '#EF4444', fontSize: 14 }]} numberOfLines={1}>{formatCurrency(pendingExpenses)}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]} numberOfLines={1}>Pdte. Libre</Text>
                <Text style={[styles.summaryValue, { color: '#F59E0B', fontSize: 14 }]} numberOfLines={1}>{formatCurrency(pendingWithoutReserve)}</Text>
              </View>
            </View>

            {loading ? (
              <View style={{ padding: 60, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={{ color: theme.textSecondary, marginTop: 15, fontSize: 16 }}>Cargando datos...</Text>
              </View>
            ) : (
              <>
                <View style={{ marginBottom: 10, paddingHorizontal: 10 }}>
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#10B98115', justifyContent: 'center', alignItems: 'center' }}>
                          <Ionicons name="trending-up" size={18} color="#10B981" />
                        </View>
                        <Text style={[styles.expenseDesc, { color: theme.text, flex: 1 }]} numberOfLines={1}>{inc.description}</Text>
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
                    <View style={{ alignItems: 'center', marginVertical: 20 }}>
                      <Ionicons name="trending-up-outline" size={48} color={theme.border} />
                      <Text style={{ color: theme.textSecondary, marginTop: 10, fontSize: 14 }}>No hay ingresos registrados este mes</Text>
                    </View>
                  )}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 10 }}>
                  <Button
                    title={isMobile ? "Importar" : "Importar Mes Anterior"}
                    variant="secondary"
                    icon={loadingImportCandidates ? <ActivityIndicator size="small" color={theme.text} /> : <Ionicons name="sync-outline" size={18} color={theme.text} />}
                    onPress={fetchImportCandidates}
                    disabled={loadingImportCandidates}
                  />
                  <Button
                    title={isMobile ? "Gasto" : "Nuevo Gasto"}
                    variant="primary"
                    icon={<Ionicons name="add" size={18} color="#FFF" />}
                    onPress={() => openExpenseModal()}
                  />
                </View>

                {/* FILTROS */}
                <View style={{ paddingHorizontal: 10, marginBottom: 15 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 8, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, marginBottom: 10 }}>
                    <Ionicons name="search" size={18} color={theme.textSecondary} />
                    <TextInput
                      style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: theme.text }}
                      placeholder="Buscar gasto por descripción..."
                      placeholderTextColor={theme.textSecondary}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                    />
                    {searchQuery !== '' && (
                      <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 5 }}>
                        <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 5 }}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: filterCategory === null ? theme.accent : theme.border, backgroundColor: filterCategory === null ? theme.accent : 'transparent' }}
                      onPress={() => setFilterCategory(null)}
                    >
                      <Text style={{ color: filterCategory === null ? '#FFF' : theme.textSecondary, fontSize: 12, fontWeight: filterCategory === null ? 'bold' : 'normal' }}>Todos</Text>
                    </TouchableOpacity>
                    {categories.map(cat => (
                      <TouchableOpacity
                        key={cat.id}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: filterCategory === cat.id ? cat.color : theme.border, backgroundColor: filterCategory === cat.id ? cat.color : 'transparent' }}
                        onPress={() => setFilterCategory(cat.id)}
                      >
                        <Ionicons name={cat.icon} size={14} color={filterCategory === cat.id ? '#FFF' : cat.color} />
                        <Text style={{ color: filterCategory === cat.id ? '#FFF' : theme.textSecondary, fontSize: 12, marginLeft: 4, fontWeight: filterCategory === cat.id ? 'bold' : 'normal' }}>{cat.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  
                  {/* PESTAÑAS (TABS) PENDIENTES / PAGADAS */}
                  <View style={{ flexDirection: 'row', marginTop: 15, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <TouchableOpacity 
                      style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: activeTab === 'Pendientes' ? theme.accent : 'transparent' }}
                      onPress={() => setActiveTab('Pendientes')}
                    >
                      <Text style={{ color: activeTab === 'Pendientes' ? theme.accent : theme.textSecondary, fontWeight: activeTab === 'Pendientes' ? 'bold' : 'normal' }}>Pendientes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: activeTab === 'Pagadas' ? theme.accent : 'transparent' }}
                      onPress={() => setActiveTab('Pagadas')}
                    >
                      <Text style={{ color: activeTab === 'Pagadas' ? theme.accent : theme.textSecondary, fontWeight: activeTab === 'Pagadas' ? 'bold' : 'normal' }}>Pagados</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
          </>
        }
        data={filteredAndSortedExpenses}
        keyExtractor={item => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyContainer}>
              <Ionicons name="wallet-outline" size={64} color={theme.border} />
              <Text style={{ color: theme.textSecondary, marginTop: 10, fontSize: 14 }}>No hay gastos en este mes</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          let showHeader = false;
          let headerText = '';

          const getGroupStr = (exp) => `${exp.is_recurring ? '1' : '0'}`;
          const currentGroup = getGroupStr(item);

          if (index === 0) {
            showHeader = true;
          } else {
            const prevItem = filteredAndSortedExpenses[index - 1];
            if (getGroupStr(prevItem) !== currentGroup) {
              showHeader = true;
            }
          }

          if (showHeader) {
            headerText = item.is_recurring ? 'Recurrentes' : 'No Recurrentes';
          }

          return (
            <View>
              {showHeader && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 10, marginTop: index === 0 ? 0 : 15, marginBottom: 10 }}>
                  <Text style={{ color: theme.textSecondary, fontWeight: 'bold', fontSize: 13, textTransform: 'uppercase', marginRight: 10 }}>{headerText}</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
                </View>
              )}
              <TouchableOpacity activeOpacity={0.8} onPress={() => togglePaidStatus(item)} style={[styles.expenseCard, { backgroundColor: theme.card, borderColor: theme.border, padding: isMobile ? 10 : 15, marginHorizontal: 10 }]}>
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
                  {(parseFloat(item.amount_paid || 0) > parseFloat(item.amount || 0)) ? (
                    <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 2, fontWeight: 'bold' }}>
                      Pagado: {formatCurrency(item.amount_paid)} (Proyectado: {formatCurrency(item.amount)})
                    </Text>
                  ) : (!item.is_paid && parseFloat(item.amount_paid || 0) > 0) ? (
                    <Text style={{ color: theme.accent, fontSize: 12, marginTop: 2, fontWeight: 'bold' }}>
                      Pagado: {formatCurrency(item.amount_paid)} ({(parseFloat(item.amount_paid) / parseFloat(item.amount) * 100).toFixed(0)}%)
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: 6, marginTop: 4 }}>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{item.category_name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {item.is_recurring ? (
                        <View style={{ backgroundColor: '#F59E0B20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                          <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: 'bold' }}>Recurrente</Text>
                        </View>
                      ) : null}
                      {item.is_reserved ? (
                        <View style={{ backgroundColor: '#8B5CF620', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                          <Text style={{ color: '#8B5CF6', fontSize: 10, fontWeight: 'bold' }}>Reservado</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  {item.reminder_date && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Ionicons name="alarm-outline" size={12} color={theme.textSecondary} />
                      <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                        Recordatorio: {new Date(item.reminder_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.expenseRight}>
                  <Text style={[styles.expenseAmount, { color: theme.text, textDecorationLine: item.is_paid ? 'line-through' : 'none' }]}>{formatCurrency(item.amount)}</Text>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    {(item.payment_history && JSON.parse(item.payment_history).length > 0) && (
                      <TouchableOpacity onPress={() => { setHistoryExpense(item); setHistoryModalVisible(true); }} style={{ padding: 4 }}>
                        <Ionicons name="list" size={20} color={theme.textSecondary} />
                      </TouchableOpacity>
                    )}
                    {!item.is_paid && (
                      <TouchableOpacity onPress={() => toggleReserved(item)} style={{ padding: 4 }}>
                        <Ionicons
                          name={item.is_reserved ? 'bookmark' : 'bookmark-outline'}
                          size={20}
                          color={item.is_reserved ? '#8B5CF6' : theme.textSecondary}
                        />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => openExpenseModal(item)} style={{ padding: 4 }}>
                      <Ionicons name="pencil" size={20} color={theme.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteExpense(item.id)}>
                      <Ionicons name="trash" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          );
        }}
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

                  <View style={{ marginVertical: 5, paddingHorizontal: 5 }}>
                    <Text style={{ color: theme.text, marginBottom: 5 }}>Recordatorio (Opcional)</Text>
                    {Platform.OS === 'web' ? (
                      <input
                        type="datetime-local"
                        value={formReminderDate ? new Date(formReminderDate.getTime() - formReminderDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                        onChange={(e) => setFormReminderDate(e.target.value ? new Date(e.target.value) : null)}
                        style={{ padding: 10, borderRadius: 8, border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.text, width: '100%', fontSize: 14 }}
                      />
                    ) : (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ flex: 1, padding: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Ionicons name="calendar" size={18} color={theme.accent} />
                            <Text style={{ color: formReminderDate ? theme.text : theme.textSecondary }}>
                              {formReminderDate ? formReminderDate.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Seleccionar fecha y hora'}
                            </Text>
                          </TouchableOpacity>
                          {formReminderDate && (
                            <TouchableOpacity onPress={() => setFormReminderDate(null)} style={{ padding: 10 }}>
                              <Ionicons name="close-circle" size={20} color="#EF4444" />
                            </TouchableOpacity>
                          )}
                        </View>
                        {showDatePicker && (
                          <DateTimePicker
                            value={formReminderDate || new Date()}
                            mode="date"
                            display="default"
                            onChange={onChangeDate}
                          />
                        )}
                        {showTimePicker && (
                          <DateTimePicker
                            value={formReminderDate || new Date()}
                            mode="time"
                            display="default"
                            onChange={onChangeTime}
                          />
                        )}
                      </>
                    )}
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

      {/* MODAL CONFIRMAR DESMARCAR GASTO */}
      <Modal visible={unmarkModalVisible} transparent animationType="fade" onRequestClose={() => setUnmarkModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setUnmarkModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: theme.card, maxWidth: 350, padding: 20 }]}>
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#F59E0B20', justifyContent: 'center', alignItems: 'center', marginBottom: 15 }}>
                    <Ionicons name="warning-outline" size={30} color="#F59E0B" />
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.text, textAlign: 'center', marginBottom: 10 }}>¿Desmarcar gasto?</Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center' }}>Si desmarcas este gasto, se borrará su historial de pagos parciales y el monto pagado volverá a cero.</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => setUnmarkModalVisible(false)} />
                  <Button title="Desmarcar" variant="primary" style={{ flex: 1, backgroundColor: '#EF4444', borderColor: '#EF4444' }} onPress={confirmUnmarkExpense} />
                </View>
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

      {/* MODAL HISTORIAL DE PAGOS */}
      <Modal visible={historyModalVisible} transparent animationType="slide" onRequestClose={() => setHistoryModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setHistoryModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: theme.card, maxHeight: '90%' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 0 }]}>Historial de Pagos</Text>
                  <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                    <Ionicons name="close" size={24} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>

                {historyExpense && (
                  <View style={{ marginBottom: 15, padding: 10, backgroundColor: theme.border + '40', borderRadius: 8 }}>
                    <Text style={{ color: theme.text, fontWeight: 'bold' }}>{historyExpense.description}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Monto inicial: {formatCurrency(historyExpense.amount)}</Text>
                    <Text style={{ color: theme.accent, fontSize: 13, fontWeight: 'bold' }}>Total Pagado: {formatCurrency(historyExpense.amount_paid)}</Text>
                  </View>
                )}

                <ScrollView showsVerticalScrollIndicator={false}>
                  {historyExpense && historyExpense.payment_history && JSON.parse(historyExpense.payment_history).map((ph, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: theme.accent + '20', justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ color: theme.accent, fontSize: 12, fontWeight: 'bold' }}>{idx + 1}</Text>
                        </View>
                        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                          {new Date(ph.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </Text>
                      </View>
                      <Text style={{ color: theme.text, fontWeight: 'bold' }}>{formatCurrency(ph.amount)}</Text>
                    </View>
                  ))}
                  {historyExpense && (!historyExpense.payment_history || JSON.parse(historyExpense.payment_history).length === 0) && (
                    <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 20 }}>No hay pagos registrados.</Text>
                  )}
                </ScrollView>
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

      {/* MODAL PAGO */}
      <Modal visible={paymentModalVisible} transparent animationType="fade" onRequestClose={() => setPaymentModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setPaymentModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: theme.card, padding: 0 }]}>
                <View style={{ padding: 20 }}>
                  <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 10 }]}>Registrar Pago</Text>
                  <Text style={{ color: theme.textSecondary, marginBottom: 20 }}>
                    ¿Cuánto deseas pagar de <Text style={{ fontWeight: 'bold', color: theme.text }}>{paymentExpense?.description}</Text>?
                  </Text>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ color: theme.text }}>Total Gasto:</Text>
                    <Text style={{ color: theme.text, fontWeight: 'bold' }}>{paymentExpense ? formatCurrency(paymentExpense.amount) : ''}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                    <Text style={{ color: theme.textSecondary }}>Pagado hasta ahora:</Text>
                    <Text style={{ color: theme.accent }}>{paymentExpense ? formatCurrency(paymentExpense.amount_paid || 0) : ''}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                    <Text style={{ color: theme.textSecondary }}>Restante:</Text>
                    <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>{paymentExpense ? formatCurrency(paymentExpense.amount - (paymentExpense.amount_paid || 0)) : ''}</Text>
                  </View>

                  <Input
                    label="Monto a Pagar (Parcial o Total)"
                    placeholder="Ej. 50"
                    keyboardType="numeric"
                    value={paymentAmount}
                    onChangeText={setPaymentAmount}
                  />

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                    <Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => setPaymentModalVisible(false)} />
                    <Button title="Pagar Completo" variant="primary" style={{ flex: 1 }} onPress={() => handleSavePayment(true)} />
                  </View>
                  <View style={{ marginTop: 10 }}>
                    <Button title="Guardar Pago Parcial" variant="primary" style={{ backgroundColor: theme.accent + '30', borderColor: theme.accent }} textStyle={{ color: theme.accent }} onPress={() => handleSavePayment(false)} />
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL IMPORTAR MES ANTERIOR */}
      <Modal visible={importModalVisible} transparent animationType="slide" onRequestClose={() => setImportModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setImportModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: theme.card, padding: 0, maxHeight: '90%' }]}>
                <View style={{ padding: isMobile ? 10 : 20, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                  <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 5 }]}>Importar Mes Anterior</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Selecciona lo que deseas copiar al mes actual.</Text>
                </View>
                <ScrollView contentContainerStyle={{ padding: isMobile ? 10 : 20 }} showsVerticalScrollIndicator={false}>

                  {importCandidates.incomes.length > 0 && (
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.text, marginBottom: 10 }}>Ingresos</Text>
                  )}
                  {importCandidates.incomes.map(inc => {
                    const isImported = incomes.some(i => i.description === inc.description && parseFloat(i.amount) === parseFloat(inc.amount));
                    const isSelected = selectedImportIds.incomes.includes(inc.id);
                    return (
                      <TouchableOpacity
                        key={`inc-${inc.id}`}
                        activeOpacity={isImported ? 1 : 0.7}
                        disabled={isImported}
                        onPress={() => {
                          setSelectedImportIds(prev => ({
                            ...prev,
                            incomes: isSelected ? prev.incomes.filter(id => id !== inc.id) : [...prev.incomes, inc.id]
                          }));
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: isImported ? theme.border + '30' : (isSelected ? theme.accent + '15' : 'transparent'), padding: 10, borderRadius: 8, borderWidth: 1, borderColor: isImported ? theme.border : (isSelected ? theme.accent : theme.border), opacity: isImported ? 0.6 : 1 }}
                      >
                        <Ionicons name={isImported ? "checkmark-done" : (isSelected ? "checkbox" : "square-outline")} size={22} color={isImported ? theme.textSecondary : (isSelected ? theme.accent : theme.textSecondary)} style={{ marginRight: 10 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: isImported ? theme.textSecondary : theme.text, fontWeight: '600', textDecorationLine: isImported ? 'line-through' : 'none' }}>{inc.description}</Text>
                          <Text style={{ color: isImported ? theme.textSecondary : '#10B981', fontSize: 12 }}>+{formatCurrency(inc.amount)} {isImported ? '(Ya importado)' : ''}</Text>
                        </View>
                      </TouchableOpacity>
                    )
                  })}

                  {importCandidates.expenses.length > 0 && (
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.text, marginBottom: 10, marginTop: 0 }}>Gastos Recurrentes</Text>
                  )}
                  {importCandidates.expenses.map(exp => {
                    const isImported = expenses.some(e => e.description === exp.description && parseFloat(e.amount) === parseFloat(exp.amount));
                    const isSelected = selectedImportIds.expenses.includes(exp.id);
                    return (
                      <TouchableOpacity
                        key={`exp-${exp.id}`}
                        activeOpacity={isImported ? 1 : 0.7}
                        disabled={isImported}
                        onPress={() => {
                          setSelectedImportIds(prev => ({
                            ...prev,
                            expenses: isSelected ? prev.expenses.filter(id => id !== exp.id) : [...prev.expenses, exp.id]
                          }));
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: isImported ? theme.border + '30' : (isSelected ? theme.accent + '15' : 'transparent'), padding: 10, borderRadius: 8, borderWidth: 1, borderColor: isImported ? theme.border : (isSelected ? theme.accent : theme.border), opacity: isImported ? 0.6 : 1 }}
                      >
                        <Ionicons name={isImported ? "checkmark-done" : (isSelected ? "checkbox" : "square-outline")} size={22} color={isImported ? theme.textSecondary : (isSelected ? theme.accent : theme.textSecondary)} style={{ marginRight: 10 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: isImported ? theme.textSecondary : theme.text, fontWeight: '600', textDecorationLine: isImported ? 'line-through' : 'none' }}>{exp.description}</Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{formatCurrency(exp.amount)} {isImported ? '(Ya importado)' : ''}</Text>
                        </View>
                      </TouchableOpacity>
                    )
                  })}

                  {importCandidates.incomes.length === 0 && importCandidates.expenses.length === 0 && (
                    <Text style={{ color: theme.textSecondary, textAlign: 'center', marginVertical: 20 }}>No hay ingresos ni gastos recurrentes en el mes anterior.</Text>
                  )}

                </ScrollView>
                <View style={{ padding: isMobile ? 10 : 20, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', gap: 10 }}>
                  <Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => setImportModalVisible(false)} disabled={isImporting} />
                  <Button
                    title={isImporting ? "Importando..." : "Importar"}
                    variant="primary"
                    style={{ flex: 1 }}
                    onPress={handleGenerateMonth}
                    icon={isImporting ? <ActivityIndicator size="small" color="#FFF" /> : null}
                    disabled={isImporting || (selectedImportIds.expenses.length === 0 && selectedImportIds.incomes.length === 0)}
                  />
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
  expenseCard: { flexDirection: 'row', padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 10, alignItems: 'center', minHeight: 70 },
  checkbox: { marginRight: 10 },
  catIconWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  expenseInfo: { flex: 1 },
  expenseDesc: { fontSize: 16, fontWeight: '600' },
  expenseRight: { alignItems: 'flex-end' },
  expenseAmount: { fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 400, borderRadius: 20, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  colorDot: { width: 30, height: 30, borderRadius: 15 }
});
