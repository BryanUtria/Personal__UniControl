import React, { createContext, useContext, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const { theme, isDarkMode } = useTheme();
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-50)).current;
  const timeoutRef = useRef(null);

  const showToast = (message, type = 'info', duration = 3000) => {
    // Si ya hay un timeout activo, limpiarlo
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setToast({ visible: true, message, type });

    // Iniciar Animación
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Ocultar después de la duración
    timeoutRef.current = setTimeout(() => {
      hideToast();
    }, duration);
  };

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -30,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToast({ visible: false, message: '', type: 'info' });
    });
  };

  // Obtener estilos del toast según el tipo
  const getToastStyles = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: isDarkMode ? '#1E3A24' : '#E8F5E9',
          border: isDarkMode ? '#2E7D32' : '#C8E6C9',
          icon: isDarkMode ? '#81C784' : '#2E7D32',
          iconName: 'checkmark-circle'
        };
      case 'danger':
      case 'error':
        return {
          bg: isDarkMode ? '#3A1E1E' : '#FFEBEE',
          border: isDarkMode ? '#C62828' : '#FFCDD2',
          icon: isDarkMode ? '#E57373' : '#C62828',
          iconName: 'close-circle'
        };
      case 'warning':
        return {
          bg: isDarkMode ? '#3E2723' : '#FFF8E1',
          border: isDarkMode ? '#EF6C00' : '#FFE082',
          icon: isDarkMode ? '#FFB74D' : '#EF6C00',
          iconName: 'warning'
        };
      case 'info':
      default:
        return {
          bg: isDarkMode ? '#1A237E' : '#E8EAF6',
          border: isDarkMode ? '#1565C0' : '#C5CAE9',
          icon: isDarkMode ? '#64B5F6' : '#1565C0',
          iconName: 'information-circle'
        };
    }
  };

  const stylesConfig = getToastStyles();

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast.visible && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
              backgroundColor: stylesConfig.bg,
              borderColor: stylesConfig.border,
              shadowColor: isDarkMode ? '#000' : '#9E9E9E',
            }
          ]}
        >
          <Ionicons name={stylesConfig.iconName} size={22} color={stylesConfig.icon} style={styles.icon} />
          <Text style={[styles.toastText, { color: theme.text }]} numberOfLines={3}>
            {toast.message}
          </Text>
          <TouchableOpacity onPress={hideToast} style={styles.closeBtn}>
            <Ionicons name="close" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 99999,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  icon: {
    marginRight: 12,
  },
  toastText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 10,
  }
});
