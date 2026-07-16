import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/Button';
import Input from '../../components/Input';

import LogoImage from '../../../assets/Navegador.png';

export default function LoginScreen() {
  const { login, sendVerificationCode, register } = useAuth();
  const { theme } = useTheme();
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
          <View style={[styles.formCard, { backgroundColor: theme.card, shadowColor: theme.shadow, width: isMobile ? '100%' : '50%' }]}>
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
                  <Input
                    label="Nombre Completo"
                    icon="card-outline"
                    placeholder="Ej. Juan Pérez"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                )}

                {/* Username Input */}
                <Input
                  label="Usuario"
                  icon="person-outline"
                  placeholder="Nombre de usuario"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />

                {/* Email Input (Register Only) */}
                {isRegisterMode && (
                  <Input
                    label="Correo Electrónico (Obligatorio)"
                    icon="mail-outline"
                    placeholder="ejemplo@correo.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                )}

                {/* Password Input */}
                <Input
                  label="Contraseña"
                  icon="lock-closed-outline"
                  placeholder="Tu contraseña secreta"
                  value={password}
                  onChangeText={setPassword}
                  isPassword={true}
                  autoCapitalize="none"
                />
              </>
            ) : (
              <>
                {/* Information Header */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                    Hemos enviado un código secreto de 6 dígitos a <Text style={{ fontWeight: '700', color: theme.text }}>{email}</Text>. Por favor ingresa el código a continuación para verificar tu identidad. (Recuerda revisar también tu carpeta de spam o correo no deseado).
                  </Text>
                </View>

                {/* Verification Code Input */}
                <Input
                  label="Código de Verificación"
                  icon="key-outline"
                  placeholder="123456"
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus={true}
                  inputStyle={{ fontSize: 20, letterSpacing: 6, fontWeight: '700', textAlign: 'center' }}
                  containerStyle={{ minHeight: 60 }}
                />
              </>
            )}

            {/* Submit Button */}
            <Button
              title={isRegisterMode
                ? (isVerifying ? 'Verificar y Registrarse' : 'Continuar al Registro')
                : 'Entrar'}
              onPress={handleSubmit}
              loading={loading}
              variant="primary"
              style={[styles.submitBtn, { backgroundColor: theme.accent }]}
            />

            {/* Cancel/Go Back Verification Button */}
            {isRegisterMode && isVerifying && (
              <Button
                title="Cancelar y cambiar datos"
                onPress={handleCancelVerification}
                variant="danger"
                disabled={loading}
                style={styles.cancelBtn}
              />
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
    alignSelf: 'center',
    borderRadius: 20,
    padding: 20,
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
