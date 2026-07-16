import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

export default function HabitsCalendar({ habits, selectedDate, onDateSelect, getHabitsForDate }) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year, month) => {
    let day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Ajustar para que Lunes sea 0 (0-indexed array for dayNames)
  };

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    grid.push(currentWeek);
  }

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDayPress = (day) => {
    if (!day) return;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (onDateSelect) onDateSelect(dateStr);
  };

  const renderDots = (day) => {
    if (!day || !getHabitsForDate) return null;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const scheduledHabits = getHabitsForDate(dateStr);
    if (scheduledHabits.length === 0) return null;

    const completedCount = scheduledHabits.filter(h => h.logs && h.logs[dateStr] === true).length;
    const totalCount = scheduledHabits.length;
    const isAllDone = completedCount === totalCount && totalCount > 0;

    return (
      <View style={{ width: '80%', alignItems: 'center', marginTop: 2 }}>
        <View style={{ width: '100%', height: 3, backgroundColor: theme.border, borderRadius: 2 }}>
          <View style={{
            width: `${(completedCount / totalCount) * 100}%`,
            height: '100%',
            backgroundColor: isAllDone ? '#4caf50' : theme.accent,
            borderRadius: 2
          }} />
        </View>
        <Text style={{ fontSize: 9, color: isAllDone ? '#4caf50' : theme.textSecondary, marginTop: 2, fontWeight: isAllDone ? 'bold' : 'normal' }}>
          {completedCount}/{totalCount}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={prevMonth} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.monthText, { color: theme.text }]}>
          {monthNames[month]} {year}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

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
                  style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: theme.accent + '20', borderColor: theme.accent, borderWidth: 1 }
                  ]}
                  onPress={() => handleDayPress(day)}
                  disabled={!day}
                >
                  {day ? (
                    <>
                      <Text style={[
                        styles.dayText,
                        { color: isSelected || isToday ? theme.accent : theme.text },
                        isToday && { fontWeight: 'bold' }
                      ]}>
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
    fontSize: 18,
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
    aspectRatio: 1, // Square
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    padding: 2,
  },
  dayText: {
    fontSize: 16,
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  }
});
