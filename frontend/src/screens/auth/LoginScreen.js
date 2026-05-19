import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions, Image } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

import LogoImage from '../../../assets/Navegador.png';

export default function LoginScreen() {
  const { login, sendVerificationCode, register } = useAuth();
  const { theme, isDarkMode } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  // Estados del flujo de verificación
  const [isVerifying, setIsVerifying] = useState(false);
  const [sandboxCode, setSandboxCode] = useState(null);
  const [sandboxMode, setSandboxMode] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleCancelVerification = () => {
    setIsVerifying(false);
    setVerificationCode('');
    setSandboxCode(null);
    setSandboxMode(false);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSubmit = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!isRegisterMode) {
      // Flujo de Login
      if (!username.trim() || !password.trim()) {
        setErrorMsg('Usuario y contraseña son obligatorios.');
        return;
      }

      setLoading(true);
      const res = await login(username.trim(), password.trim());
      setLoading(false);

      if (!res.success) {
        setErrorMsg(res.error || 'Algo salió mal.');
      }
    } else {
      // Flujo de Registro
      if (!isVerifying) {
        // Paso 1: Validar campos y solicitar código
        if (!name.trim()) {
          setErrorMsg('El nombre completo es obligatorio.');
          return;
        }
        if (!username.trim()) {
          setErrorMsg('El nombre de usuario es obligatorio.');
          return;
        }
        if (!email.trim()) {
          setErrorMsg('El correo electrónico es obligatorio para verificar tu cuenta.');
          return;
        }
        if (!email.includes('@')) {
          setErrorMsg('Por favor ingresa un correo electrónico válido.');
          return;
        }
        if (!password.trim() || password.length < 6) {
          setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
          return;
        }

        setLoading(true);
        const res = await sendVerificationCode(email.trim(), username.trim());
        setLoading(false);

        if (res.success) {
          setIsVerifying(true);
          setSandboxMode(res.sandboxMode);
          if (res.sandboxMode) {
            setSandboxCode(res.sandboxCode);
            setSuccessMsg('¡Modo Sandbox Activo! Código de prueba generado con éxito.');
          } else {
            setSuccessMsg('Se ha enviado un código de verificación de 6 dígitos a tu correo electrónico.');
          }
        } else {
          setErrorMsg(res.error || 'No se pudo enviar el código de verificación.');
        }
      } else {
        // Paso 2: Validar el código de verificación e intentar registrarse
        if (!verificationCode.trim()) {
          setErrorMsg('Por favor ingresa el código de verificación de 6 dígitos.');
          return;
        }
        if (verificationCode.trim().length !== 6) {
          setErrorMsg('El código de verificación debe tener exactamente 6 dígitos.');
          return;
        }

        setLoading(true);
        const res = await register(
          name.trim(),
          username.trim(),
          password.trim(),
          email.trim(),
          verificationCode.trim()
        );
        setLoading(false);

        if (!res.success) {
          setErrorMsg(res.error || 'Error al completar el registro.');
        }
      }
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              padding: isMobile ? 10 : 20,
            }
          ]}
          showsVerticalScrollIndicator={false}
        >

          {/* Logo & Header */}
          <View style={styles.headerContainer}>
            <View style={[styles.logoCircle, { backgroundColor: theme.card, shadowColor: theme.shadow, overflow: 'hidden' }]}>
              <Image source={LogoImage} style={styles.logoImage} resizeMode="contain" />
            </View>
            <Text style={[styles.brandName, { color: theme.text }]}>UniControl</Text>
            <Text style={[styles.brandTagline, { color: theme.textSecondary }]}>
              {isRegisterMode
                ? (isVerifying ? 'Verificación de Seguridad Obligatoria' : 'Crea una cuenta segura para empezar')
                : 'Gestiona tus cuentas con control total'}
            </Text>
          </View>

          {/* Form Card */}
          <View style={[styles.formCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
            <Text style={[styles.formTitle, { color: theme.text }]}>
              {isRegisterMode
                ? (isVerifying ? 'Verificar Correo' : 'Crear Cuenta')
                : 'Iniciar Sesión'}
            </Text>

            {errorMsg ? (
              <View style={[styles.errorContainer, { backgroundColor: theme.danger + '15', borderColor: theme.danger }]}>
                <Ionicons name="alert-circle-outline" size={18} color={theme.danger} style={{ marginRight: 8 }} />
                <Text style={[styles.errorText, { color: theme.danger }]}>{errorMsg}</Text>
              </View>
            ) : null}

            {successMsg ? (
              <View style={[styles.successContainer, { backgroundColor: theme.accent + '15', borderColor: theme.accent }]}>
                <Ionicons name="checkmark-circle-outline" size={18} color={theme.accent} style={{ marginRight: 8 }} />
                <Text style={[styles.successText, { color: theme.accent }]}>{successMsg}</Text>
              </View>
            ) : null}

            {/* Sandbox code notification */}
            {isVerifying && sandboxMode && sandboxCode ? (
              <View style={[styles.sandboxContainer, { backgroundColor: '#FBBF2415', borderColor: '#FBBF24' }]}>
                <Ionicons name="construct-outline" size={20} color="#FBBF24" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FBBF24', fontSize: 13, fontWeight: '700' }}>[CÓDIGO DE PRUEBAS - CONSOLA]</Text>
                  <Text style={{ color: theme.text, fontSize: 12, marginTop: 2 }}>
                    Como no hay SMTP configurado, usa este código temporal:
                    <Text style={{ fontWeight: '800', fontSize: 14, color: theme.accent }}> {sandboxCode}</Text>
                  </Text>
                </View>
              </View>
            ) : null}

            {!isVerifying ? (
              <>
                {/* Full Name Input (Register Only) */}
                {isRegisterMode && (
                  <View style={styles.inputWrapper}>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Nombre Completo</Text>
                    <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#1A1A1A' : '#F3F4F6', borderColor: isDarkMode ? '#333' : '#E5E7EB' }]}>
                      <Ionicons name="card-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.textInput, { color: theme.text }]}
                        placeholder="Ej. Juan Pérez"
                        placeholderTextColor={theme.textSecondary}
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>
                )}

                {/* Username Input */}
                <View style={styles.inputWrapper}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Usuario</Text>
                  <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#1A1A1A' : '#F3F4F6', borderColor: isDarkMode ? '#333' : '#E5E7EB' }]}>
                    <Ionicons name="person-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.textInput, { color: theme.text }]}
                      placeholder="Nombre de usuario"
                      placeholderTextColor={theme.textSecondary}
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                {/* Email Input (Register Only) */}
                {isRegisterMode && (
                  <View style={styles.inputWrapper}>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Correo Electrónico (Obligatorio)</Text>
                    <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#1A1A1A' : '#F3F4F6', borderColor: isDarkMode ? '#333' : '#E5E7EB' }]}>
                      <Ionicons name="mail-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.textInput, { color: theme.text }]}
                        placeholder="ejemplo@correo.com"
                        placeholderTextColor={theme.textSecondary}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>
                  </View>
                )}

                {/* Password Input */}
                <View style={styles.inputWrapper}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Contraseña</Text>
                  <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#1A1A1A' : '#F3F4F6', borderColor: isDarkMode ? '#333' : '#E5E7EB' }]}>
                    <Ionicons name="lock-closed-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.textInput, { color: theme.text }]}
                      placeholder="Tu contraseña secreta"
                      placeholderTextColor={theme.textSecondary}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                      <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <>
                {/* Information Header */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                    Hemos enviado un código secreto de 6 dígitos a <Text style={{ fontWeight: '700', color: theme.text }}>{email}</Text>. Por favor ingresa el código a continuación para verificar tu identidad.
                  </Text>
                </View>

                {/* Verification Code Input */}
                <View style={styles.inputWrapper}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Código de Verificación</Text>
                  <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#1A1A1A' : '#F3F4F6', borderColor: isDarkMode ? '#333' : '#E5E7EB', height: 60 }]}>
                    <Ionicons name="key-outline" size={22} color={theme.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.textInput, { color: theme.text, fontSize: 20, letterSpacing: 6, fontWeight: '700', textAlign: 'center' }]}
                      placeholder="123456"
                      placeholderTextColor={theme.textSecondary}
                      value={verificationCode}
                      onChangeText={setVerificationCode}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus={true}
                    />
                  </View>
                </View>
              </>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: theme.accent }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {isRegisterMode
                    ? (isVerifying ? 'Verificar y Registrarse' : 'Continuar al Registro')
                    : 'Entrar'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Cancel/Go Back Verification Button */}
            {isRegisterMode && isVerifying && (
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: theme.danger }]}
                onPress={handleCancelVerification}
                disabled={loading}
              >
                <Text style={[styles.cancelBtnText, { color: theme.danger }]}>
                  Cancelar y cambiar datos
                </Text>
              </TouchableOpacity>
            )}

            {/* Toggle Mode Link (only if not verifying code) */}
            {!isVerifying && (
              <TouchableOpacity
                style={styles.toggleModeBtn}
                onPress={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
              >
                <Text style={[styles.toggleModeText, { color: theme.textSecondary }]}>
                  {isRegisterMode ? '¿Ya tienes una cuenta? ' : '¿No tienes una cuenta todavía? '}
                  <Text style={{ color: theme.accent, fontWeight: '700' }}>
                    {isRegisterMode ? 'Inicia Sesión' : 'Regístrate'}
                  </Text>
                </Text>
              </TouchableOpacity>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  brandTagline: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  formCard: {
    borderRadius: 20,
    padding: 24,
    elevation: 6,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 15,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 20,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  successText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  sandboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 4,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    height: '100%',
    padding: 0,
    marginRight: 8,
    minWidth: 150
  },
  eyeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtn: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  toggleModeBtn: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleModeText: {
    fontSize: 14,
  },
});
