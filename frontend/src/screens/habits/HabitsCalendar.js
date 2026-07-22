import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

export default function HabitsCalendar({ habits, selectedDate, onDateSelect, getHabitsForDate }) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState('day'); // 'day', 'week', 'month', 'year'

  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year, month) => {
    let day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Lunes = 0
  };

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Selected Date Object
  const selDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : today;

  // -- Generar Cuadrícula Mensual --
  const grid = [];
  let currentWeek = [];
  for (let i = 0; i < startDay; i++) {
    currentWeek.push(null);
  }
  for (let day = 1; day <= totalDays; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      grid.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    grid.push(currentWeek);
  }

  // Navegación
  const prevDate = () => {
    if (viewMode === 'month' || viewMode === 'year') {
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    } else if (viewMode === 'day') {
      const d = new Date(selDateObj);
      d.setDate(d.getDate() - 1);
      const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (onDateSelect) onDateSelect(str);
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    } else if (viewMode === 'week') {
      const d = new Date(selDateObj);
      d.setDate(d.getDate() - 7);
      const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (onDateSelect) onDateSelect(str);
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  };

  const nextDate = () => {
    if (viewMode === 'month' || viewMode === 'year') {
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    } else if (viewMode === 'day') {
      const d = new Date(selDateObj);
      d.setDate(d.getDate() + 1);
      const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (onDateSelect) onDateSelect(str);
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    } else if (viewMode === 'week') {
      const d = new Date(selDateObj);
      d.setDate(d.getDate() + 7);
      const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (onDateSelect) onDateSelect(str);
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  };

  const handleDayPress = (day, passedMonth = month, passedYear = year) => {
    if (!day) return;
    const dateStr = `${passedYear}-${String(passedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (onDateSelect) onDateSelect(dateStr);
  };

  // -- Renderizadores de Eventos --
  const renderDots = (day, passedMonth = month, passedYear = year) => {
    if (!day || !getHabitsForDate) return null;
    const dateStr = `${passedYear}-${String(passedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const scheduledHabits = getHabitsForDate(dateStr);
    const totalCount = scheduledHabits.length;

    let dotColor = 'transparent';
    if (totalCount === 0) {
      dotColor = '#9e9e9e'; // Gris oscuro para días sin hábitos
    } else {
      const completedCount = scheduledHabits.filter(h => h.logs && h.logs[dateStr] === true).length;
      if (completedCount === totalCount) {
        dotColor = '#4caf50'; // Verde
      } else if (completedCount > 0) {
        dotColor = '#ff9800'; // Naranja
      } else {
        dotColor = '#2196f3'; // Azul
      }
    }

    return (
      <View style={{ width: '100%', alignItems: 'center', marginTop: 4 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }} />
      </View>
    );
  };

  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m; // minutos desde medianoche
  };

  const HOUR_HEIGHT = 40; // pixeles por hora

  const renderTimelineEvents = (dateStr) => {
    if (!getHabitsForDate) return null;
    const scheduledHabits = getHabitsForDate(dateStr);
    return scheduledHabits.map((habit, idx) => {
      const startMins = parseTime(habit.start_time);
      if (startMins === null) return null; // Solo eventos con hora
      let endMins = parseTime(habit.end_time);
      if (endMins === null || endMins <= startMins) endMins = startMins + 60; // 1 hora por defecto

      const top = (startMins / 60) * HOUR_HEIGHT;
      const height = ((endMins - startMins) / 60) * HOUR_HEIGHT;
      const isCompleted = habit.logs && habit.logs[dateStr] === true;

      return (
        <View key={`${habit.id}-${idx}`} style={[
          styles.timelineEvent,
          {
            top,
            height,
            backgroundColor: isCompleted ? '#4caf5020' : (habit.color + '20'),
            borderColor: isCompleted ? '#4caf50' : habit.color
          }
        ]}>
          <Text style={{ fontSize: 10, color: isCompleted ? '#4caf50' : habit.color, fontWeight: 'bold' }} numberOfLines={1}>
            {habit.name}
          </Text>
        </View>
      );
    });
  };

  // -- Vistas --
  const renderMonthView = () => (
    <>
      <View style={styles.daysRow}>
        {dayNames.map((day, i) => (
          <View key={i} style={styles.dayLabelCell}>
            <Text style={[styles.dayLabelText, { color: theme.textLight }]}>{day}</Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {grid.map((week, wIndex) => (
          <View key={wIndex} style={styles.weekRow}>
            {week.map((day, dIndex) => {
              const dateStr = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
              const isSelected = dateStr === selectedDate;
              const isToday = day && todayStr === dateStr;

              return (
                <TouchableOpacity
                  key={dIndex}
                  style={[styles.dayCell, isSelected && { backgroundColor: theme.accent + '20', borderColor: theme.accent, borderWidth: 1 }]}
                  onPress={() => handleDayPress(day)}
                  disabled={!day}
                >
                  {day ? (
                    <>
                      <Text style={[styles.dayText, { color: isSelected || isToday ? theme.accent : theme.text }, isToday && { fontWeight: 'bold' }]}>
                        {day}
                      </Text>
                      {renderDots(day)}
                    </>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </>
  );

  const renderDayView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    // All day habits
    const allDayHabits = (getHabitsForDate(selectedDate) || []).filter(h => !h.start_time);

    return (
      <View style={{ flex: 1 }}>
        {allDayHabits.length > 0 && (
          <View style={[styles.allDayContainer, { borderColor: theme.border }]}>
            <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>Todo el día</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {allDayHabits.map((h, i) => {
                const done = h.logs && h.logs[selectedDate] === true;
                return (
                  <View key={i} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: done ? '#4caf5020' : h.color + '20' }}>
                    <Text style={{ fontSize: 10, color: done ? '#4caf50' : h.color }}>{h.name}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
        <ScrollView style={{ height: 450 }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
          <View style={styles.timelineContainer}>
            {/* Columna de Horas */}
            <View style={styles.timeColumn}>
              {hours.map(h => (
                <View key={h} style={[styles.timeLabel, { height: HOUR_HEIGHT }]}>
                  <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{String(h).padStart(2, '0')}:00</Text>
                </View>
              ))}
            </View>
            {/* Grilla de Eventos */}
            <View style={styles.eventsColumn}>
              {hours.map(h => (
                <View key={h} style={[styles.hourLine, { height: HOUR_HEIGHT, borderColor: theme.border }]} />
              ))}
              {renderTimelineEvents(selectedDate)}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderWeekView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    // Obtener los 7 días de la semana de selDateObj
    const currentDayOfWeek = selDateObj.getDay() === 0 ? 6 : selDateObj.getDay() - 1; // 0 (Lun) a 6 (Dom)
    const weekStart = new Date(selDateObj);
    weekStart.setDate(weekStart.getDate() - currentDayOfWeek);

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    return (
      <View style={{ flex: 1 }}>
        {/* Cabecera de días */}
        <View style={{ flexDirection: 'row', paddingLeft: 40, borderBottomWidth: 1, borderColor: theme.border, paddingBottom: 5 }}>
          {weekDays.map((d, i) => {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            return (
              <TouchableOpacity key={i} style={{ flex: 1, alignItems: 'center' }} onPress={() => { onDateSelect(dateStr); setCurrentMonth(d); }}>
                <Text style={{ fontSize: 10, color: theme.textLight }}>{dayNames[i]}</Text>
                <View style={[
                  { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
                  isSelected && { backgroundColor: theme.accent + '30' }
                ]}>
                  <Text style={{ fontSize: 14, color: isToday || isSelected ? theme.accent : theme.text, fontWeight: isToday || isSelected ? 'bold' : 'normal' }}>
                    {d.getDate()}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView style={{ height: 400 }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
          <View style={styles.timelineContainer}>
            <View style={styles.timeColumn}>
              {hours.map(h => (
                <View key={h} style={[styles.timeLabel, { height: HOUR_HEIGHT }]}>
                  <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{String(h).padStart(2, '0')}:00</Text>
                </View>
              ))}
            </View>
            <View style={[styles.eventsColumn, { flexDirection: 'row' }]}>
              {/* Lineas horizontales de fondo */}
              <View style={StyleSheet.absoluteFill}>
                {hours.map(h => (
                  <View key={h} style={[styles.hourLine, { height: HOUR_HEIGHT, borderColor: theme.border }]} />
                ))}
              </View>

              {/* 7 Columnas de días */}
              {weekDays.map((d, i) => {
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return (
                  <View key={i} style={{ flex: 1, borderRightWidth: 1, borderColor: theme.border + '50' }}>
                    {renderTimelineEvents(dateStr)}
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderYearView = () => {
    const monthsArr = Array.from({ length: 12 }, (_, i) => i);
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {monthsArr.map(m => {
          // Mini calendario de 1 mes
          const mDays = daysInMonth(year, m);
          const mStart = firstDayOfMonth(year, m);
          let mGrid = [];
          let mWeek = [];
          for (let i = 0; i < mStart; i++) mWeek.push(null);
          for (let day = 1; day <= mDays; day++) {
            mWeek.push(day);
            if (mWeek.length === 7) { mGrid.push(mWeek); mWeek = []; }
          }
          if (mWeek.length > 0) {
            while (mWeek.length < 7) mWeek.push(null);
            mGrid.push(mWeek);
          }

          return (
            <TouchableOpacity
              key={m}
              style={[styles.miniMonth, { borderColor: theme.border }]}
              onPress={() => { setCurrentMonth(new Date(year, m, 1)); setViewMode('month'); }}
            >
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: theme.text, marginBottom: 5, textAlign: 'center' }}>
                {monthNames[m]}
              </Text>
              <View style={{ flexDirection: 'row' }}>
                {dayNames.map(d => <Text key={d} style={{ flex: 1, fontSize: 8, color: theme.textLight, textAlign: 'center' }}>{d[0]}</Text>)}
              </View>
              {mGrid.map((w, wi) => (
                <View key={wi} style={{ flexDirection: 'row', marginVertical: 1 }}>
                  {w.map((d, di) => {
                    const dateStr = d ? `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
                    const scheduledHabits = dateStr ? getHabitsForDate(dateStr) : [];
                    const totalCount = scheduledHabits.length;
                    let dotColor = 'transparent';

                    if (d) {
                      if (totalCount === 0) {
                        dotColor = '#9e9e9e';
                      } else {
                        const completedCount = scheduledHabits.filter(h => h.logs && h.logs[dateStr] === true).length;
                        if (completedCount === totalCount) {
                          dotColor = '#4caf50'; // Todo cumplido (Verde)
                        } else if (completedCount > 0) {
                          dotColor = '#ff9800'; // Incompleto (Naranja)
                        } else {
                          dotColor = '#2196f3'; // Nada hecho (Azul)
                        }
                      }
                    }

                    return (
                      <View key={di} style={{ flex: 1, aspectRatio: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dotColor }} />
                      </View>
                    );
                  })}
                </View>
              ))}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // -- Textos Dinámicos de Cabecera --
  let headerTitle = `${monthNames[month]} ${year}`;
  if (viewMode === 'year') {
    headerTitle = `${year}`;
  } else if (viewMode === 'day') {
    headerTitle = `${selDateObj.getDate()} de ${monthNames[selDateObj.getMonth()]} ${selDateObj.getFullYear()}`;
  } else if (viewMode === 'week') {
    const currentDayOfWeek = selDateObj.getDay() === 0 ? 6 : selDateObj.getDay() - 1;
    const weekStart = new Date(selDateObj);
    weekStart.setDate(weekStart.getDate() - currentDayOfWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    headerTitle = `${weekStart.getDate()} ${monthNames[weekStart.getMonth()].substring(0, 3)} - ${weekEnd.getDate()} ${monthNames[weekEnd.getMonth()].substring(0, 3)} ${year}`;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={prevDate} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.monthText, { color: theme.text }]}>
          {headerTitle}
        </Text>
        <TouchableOpacity onPress={nextDate} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.viewSwitcher, { backgroundColor: theme.border }]}>
        {['day', 'week', 'month', 'year'].map(mode => (
          <TouchableOpacity
            key={mode}
            style={[styles.viewTab, viewMode === mode && { backgroundColor: theme.accent }]}
            onPress={() => setViewMode(mode)}
          >
            <Text style={[styles.viewTabText, { color: viewMode === mode ? '#fff' : theme.textSecondary }]}>
              {mode === 'day' ? 'Día' : mode === 'week' ? 'Semana' : mode === 'month' ? 'Mes' : 'Año'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'day' && renderDayView()}
      {viewMode === 'week' && renderWeekView()}
      {viewMode === 'year' && renderYearView()}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 15,
    borderWidth: 1,
    padding: 10,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  navButton: {
    padding: 5,
  },
  monthText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  viewSwitcher: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    marginBottom: 15,
  },
  viewTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  viewTabText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  daysRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  dayLabelCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayLabelText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  grid: {
    flexDirection: 'column',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    padding: 2,
  },
  dayText: {
    fontSize: 16,
  },
  // Timeline Styles
  allDayContainer: {
    borderBottomWidth: 1,
    paddingBottom: 10,
    marginBottom: 10,
  },
  timelineContainer: {
    flexDirection: 'row',
    position: 'relative',
  },
  timeColumn: {
    width: 40,
    borderRightWidth: 1,
    borderColor: 'transparent',
  },
  timeLabel: {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingRight: 5,
  },
  eventsColumn: {
    flex: 1,
    position: 'relative',
  },
  hourLine: {
    borderTopWidth: 1,
    width: '100%',
  },
  timelineEvent: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 4,
    overflow: 'hidden',
  },
  // Year view
  miniMonth: {
    width: '31%',
    borderWidth: 1,
    borderRadius: 8,
    padding: 5,
    marginBottom: 10,
  }
});
