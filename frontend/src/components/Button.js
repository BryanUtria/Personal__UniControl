import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export default function Button({
  title,
  onPress,
  variant = 'primary', // 'primary' | 'secondary' | 'danger' | 'outline'
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
  backgroundColor,
  hoverBackgroundColor,
  hoverBorderColor,
  children,
  onMouseEnter,
  onMouseLeave,
  ...props
}) {
  const { theme, isDarkMode } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  // Determinar estilos según variante
  let buttonStyle = {};
  let labelStyle = {};

  if (variant === 'primary') {
    buttonStyle = {
      backgroundColor: isHovered ? (hoverBackgroundColor || theme.accent + 'E0') : (backgroundColor || theme.accent),
      borderColor: isHovered ? (hoverBorderColor || theme.accent) : theme.accent,
    };
    labelStyle = {
      color: '#FFF',
    };
  } else if (variant === 'secondary') {
    buttonStyle = {
      backgroundColor: isHovered ? (hoverBackgroundColor || (isDarkMode ? '#333' : '#F3F4F6')) : (backgroundColor || theme.card),
      borderColor: isHovered ? (hoverBorderColor || theme.border || (theme.textSecondary + '30')) : (theme.border || (theme.textSecondary + '30')),
    };
    labelStyle = {
      color: theme.text,
    };
  } else if (variant === 'danger') {
    buttonStyle = {
      backgroundColor: isHovered ? (hoverBackgroundColor || theme.danger + '25') : (backgroundColor || theme.danger + '15'),
      borderColor: isHovered ? (hoverBorderColor || theme.danger) : theme.danger,
    };
    labelStyle = {
      color: theme.danger,
    };
  } else if (variant === 'outline') {
    buttonStyle = {
      backgroundColor: isHovered ? (hoverBackgroundColor || theme.accent + '15') : (backgroundColor || 'transparent'),
      borderColor: isHovered ? (hoverBorderColor || theme.accent) : theme.accent,
    };
    labelStyle = {
      color: theme.accent,
    };
  }

  const isBtnDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={isBtnDisabled}
      onMouseEnter={(e) => {
        if (!isBtnDisabled) setIsHovered(true);
        if (onMouseEnter) onMouseEnter(e);
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        if (onMouseLeave) onMouseLeave(e);
      }}
      style={[
        styles.btn,
        buttonStyle,
        isBtnDisabled && { opacity: 0.5 },
        style
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? '#FFF' : theme.accent} />
      ) : (
        <>
          {icon}
          {title ? (
            <Text style={[styles.btnText, labelStyle, textStyle]}>
              {title}
            </Text>
          ) : null}
          {children}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    ...Platform.select({
      web: { cursor: 'pointer' }
    })
  },
  btnText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  }
});
