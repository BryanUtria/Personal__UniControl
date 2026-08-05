import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Platform, Alert, Modal, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import SidebarLayout from '../../navigation/SidebarLayout';
import HabitsCalendar from './HabitsCalendar';
import HabitFormModal from './HabitFormModal';
import Button from '../../components/Button';
import { apiFetch } from '../../utils/offlineSync';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const getLocalYMD = (date = new Date()) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function HabitsScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getLocalYMD());
  const [activeTab, setActiveTab] = useState('calendar'); // 'today' or 'calendar'

  const [formVisible, setFormVisible] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [habitToDelete, setHabitToDelete] = useState(null);

  // El módulo de Hábitos es GRATUITO (igual que Deudas/Ahorros y Control de Gastos),
  // por lo que NO se bloquea ni se solicita suscripción. Se carga directamente.

  const fetchHabits = async () => {
    try {
      const response = await fetch(`${API_URL}/habits`, {
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        const data = await response.json();
        setHabits(data);
      }
    } catch (e) {
      console.error('Error cargando hábitos:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHabits();
  }, [user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHabits();
  }, []);

  const getHabitsForDate = (dateStr) => {
    const [y, m, day] = dateStr.split('-');
    const safeDate = new Date(y, m - 1, day);
    const dayOfWeek = safeDate.getDay(); // 0 (Sun) - 6 (Sat)
    const dayOfMonthStr = day;

    return habits.filter(h => {
      // Si el hábito tiene una fecha de inicio configurada y la fecha seleccionada es anterior, no lo mostramos
      if (h.start_date && dateStr < h.start_date) {
        return false;
      }
      
      // Si el hábito fue archivado (editado o eliminado) en el pasado, y esta fecha es posterior, no lo mostramos
      if (h.archived_date && dateStr > h.archived_date) {
        return false;
      }

      if (h.frequency === 'daily') return true;

      if (h.frequency === 'specific_days' && h.repeat_details && h.repeat_details.days) {
        return h.repeat_details.days.includes(dayOfWeek.toString());
      }

      if (h.frequency === 'weekly') {
        if (!h.start_date) return true; // Por defecto
        const [sy, sm, sday] = h.start_date.split('-');
        const safeStartDate = new Date(sy, sm - 1, sday);
        return safeStartDate.getDay() === dayOfWeek;
      }

      if (h.frequency === 'monthly') {
        if (!h.start_date) return true; // Por defecto
        const startDayStr = h.start_date.split('-')[2];
        return startDayStr === dayOfMonthStr;
      }

      if (h.frequency === 'once') {
        // 'once' means it only happens on its start_date
        return h.start_date ? dateStr === h.start_date : true;
      }
      return false;
    });
  };

  const toggleHabit = async (habitId, isCompleted) => {
    // Optimistic UI update
    setHabits(prev => prev.map(h => {
      if (h.id === habitId) {
        return {
          ...h,
          logs: {
            ...h.logs,
            [selectedDate]: !isCompleted
          }
        };
      }
      return h;
    }));

    try {
      await fetch(`${API_URL}/habits/${habitId}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ date: selectedDate, completed: !isCompleted })
      });
    } catch (e) {
      console.error(e);
      showToast('Error al actualizar hábito', 'error');
      // Revert if error
      fetchHabits();
    }
  };

  const handleSaveHabit = async (habitData) => {
    try {
      const url = editingHabit ? `${API_URL}/habits/${editingHabit.id}` : `${API_URL}/habits`;
      const method = editingHabit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ ...habitData, edit_date: selectedDate })
      });

      if (!response.ok) throw new Error('Error al guardar');

      showToast('Hábito guardado con éxito', 'success');
      fetchHabits();
    } catch (e) {
      throw e;
    }
  };

  const handleDeleteHabit = (habit) => {
    setHabitToDelete(habit);
    setDeleteModalVisible(true);
  };

  const confirmDeleteHabit = async () => {
    if (!habitToDelete) return;

    try {
      const response = await fetch(`${API_URL}/habits/${habitToDelete.id}?date=${selectedDate}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user.id.toString() }
      });
      if (!response.ok) throw new Error('Error al eliminar');
      showToast('Eliminado con éxito', 'success');
      setDeleteModalVisible(false);
      setHabitToDelete(null);
      fetchHabits();
    } catch (e) {
      showToast('Error al eliminar', 'error');
    }
  };

  const openNewHabit = () => {
    setEditingHabit(null);
    setFormVisible(true);
  };

  const activeHabitsToday = getHabitsForDate(selectedDate);
  const completedToday = activeHabitsToday.filter(h => h.logs && h.logs[selectedDate] === true).length;
  const progress = activeHabitsToday.length > 0 ? (completedToday / activeHabitsToday.length) * 100 : 0;

  const getRelativeDateLabel = (dateStr) => {
    const todayStr = getLocalYMD();

    const todayObj = new Date();
    todayObj.setHours(0, 0, 0, 0);

    const yesterdayObj = new Date(todayObj);
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayStr = getLocalYMD(yesterdayObj);

    const tomorrowObj = new Date(todayObj);
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrowStr = getLocalYMD(tomorrowObj);

    if (dateStr === todayStr) return 'Hoy';
    if (dateStr === yesterdayStr) return 'Ayer';
    if (dateStr === tomorrowStr) return 'Mañana';

    // Si es otra fecha, como "15 Oct"
    const [y, m, d] = dateStr.split('-');
    const dateObj = new Date(y, m - 1, d);
    const options = { month: 'short', day: 'numeric' };
    return dateObj.toLocaleDateString('es-ES', options);
  };

  let totalMonthHabits = 0;
  let completedMonthHabits = 0;
  if (activeTab === 'today') {
    const [y, m, d] = selectedDate.split('-');
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const currentDay = parseInt(d, 10);

    for (let day = 1; day <= currentDay; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const habitsForDay = getHabitsForDate(dateStr);
      totalMonthHabits += habitsForDay.length;
      habitsForDay.forEach(h => {
        if (h.logs && h.logs[dateStr] === true) {
          completedMonthHabits++;
        }
      });
    }
  }
  const monthProgress = totalMonthHabits > 0 ? (completedMonthHabits / totalMonthHabits) * 100 : 0;
  // const monthSummaryTitle = `Resumen del Mes (hasta ${getRelativeDateLabel(selectedDate).toLowerCase()})`;
  const monthSummaryTitle = `Resumen del Mes`;

  return (
    <SidebarLayout title="Hábitos y Tareas" activeRoute="Habits" navigation={navigation}>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} />
        }
      >
        <View style={[styles.content, { padding: 10 }]}>

          <View style={styles.headerRow}>
            <Text style={[styles.pageTitle, { color: theme.text }]}>Mi Progreso</Text>
            <Button
              title="Nuevo"
              icon={<Ionicons name="add" size={18} color="#fff" style={{ marginRight: 0 }} />}
              onPress={openNewHabit}
              style={{ borderRadius: 20, paddingVertical: 8, paddingHorizontal: 15 }}
            />
          </View>

          {(() => {
            const tabLabel = getRelativeDateLabel(selectedDate);

            return (
              <View style={[styles.tabsContainer, { backgroundColor: isDarkMode ? '#374151' : '#F3F4F6' }]}>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'calendar' && [styles.tabActive, { backgroundColor: theme.card, shadowColor: theme.shadow }]]}
                  onPress={() => setActiveTab('calendar')}
                >
                  <Text style={[styles.tabText, { color: activeTab === 'calendar' ? theme.accent : theme.textSecondary }]}>Calendario</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'today' && [styles.tabActive, { backgroundColor: theme.card, shadowColor: theme.shadow }]]}
                  onPress={() => setActiveTab('today')}
                >
                  <Text style={[styles.tabText, { color: activeTab === 'today' ? theme.accent : theme.textSecondary }]}>{tabLabel}</Text>
                </TouchableOpacity>
              </View>
            );
          })()}

          {activeTab === 'calendar' ? (
            <HabitsCalendar
              habits={habits}
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
              getHabitsForDate={getHabitsForDate}
            />
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 15, marginBottom: 5 }}>
                {/* Resumen del Mes */}
                <View style={[styles.statsCard, { flex: 1, minWidth: 280, marginBottom: 0, backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
                  <View style={styles.statsHeader}>
                    <View style={[styles.statsIconWrap, { backgroundColor: theme.accent + '15' }]}>
                      <Ionicons name="calendar-outline" size={24} color={theme.accent} />
                    </View>
                    <View style={styles.statsTextWrap}>
                      <Text style={[styles.statsTitle, { color: theme.text }]}>{monthSummaryTitle}</Text>
                      <Text style={[styles.statsDesc, { color: theme.textSecondary }]}>
                        {completedMonthHabits} de {totalMonthHabits} tareas completadas
                      </Text>
                    </View>
                    <Text style={[styles.statsPercentage, { color: theme.accent }]}>
                      {Math.round(monthProgress)}%
                    </Text>
                  </View>
                  <View style={[styles.progressBarBg, { backgroundColor: isDarkMode ? '#4B5563' : '#E5E7EB' }]}>
                    <View style={[styles.progressBarFill, { backgroundColor: theme.accent, width: `${monthProgress}%` }]} />
                  </View>
                </View>

                {/* Resumen del Día */}
                <View style={[styles.statsCard, { flex: 1, minWidth: 280, marginBottom: 0, backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
                  <View style={styles.statsHeader}>
                    <View style={[styles.statsIconWrap, { backgroundColor: theme.accent + '15' }]}>
                      <Ionicons name="trophy" size={24} color={theme.accent} />
                    </View>
                    <View style={styles.statsTextWrap}>
                      <Text style={[styles.statsTitle, { color: theme.text }]}>Resumen del Día</Text>
                      <Text style={[styles.statsDesc, { color: theme.textSecondary }]}>
                        {completedToday} de {activeHabitsToday.length} hábitos completados
                      </Text>
                    </View>
                    <Text style={[styles.statsPercentage, { color: theme.accent }]}>
                      {Math.round(progress)}%
                    </Text>
                  </View>
                  <View style={[styles.progressBarBg, { backgroundColor: isDarkMode ? '#4B5563' : '#E5E7EB' }]}>
                    <View style={[styles.progressBarFill, { backgroundColor: theme.accent, width: `${progress}%` }]} />
                  </View>
                </View>
              </View>

              <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 10 }]}>
                Actividades para {selectedDate === getLocalYMD() ? 'Hoy' : selectedDate}
              </Text>

              {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 20 }} />
              ) : activeHabitsToday.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="cafe-outline" size={60} color={theme.textLight} />
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                    Día libre.
                  </Text>
                  <Text style={[styles.emptySubText, { color: theme.textLight }]}>
                    No hay tareas ni hábitos programados para hoy.
                  </Text>
                </View>
              ) : (
                <View style={styles.habitsList}>
                  {(() => {
                    const renderHabitCard = (habit) => {
                      const isCompleted = habit.logs && habit.logs[selectedDate] === true;
                      return (
                        <View
                          key={habit.id}
                          style={[
                            styles.habitCard,
                            { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow, borderLeftColor: habit.color || theme.accent, borderLeftWidth: 4 },
                            isCompleted && { opacity: 0.6 }
                          ]}
                        >
                          <View style={[styles.habitColor, { backgroundColor: habit.color || theme.accent }]} />
                          <View style={styles.habitInfo}>
                            <Text
                              numberOfLines={3}
                              style={[
                                styles.habitName,
                                { color: theme.text },
                                isCompleted && { textDecorationLine: 'line-through', color: theme.textLight }
                              ]}
                            >
                              {habit.type === 'task' ? (
                                <Ionicons name="checkbox-outline" size={14} color={theme.textSecondary} />
                              ) : (
                                <Ionicons name="infinite" size={14} color={theme.textSecondary} />
                              )} {habit.name}
                            </Text>
                            {(habit.start_time || habit.end_time) && (
                              <Text style={[styles.habitTime, { color: theme.textSecondary }]}>
                                <Ionicons name="time-outline" size={12} /> {habit.start_time ? habit.start_time.substring(0, 5) : '--:--'} - {habit.end_time ? habit.end_time.substring(0, 5) : '--:--'}
                              </Text>
                            )}
                            {habit.description ? (
                              <Text style={[styles.habitDesc, { color: theme.textLight }]} numberOfLines={2}>
                                {habit.description}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.cardActions}>
                            <TouchableOpacity
                              style={[styles.actionBtn, { borderColor: theme.border }]}
                              onPress={() => handleDeleteHabit(habit)}
                            >
                              <Ionicons name="trash-outline" size={20} color="#EF4444" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { borderColor: theme.border }]}
                              onPress={() => {
                                setEditingHabit(habit);
                                setFormVisible(true);
                              }}
                            >
                              <Ionicons name="pencil" size={20} color={theme.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.checkbox,
                                { borderColor: isCompleted ? (habit.color || theme.accent) : theme.border },
                                isCompleted && { backgroundColor: habit.color || theme.accent }
                              ]}
                              onPress={() => toggleHabit(habit.id, isCompleted)}
                            >
                              {isCompleted && <Ionicons name="checkmark" size={16} color="#fff" />}
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    };

                    const habitsList = activeHabitsToday.filter(h => h.type !== 'task');
                    const tasksList = activeHabitsToday.filter(h => h.type === 'task');

                    const renderGroup = (groupTitle, list) => {
                      if (list.length === 0) return null;

                      const noTime = list.filter(h => !h.start_time);
                      const withTime = list.filter(h => h.start_time).sort((a, b) => a.start_time.localeCompare(b.start_time));

                      return (
                        <View style={{ marginBottom: 20 }}>
                          <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>{groupTitle}</Text>
                          {noTime.map(renderHabitCard)}

                          {noTime.length > 0 && withTime.length > 0 && (
                            <View style={{
                              borderBottomWidth: 2,
                              borderColor: theme.textLight,
                              borderStyle: 'dashed',
                              marginVertical: 10,
                              opacity: 0.3
                            }} />
                          )}

                          {withTime.map(renderHabitCard)}
                        </View>
                      );
                    };

                    return (
                      <>
                        {renderGroup('Hábitos', habitsList)}
                        {renderGroup('Tareas', tasksList)}
                      </>
                    );
                  })()}
                </View>
              )}
            </>
          )}

        </View>
      </ScrollView>

      <HabitFormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSave={handleSaveHabit}
        editingHabit={editingHabit}
      />

      <Modal
        visible={deleteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="trash-outline" size={32} color="#EF4444" />
            </View>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Eliminar Actividad</Text>
            <Text style={[styles.modalText, { color: theme.textSecondary }]}>
              ¿Estás seguro de que deseas eliminar "{habitToDelete?.name}"? Esta acción no se puede deshacer.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.border }]}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={[styles.modalBtnText, { color: theme.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#EF4444' }]}
                onPress={confirmDeleteHabit}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 15,
    paddingBottom: 40,
    width: '100%',
    alignSelf: 'center',
  },
  lockContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 10,
  },
  lockDesc: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 400,
  },
  unlockBtn: {
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 8,
  },
  unlockBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: 10,
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 5,
  },
  statsCard: {
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 10,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  statsIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  statsTextWrap: {
    flex: 1,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statsDesc: {
    fontSize: 14,
    marginTop: 2,
  },
  statsPercentage: {
    fontSize: 24,
    fontWeight: '900',
  },
  progressBarBg: {
    width: '100%',
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  habitsList: {
    gap: 0,
  },
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 10,
  },
  habitColor: {
    width: 0,
    height: 0,
    marginRight: 0,
  },
  habitInfo: {
    flex: 1,
    marginRight: 10,
    justifyContent: 'center',
  },
  habitName: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  habitTime: {
    fontSize: 12,
    marginTop: 2,
  },
  habitDesc: {
    fontSize: 12,
    marginTop: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 15,
  },
  emptySubText: {
    fontSize: 14,
    marginTop: 5,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 350,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  modalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  }
});
