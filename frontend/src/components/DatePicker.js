import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

let DateTimePicker = null;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

export default function DatePicker({ label, value, onChange, mode = 'date' }) {
  const { theme } = useTheme();
  const [show, setShow] = useState(false);

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS !== 'ios') {
      setShow(false);
    }
    if (selectedDate) {
      if (mode === 'time') {
        // "HH:MM" in local time
        const hours = String(selectedDate.getHours()).padStart(2, '0');
        const minutes = String(selectedDate.getMinutes()).padStart(2, '0');
        onChange(`${hours}:${minutes}`);
      } else {
        // "YYYY-MM-DD" using local date
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        onChange(`${year}-${month}-${day}`);
      }
    }
  };

  const getParsedValue = () => {
    if (!value) return new Date();
    if (mode === 'time') {
      const [hours, minutes] = value.split(':');
      const d = new Date();
      d.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
      return d;
    } else {
      const [year, month, day] = value.split('-');
      return new Date(year, month - 1, day);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={{ marginBottom: 10 }}>
        {label && <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 5 }}>{label}</Text>}
        <input
          type={mode === 'time' ? 'time' : 'date'}
          style={{ 
            backgroundColor: theme.background, 
            color: theme.text, 
            borderColor: theme.border, 
            borderWidth: '1px', 
            borderStyle: 'solid', 
            borderRadius: 10, 
            padding: 12, 
            fontSize: 14, 
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box'
          }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 10 }}>
      {label && <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 5 }}>{label}</Text>}
      <TouchableOpacity 
        style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 12 }} 
        onPress={() => setShow(true)}
      >
        <Text style={{ color: value ? theme.text : theme.textSecondary, fontSize: 14 }}>
          {value || (mode === 'time' ? '--:--' : 'AAAA-MM-DD')}
        </Text>
      </TouchableOpacity>

      {show && DateTimePicker && (
        <DateTimePicker
          value={getParsedValue()}
          mode={mode}
          display="default"
          onChange={handleDateChange}
        />
      )}
    </View>
  );
}
