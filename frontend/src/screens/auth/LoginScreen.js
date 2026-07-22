import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

import LogoImage from '../../../assets/Navegador.png';

export default function LoginScreen() {
  const { login, loginWithGoogle, sendVerificationCode, register } = useAuth();
  const { theme } = useTheme();

  // AuthRequest para Web
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'TBD_CLIENT_ID',
    prompt: 'select_account'
  });

  useEffect(() => {
    if (Platform.OS !== 'web') {
      GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'TBD_CLIENT_ID',
      });
    }
  }, []);

  useEffect(() => {
    if (response?.type === 'success' && Platform.OS === 'web') {
      const idToken = response.params?.id_token || response.authentication?.idToken;
      if (idToken) {
        setLoading(true);
        loginWithGoogle(idToken).then(res => {
          setLoading(false);
          if (!res.success) setErrorMsg(res.error);
        });
      }
    }
  }, [response]);
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

  // Estados de recuperación de contraseña
  const [recoveryStep, setRecoveryStep] = useState(0); // 0 = No, 1 = Email, 2 = Código, 3 = Nueva
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const handleCancelVerification = () => {
    setIsVerifying(false);
    setVerificationCode('');
    setSandboxCode(null);
    setSandboxMode(false);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleGoogleSignIn = async () => {
    if (Platform.OS === 'web') {
      promptAsync();
      return;
    }

    try {
      setLoading(true);
      setErrorMsg('');
      await GoogleSignin.hasPlayServices();
      // Forzar siempre a elegir cuenta cerrando cualquier sesión previa
      try {
        await GoogleSignin.signOut();
      } catch (e) {
        // Ignorar si no había sesión
      }
      const userInfo = await GoogleSignin.signIn();
      // userInfo.idToken contains the JWT token we need to send to the backend
      const res = await loginWithGoogle(userInfo.idToken || userInfo.data?.idToken); // Depends on the version of google-signin
      if (!res.success) {
        setErrorMsg(res.error);
      }
    } catch (error) {
      console.error(error);
      if (error.code === 'SIGN_IN_CANCELLED') {
        // user cancelled the login flow
      } else if (error.code === 'IN_PROGRESS') {
        // operation (e.g. sign in) is in progress already
      } else if (error.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        setErrorMsg('Play Services no disponibles o desactualizados');
      } else {
        setErrorMsg('Ha ocurrido un error al iniciar sesión con Google.');
      }
    } finally {
      setLoading(false);
    }
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

  const handleRequestRecoveryCode = async () => {
    if (!recoveryEmail) {
      setErrorMsg('Ingresa tu correo para recuperar la contraseña.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/recover-password/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim() })
      });
      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'Error al enviar código.');
      } else {
        setSandboxMode(data.sandboxMode);
        if (data.sandboxMode && data.sandboxCode) setSandboxCode(data.sandboxCode);
        setSuccessMsg('Código enviado al correo.');
        setRecoveryStep(2);
      }
    } catch (e) {
      setErrorMsg('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRecoveryCode = () => {
    if (verificationCode.length !== 6) {
      setErrorMsg('El código debe tener 6 dígitos.');
      return;
    }
    setErrorMsg('');
    setSuccessMsg('Código aceptado. Ingresa tu nueva contraseña.');
    setRecoveryStep(3);
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/recover-password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim(), code: verificationCode.trim(), newPassword })
      });
      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'Error al restablecer contraseña.');
      } else {
        setSuccessMsg('Contraseña restablecida exitosamente. Ahora puedes iniciar sesión.');
        cancelRecovery();
      }
    } catch (e) {
      setErrorMsg('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  const cancelRecovery = () => {
    setRecoveryStep(0);
    setRecoveryEmail('');
    setVerificationCode('');
    setNewPassword('');
    setConfirmNewPassword('');
    setErrorMsg('');
    setSandboxCode(null);
    setSandboxMode(false);
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
              {recoveryStep > 0
                ? (recoveryStep === 1 ? 'Recuperar Contraseña' : recoveryStep === 2 ? 'Ingresa el Código' : 'Nueva Contraseña')
                : isRegisterMode
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

            {!isVerifying && recoveryStep === 0 ? (
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

                {/* Botón de Olvidaste tu contraseña */}
                {!isRegisterMode && (
                  <TouchableOpacity onPress={() => setRecoveryStep(1)} style={{ alignSelf: 'flex-end', marginBottom: 5 }}>
                    <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>¿Olvidaste tu contraseña?</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : recoveryStep === 0 ? (
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
            ) : null}

            {/* RECOVERY FLOW */}
            {recoveryStep === 1 && (
              <>
                <Text style={{ color: theme.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
                  Ingresa el correo asociado a tu cuenta. Te enviaremos un código para restablecer tu contraseña.
                </Text>
                <Input
                  label="Correo Electrónico"
                  icon="mail-outline"
                  placeholder="ejemplo@correo.com"
                  value={recoveryEmail}
                  onChangeText={setRecoveryEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </>
            )}
            {recoveryStep === 2 && (
              <>
                <Text style={{ color: theme.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
                  Hemos enviado un código a <Text style={{ fontWeight: '700', color: theme.text }}>{recoveryEmail}</Text>.
                </Text>
                <Input
                  label="Código de Seguridad"
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
            {recoveryStep === 3 && (
              <>
                <Input
                  label="Nueva Contraseña"
                  icon="lock-closed-outline"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  isPassword={true}
                />
                <Input
                  label="Confirmar Contraseña"
                  icon="lock-closed-outline"
                  placeholder="Mínimo 6 caracteres"
                  value={confirmNewPassword}
                  onChangeText={setConfirmNewPassword}
                  isPassword={true}
                />
              </>
            )}

            {/* Submit Button */}
            <Button
              title={
                recoveryStep === 1 ? 'Enviar Código' :
                  recoveryStep === 2 ? 'Verificar Código' :
                    recoveryStep === 3 ? 'Restablecer Contraseña' :
                      isRegisterMode ? (isVerifying ? 'Verificar y Registrarse' : 'Continuar al Registro') : 'Entrar'
              }
              onPress={
                recoveryStep === 1 ? handleRequestRecoveryCode :
                  recoveryStep === 2 ? handleVerifyRecoveryCode :
                    recoveryStep === 3 ? handleResetPassword :
                      handleSubmit
              }
              loading={loading}
              variant="primary"
              style={[styles.submitBtn, { backgroundColor: theme.accent }]}
            />

            {/* Google Sign In Button */}
            {!isVerifying && recoveryStep === 0 && (
              <TouchableOpacity
                style={[styles.googleBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={handleGoogleSignIn}
                disabled={loading}
              >
                <Ionicons name="logo-google" size={20} color={theme.text} style={{ marginRight: 10 }} />
                <Text style={[styles.googleBtnText, { color: theme.text }]}>
                  {isRegisterMode ? 'Registrarse con Google' : 'Continuar con Google'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Cancel/Go Back Verification Button */}
            {((isRegisterMode && isVerifying) || recoveryStep > 0) && (
              <Button
                title={recoveryStep > 0 ? "Cancelar Recuperación" : "Cancelar y cambiar datos"}
                onPress={recoveryStep > 0 ? cancelRecovery : handleCancelVerification}
                variant="danger"
                disabled={loading}
                style={[styles.googleBtn, { marginTop: 15, backgroundColor: theme.danger + '10', borderColor: theme.danger }]}
              />
            )}

            {/* Footer Text (Login <-> Register) */}
            {recoveryStep === 0 && (
              <View style={[styles.footerContainer, { alignItems: 'center', paddingTop: 10 }]}>
                <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                  {isRegisterMode ? '¿Ya tienes una cuenta?' : '¿No tienes una cuenta?'}
                </Text>
                <TouchableOpacity onPress={() => setIsRegisterMode(!isRegisterMode)} disabled={isVerifying || loading}>
                  <Text style={[styles.footerLink, { color: theme.accent }]}>
                    {isRegisterMode ? 'Inicia Sesión' : 'Regístrate aquí'}
                  </Text>
                </TouchableOpacity>
              </View>
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
    justifyContent: 'flex-start',
    padding: 24,
    paddingTop: 50
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
    lineHeight: 18,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 15,
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: '600',
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
