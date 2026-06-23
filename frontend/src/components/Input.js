import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

/**
 * Input – Componente de input reutilizable para UniControl
 *
 * Props:
 *   label         {string}   – Etiqueta que aparece arriba del input
 *   icon          {string}   – Nombre del icono de Ionicons (izquierda)
 *   isPassword    {boolean}  – Muestra el botón de ojo para mostrar/ocultar contraseña
 *   error         {string}   – Mensaje de error debajo del input
 *   containerStyle           – Estilo extra para el wrapper externo (inputWrapper)
 *   inputStyle               – Estilo extra para el TextInput interno
 *   rightElement  {ReactNode}– Elemento adicional al lado derecho (ej. botón limpiar)
 *   ...rest                  – Todos los props de TextInput (placeholder, value, onChangeText, etc.)
 */
export default function Input({
  label,
  icon,
  isPassword = false,
  error,
  containerStyle,
  inputStyle,
  rightElement,
  multiline = false,
  numberOfLines,
  style, // alias legacy
  backgroundColor,
  textColor,
  placeholderColor,
  iconColor,
  ...rest
}) {
  const { theme, isDarkMode } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const isBgLight = !isDarkMode || backgroundColor === '#FFFFFF' || backgroundColor === '#FFF' || backgroundColor === 'white';
  const bgColor = backgroundColor || (isDarkMode ? '#1A1A1A' : '#FFFFFF');

  const borderColor = error
    ? theme.danger
    : isFocused
      ? theme.accent
      : (isBgLight || !isDarkMode)
        ? '#E5E7EB'
        : '#333';

  const resolvedTextColor = textColor || (isBgLight ? '#1A1A24' : theme.text);
  const resolvedPlaceholderColor = placeholderColor || (isBgLight ? '#6B7280' : theme.textSecondary);
  const resolvedIconColor = iconColor || (isFocused ? theme.accent : (isBgLight ? '#6B7280' : theme.textSecondary));

  const inputHeight = multiline
    ? (numberOfLines ? numberOfLines * 24 + 16 : 88)
    : 48;

  return (
    <View style={[styles.wrapper, containerStyle, style]}>
      {label ? (
        <Text style={[styles.label, { color: isFocused ? theme.accent : theme.textSecondary }]}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.row,
          {
            backgroundColor: bgColor,
            borderColor,
            height: multiline ? undefined : inputHeight,
            minHeight: inputHeight,
            alignItems: multiline ? 'flex-start' : 'center',
          },
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={isFocused ? theme.accent : theme.textSecondary}
            style={[styles.icon, multiline && { marginTop: 14 }]}
          />
        ) : null}

        <TextInput
          style={[
            styles.input,
            { color: theme.text },
            multiline && { textAlignVertical: 'top', paddingTop: 12, paddingBottom: 12 },
            inputStyle,
          ]}
          placeholderTextColor={theme.textSecondary}
          secureTextEntry={isPassword && !showPassword}
          multiline={multiline}
          numberOfLines={numberOfLines}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...rest}
        />

        {isPassword && (
          <TouchableOpacity
            onPress={() => setShowPassword(v => !v)}
            style={styles.eyeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
        )}

        {rightElement && !isPassword ? (
          <View style={styles.rightElement}>{rightElement}</View>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={13} color={theme.danger} />
          <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingRight: 4,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  icon: {
    marginRight: 8,
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    fontSize: 14,
    padding: 0,
    minWidth: 60,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  eyeBtn: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  rightElement: {
    alignSelf: 'center',
    paddingRight: 4,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  errorText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
