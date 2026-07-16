import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Input from '../../components/Input';
import Button from '../../components/Button';
import DatePicker from '../../components/DatePicker';
import { useTheme } from '../../theme/ThemeContext';
import { useToast } from '../../context/ToastContext';

const COLORS = [
  '#4caf50', '#2196f3', '#9c27b0', '#f44336', '#ff9800',
  '#00bcd4', '#607d8b', '#e91e63', '#8bc34a', '#3f51b5'
];

const FREQUENCIES = [
  { value: 'daily', label: 'Todos los días' },
  { value: 'specific_days', label: 'Días específicos' },
  { value: 'monthly', label: 'Una vez al mes' },
  { value: 'once', label: 'Una sola vez' }
];

const DAYS = [
  { value: '1', label: 'L' },
  { value: '2', label: 'M' },
  { value: '3', label: 'X' },
  { value: '4', label: 'J' },
  { value: '5', label: 'V' },
  { value: '6', label: 'S' },
  { value: '0', label: 'D' }
];

export default function HabitFormModal({ visible, onClose, onSave, editingHabit }) {
  const { theme, isDarkMode } = useTheme();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('habit'); // 'habit' or 'task'
  const [color, setColor] = useState(COLORS[0]);
  const [frequency, setFrequency] = useState('daily');
  const [selectedDays, setSelectedDays] = useState([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reminderTime, setReminderTime] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (visible && editingHabit) {
      setName(editingHabit.name || '');
      setDescription(editingHabit.description || '');
      setType(editingHabit.type || 'habit');
      setColor(editingHabit.color || COLORS[0]);
      setFrequency(editingHabit.frequency || 'daily');
      setStartDate(editingHabit.start_date ? String(editingHabit.start_date).substring(0, 10) : new Date().toISOString().split('T')[0]);
      setStartTime(editingHabit.start_time ? String(editingHabit.start_time).substring(0, 5) : '');
      setEndTime(editingHabit.end_time ? String(editingHabit.end_time).substring(0, 5) : '');
      setReminderTime(editingHabit.reminder_time !== undefined ? editingHabit.reminder_time : null);

      if (editingHabit.frequency === 'specific_days' && editingHabit.repeat_details) {
        setSelectedDays(editingHabit.repeat_details.days || []);
      } else {
        setSelectedDays([]);
      }
    } else if (visible && !editingHabit) {
      setName('');
      setDescription('');
      setType('habit');
      setColor(COLORS[0]);
      setFrequency('daily');
      setSelectedDays([]);
      setStartDate(new Date().toISOString().split('T')[0]);
      setStartTime('');
      setEndTime('');
      setReminderTime(null);
      setErrors({});
    }
  }, [visible, editingHabit]);

  const toggleDay = (dayValue) => {
    setSelectedDays(prev =>
      prev.includes(dayValue)
        ? prev.filter(d => d !== dayValue)
        : [...prev, dayValue]
    );
  };

  const handleSave = async () => {
    const newErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Este campo es obligatorio';
    }

    if (frequency === 'specific_days' && selectedDays.length === 0) {
      newErrors.days = 'Selecciona al menos un día';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast('Por favor completa los campos obligatorios', 'warning');
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      const repeat_details = frequency === 'specific_days' ? { days: selectedDays } : null;

      const habitData = {
        name: name.trim(),
        description: description.trim(),
        type,
        color,
        frequency,
        repeat_details,
        start_date: startDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
        reminder_time: reminderTime
      };

      await onSave(habitData);
      onClose();
    } catch (e) {
      console.error(e);
      showToast('Error al guardar el hábito', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>
              {editingHabit ? 'Editar Hábito' : 'Nuevo Hábito'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.textLight} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.typeContainer}>
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  { borderColor: theme.border },
                  type === 'habit' && { backgroundColor: theme.accent, borderColor: theme.accent }
                ]}
                onPress={() => setType('habit')}
              >
                <Ionicons name="infinite" size={16} color={type === 'habit' ? '#fff' : theme.text} />
                <Text style={[styles.typeText, { color: type === 'habit' ? '#fff' : theme.text }]}>
                  Hábito
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  { borderColor: theme.border },
                  type === 'task' && { backgroundColor: theme.accent, borderColor: theme.accent }
                ]}
                onPress={() => setType('task')}
              >
                <Ionicons name="checkbox-outline" size={16} color={type === 'task' ? '#fff' : theme.text} />
                <Text style={[styles.typeText, { color: type === 'task' ? '#fff' : theme.text }]}>
                  Tarea
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: theme.text, marginTop: 5 }]}>
              {type === 'habit' ? 'Nombre del hábito' : 'Nombre de la tarea'}
            </Text>
            <Input
              placeholder={type === 'habit' ? "Ej: Leer 10 páginas..." : "Ej: Comprar el mercado..."}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (errors.name) setErrors(prev => ({ ...prev, name: null }));
              }}
              style={errors.name ? { borderColor: '#f44336', borderWidth: 1 } : {}}
            />
            {errors.name && <Text style={{ color: '#f44336', fontSize: 12, marginTop: -5, marginBottom: 5, marginLeft: 5 }}>{errors.name}</Text>}

            <Text style={[styles.label, { color: theme.text, marginTop: 5 }]}>Descripción (Opcional)</Text>
            <Input
              placeholder="Detalles adicionales..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />

            <View style={{ flexDirection: 'row', gap: 15, marginTop: 5 }}>
              <View style={{ flex: 1 }}>
                <DatePicker
                  label="Hora Inicio (Opcional)"
                  mode="time"
                  value={startTime}
                  onChange={setStartTime}
                />
              </View>
              <View style={{ flex: 1 }}>
                <DatePicker
                  label="Hora Fin (Opcional)"
                  mode="time"
                  value={endTime}
                  onChange={setEndTime}
                />
              </View>
            </View>

            <Text style={[styles.label, { color: theme.text, marginTop: 10 }]}>Recordatorio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {[
                { label: 'Sin aviso', value: null },
                { label: '10 min', value: 10 },
                { label: '30 min', value: 30 },
                { label: '1 h', value: 60 },
                { label: '5 h', value: 300 },
                { label: '1 d', value: 1440 },
                { label: '2 d', value: 2880 },
              ].map(rem => (
                <TouchableOpacity
                  key={String(rem.value)}
                  style={[
                    styles.freqBtn,
                    { borderColor: theme.border, marginRight: 10, paddingVertical: 6, paddingHorizontal: 12 },
                    reminderTime === rem.value && { backgroundColor: theme.accent, borderColor: theme.accent }
                  ]}
                  onPress={() => setReminderTime(rem.value)}
                >
                  <Text style={[
                    styles.freqText,
                    { color: reminderTime === rem.value ? '#fff' : theme.text, fontSize: 13 }
                  ]}>
                    {rem.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Input
              placeholder="Minutos personalizados (Ej: 15)"
              value={reminderTime ? String(reminderTime) : ''}
              onChangeText={(text) => setReminderTime(text ? parseInt(text) : null)}
              keyboardType="numeric"
            />

            <Text style={[styles.label, { color: theme.text, marginTop: 5 }]}>Frecuencia</Text>
            <View style={styles.frequencyContainer}>
              {FREQUENCIES.map(freq => (
                <TouchableOpacity
                  key={freq.value}
                  style={[
                    styles.freqBtn,
                    { borderColor: theme.border },
                    frequency === freq.value && { backgroundColor: theme.accent, borderColor: theme.accent }
                  ]}
                  onPress={() => setFrequency(freq.value)}
                >
                  <Text style={[
                    styles.freqText,
                    { color: frequency === freq.value ? '#fff' : theme.text }
                  ]}>
                    {freq.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ marginTop: 5 }}>
              <DatePicker
                label={frequency === 'once' || frequency === 'monthly' ? "Fecha" : "Fecha de inicio"}
                mode="date"
                value={startDate}
                onChange={setStartDate}
              />
            </View>

            {frequency === 'specific_days' && (
              <View style={styles.daysContainer}>
                {DAYS.map(day => {
                  const isSelected = selectedDays.includes(day.value);
                  return (
                    <TouchableOpacity
                      key={day.value}
                      style={[
                        styles.dayBtn,
                        { borderColor: theme.border },
                        isSelected && { backgroundColor: theme.accent, borderColor: theme.accent }
                      ]}
                      onPress={() => toggleDay(day.value)}
                    >
                      <Text style={[
                        styles.dayText,
                        { color: isSelected ? '#fff' : theme.text }
                      ]}>
                        {day.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {frequency === 'specific_days' && errors.days && (
              <Text style={{ color: '#f44336', fontSize: 12, marginTop: 5, marginLeft: 5, textAlign: 'center' }}>
                {errors.days}
              </Text>
            )}

            <Text style={[styles.label, { color: theme.text, marginTop: 5 }]}>Color</Text>
            <View style={styles.colorsContainer}>
              {COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorCircle, { backgroundColor: c }]}
                  onPress={() => setColor(c)}
                >
                  {color === c && (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Button
              title="Cancelar"
              variant="outline"
              onPress={onClose}
              style={{ flex: 1, marginRight: 10 }}
            />
            <Button
              title="Guardar"
              onPress={handleSave}
              loading={isSubmitting}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  scroll: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 5,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  typeText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  frequencyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  freqBtn: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 5,
  },
  freqText: {
    fontSize: 14,
  },
  daysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
    maxWidth: 400,
  },
  dayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontWeight: 'bold',
  },
  colorsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
    marginTop: 5,
  },
  colorCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  }
});
