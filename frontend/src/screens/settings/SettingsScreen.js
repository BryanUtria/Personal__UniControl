import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Switch, ScrollView, Platform, Alert, useWindowDimensions, Modal, Linking, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useModules } from '../../context/ModuleContext';
import { useToast } from '../../context/ToastContext';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, getOfflineQueue, clearOfflineQueue, syncOfflineQueue, isConnected } from '../../utils/offlineSync';
import Button from '../../components/Button';
import Input from '../../components/Input';
import SidebarLayout from '../../navigation/SidebarLayout';
import SubscriptionModal from '../../components/SubscriptionModal';

export default function SettingsScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { user, updateProfile, sendVerificationCode } = useAuth();
  const { moduleSettings, saveModuleSettings } = useModules();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [pendingQueue, setPendingQueue] = useState([]);
  const [syncingManual, setSyncingManual] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [subModalVisible, setSubModalVisible] = useState(false);
  const [appVersionInfo, setAppVersionInfo] = useState(null);
  const [targetModule, setTargetModule] = useState(null);
  const [myModules, setMyModules] = useState([]);

  // Perfil Edit States
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Email verification states
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [sandboxCode, setSandboxCode] = useState(null);
  const [sandboxMode, setSandboxMode] = useState(false);

  const resetProfileModal = () => {
    setProfileModalVisible(false);
    setIsVerifyingEmail(false);
    setEmailCode('');
    setSandboxCode(null);
    setSandboxMode(false);
    setProfileError('');
  };

  const handleUpdateProfile = async () => {
    if (!editName.trim() || !editUsername.trim() || !editEmail.trim()) {
      setProfileError('Nombre, Usuario y Correo son obligatorios.');
      return;
    }

    // Si cambia el correo y no estamos en modo verificación, enviar código
    if (editEmail.trim() !== user?.email && !isVerifyingEmail) {
      setProfileLoading(true);
      setProfileError('');
      // No pasamos username para no activar validación de username tomado en send-code
      const res = await sendVerificationCode(editEmail.trim(), undefined);
      setProfileLoading(false);

      if (res.success) {
        setIsVerifyingEmail(true);
        setSandboxMode(res.sandboxMode);
        if (res.sandboxMode) {
          setSandboxCode(res.sandboxCode);
        }
        showToast(res.sandboxMode ? 'Código de prueba generado' : 'Código enviado a tu nuevo correo', 'success');
      } else {
        setProfileError(res.error || 'Error enviando código de verificación');
      }
      return;
    }

    if (isVerifyingEmail && (!emailCode || emailCode.length !== 6)) {
      setProfileError('Ingresa el código de 6 dígitos que enviamos a tu correo.');
      return;
    }

    setProfileLoading(true);
    setProfileError('');
    const res = await updateProfile({
      name: editName.trim(),
      username: editUsername.trim(),
      email: editEmail.trim(),
      password: editPassword,
      code: isVerifyingEmail ? emailCode : undefined
    });
    setProfileLoading(false);

    if (res.success) {
      showToast('Perfil actualizado con éxito', 'success');
      resetProfileModal();
    } else {
      setProfileError(res.error || 'Error al actualizar');
    }
  };

  useEffect(() => {
    fetchModules();
    fetchAppVersion();
  }, [user]);

  const fetchAppVersion = async () => {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api'}/version`);
      if (response.ok) {
        const data = await response.json();
        setAppVersionInfo(data);
      }
    } catch (e) {
      console.log('Error fetching version:', e);
    }
  };

  const fetchModules = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api'}/modules`, {
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        const data = await response.json();
        setMyModules(data);
      }
    } catch (e) { }
  };

  const getModulePriceText = (key) => {
    const mod = myModules.find(m => m.module_key === key);
    if (!mod) return '';
    const price = (mod.custom_price_cop !== null && mod.custom_price_cop < mod.base_price_cop)
      ? mod.custom_price_cop
      : mod.base_price_cop;

    if (!price || price === 0) return '';

    return `- $ ${Math.round(price).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}/mes`;
  };

  // Cargar la cola de sincronización offline
  const loadQueue = async () => {
    try {
      const queue = await getOfflineQueue();
      setPendingQueue(queue);
    } catch (err) {
      console.error('Error cargando cola offline:', err);
    }
  };

  const checkNetwork = async () => {
    const online = await isConnected();
    setNetworkOnline(online);
  };

  useEffect(() => {
    loadQueue();
    checkNetwork();
    const interval = setInterval(() => {
      loadQueue();
      checkNetwork();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleModule = (key) => {

    const updated = {
      ...moduleSettings,
      [key]: !moduleSettings[key]
    };
    saveModuleSettings(updated);
    let moduleName = 'Módulo';
    if (key === 'showShop') moduleName = 'Tienda';
    if (key === 'showDebtors') moduleName = 'Deudas';
    if (key === 'showHabits') moduleName = 'Hábitos';
    if (key === 'showExpenses') moduleName = 'Gastos';
    showToast(`Módulo ${moduleName} ${updated[key] ? 'habilitado' : 'deshabilitado'}`, 'info', 2000);
  };

  const handleManualSync = async () => {
    if (syncingManual) return;
    setSyncingManual(true);

    const online = await isConnected();
    if (!online) {
      showToast('Aún no tienes conexión a internet.', 'warning');
      setSyncingManual(false);
      return;
    }

    showToast('Sincronizando cambios manualmente...', 'info');
    const res = await syncOfflineQueue();
    if (res && res.success) {
      if (res.processed > 0) {
        showToast(`¡Sincronizado! Se subieron ${res.processed} cambios.`, 'success');
      } else {
        showToast('Todo está al día.', 'success');
      }
    } else {
      showToast(`Fallo al sincronizar: ${res.error || 'reintente luego'}`, 'danger');
    }
    await loadQueue();
    setSyncingManual(false);
  };

  const handleClearQueue = () => {
    Alert.alert(
      'Limpiar Datos Pendientes',
      '¿Estás seguro de que deseas eliminar todas las peticiones sin sincronizar? Esto descartará permanentemente los cambios realizados en modo offline.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Eliminar',
          style: 'destructive',
          onPress: async () => {
            await clearOfflineQueue();
            await loadQueue();
            showToast('Cola de sincronización vaciada.', 'info');
          }
        }
      ]
    );
  };

  const getFriendlyRequestName = (req) => {
    const { url, method, body } = req;
    let parsedBody = {};
    try {
      if (body) {
        parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
      }
    } catch (e) { }

    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('/checkout')) {
      return `Facturar Pedido (Ref: ${parsedBody.reference || 'Cliente'})`;
    }
    if (lowerUrl.includes('/recharge')) {
      return `Recargar Stock (Monto: $${parsedBody.price || 0})`;
    }
    if (lowerUrl.includes('/orders') && method === 'POST') {
      return `Crear Pedido/Mesa: "${parsedBody.reference || 'Sin ref'}"`;
    }
    if (lowerUrl.includes('/orders') && method === 'DELETE') {
      return `Eliminar/Cancelar Pedido`;
    }
    if (lowerUrl.includes('/items') && method === 'POST') {
      return `Agregar Producto a Pedido`;
    }
    if (lowerUrl.includes('/items') && method === 'PUT') {
      return `Actualizar Cantidad en Pedido`;
    }
    if (lowerUrl.includes('/items') && method === 'DELETE') {
      return `Quitar Producto de Pedido`;
    }
    if (lowerUrl.includes('/products') && method === 'POST') {
      return `Crear Producto: "${parsedBody.name || ''}"`;
    }
    if (lowerUrl.includes('/products') && method === 'PUT') {
      return `Editar Producto: "${parsedBody.name || ''}"`;
    }
    if (lowerUrl.includes('/products') && method === 'DELETE') {
      return `Eliminar Producto`;
    }
    if (lowerUrl.includes('/debtors') && method === 'POST') {
      return `Crear Deudor/Ahorro: "${parsedBody.name || ''}"`;
    }
    if (lowerUrl.includes('/debtors') && method === 'PUT') {
      return `Editar Deudor/Ahorro: "${parsedBody.name || ''}"`;
    }
    if (lowerUrl.includes('/debtors') && method === 'DELETE') {
      return `Eliminar Cuenta de Deudor`;
    }
    if (lowerUrl.includes('/debts') && method === 'POST') {
      return `Registrar Transacción: $${parsedBody.amount || 0}`;
    }
    if (lowerUrl.includes('/debts') && method === 'DELETE') {
      return `Eliminar Transacción de Deuda`;
    }

    if (method === 'POST') return 'Registrar Información';
    if (method === 'PUT') return 'Actualizar Información';
    if (method === 'DELETE') return 'Eliminar Registro';
    return 'Procesar Cambio';
  };

  return (
    <SidebarLayout
      navigation={navigation}
      title="Configuración"
      activeRoute="Settings"
    >
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={[styles.scrollContent, { padding: isMobile ? 10 : 16 }]}>
        {/* SECCIÓN MI PERFIL */}
        <View style={[styles.section, { backgroundColor: theme.card, shadowColor: theme.shadow, marginBottom: isMobile ? 10 : 20 }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Mi Perfil</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
            <View style={[styles.iconContainer, { backgroundColor: theme.accent + '20', width: 50, height: 50, borderRadius: 25 }]}>
              <Text style={{ color: theme.accent, fontSize: 20, fontWeight: 'bold' }}>
                {user?.username ? user.username.substring(0, 2).toUpperCase() : 'U'}
              </Text>
            </View>
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: 'bold' }}>{user?.name || 'Usuario'}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>@{user?.username}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{user?.email}</Text>
            </View>
          </View>
          <Button
            title="Editar Datos de Perfil"
            variant="secondary"
            onPress={() => {
              setEditName(user?.name || '');
              setEditUsername(user?.username || '');
              setEditEmail(user?.email || '');
              setEditPassword('');
              setProfileError('');
              setProfileModalVisible(true);
            }}
            icon={<Ionicons name="create-outline" size={18} color={theme.text} />}
          />
        </View>

        {/* SECCIÓN MÓDULOS PERSONALES */}
        <View style={[styles.section, { backgroundColor: theme.card, shadowColor: theme.shadow, marginBottom: isMobile ? 10 : 20 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Módulos Personales</Text>
          <Text style={[styles.sectionDesc, { color: theme.textSecondary }]}>
            Herramientas para organizar tus finanzas personales y tu día a día.
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingLabelWrap}>
              <View style={[styles.iconContainer, { backgroundColor: '#8B5CF615' }]}>
                <Ionicons name="people" size={22} color="#8B5CF6" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Deudas, Deudores y Ahorros</Text>
                <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>Control de cuentas por cobrar, pagar y ahorros.</Text>
              </View>
            </View>
            <Switch
              value={moduleSettings.showDebtors}
              onValueChange={() => handleToggleModule('showDebtors')}
              trackColor={{ false: '#767577', true: theme.accent }}
              thumbColor={Platform.OS === 'ios' ? undefined : (moduleSettings.showDebtors ? '#FFF' : '#f4f3f4')}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLabelWrap}>
              <View style={[styles.iconContainer, { backgroundColor: '#10B98115' }]}>
                <Ionicons name="calendar" size={22} color="#10B981" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Hábitos y Tareas</Text>
                <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>Gestión de rutinas, actividades y calendario.</Text>
              </View>
            </View>
            <Switch
              value={moduleSettings.showHabits}
              onValueChange={() => handleToggleModule('showHabits')}
              trackColor={{ false: '#767577', true: theme.accent }}
              thumbColor={Platform.OS === 'ios' ? undefined : (moduleSettings.showHabits ? '#FFF' : '#f4f3f4')}
            />
          </View>

          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <View style={styles.settingLabelWrap}>
              <View style={[styles.iconContainer, { backgroundColor: '#F59E0B15' }]}>
                <Ionicons name="wallet" size={22} color="#F59E0B" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Control de Gastos</Text>
                <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>Gestión de gastos recurrentes mes a mes.</Text>
              </View>
            </View>
            <Switch
              value={moduleSettings.showExpenses}
              onValueChange={() => handleToggleModule('showExpenses')}
              trackColor={{ false: '#767577', true: theme.accent }}
              thumbColor={Platform.OS === 'ios' ? undefined : (moduleSettings.showExpenses ? '#FFF' : '#f4f3f4')}
            />
          </View>

          {/* Botón Suscripción Paquete Personal */}
          {user?.role !== 'admin' && (
            <View style={styles.premiumBtnWrap}>
              <TouchableOpacity
                style={[styles.subscribeBtn, { backgroundColor: theme.accent }]}
                activeOpacity={0.8}
                onPress={() => {
                  setTargetModule('personal');
                  setSubModalVisible(true);
                }}
              >
                <Ionicons name="star" size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.subscribeBtnText}>Desbloquear Paquete Personal</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* SECCIÓN MÓDULOS EMPRESARIALES */}
        <View style={[styles.section, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Módulos Empresariales</Text>
          <Text style={[styles.sectionDesc, { color: theme.textSecondary }]}>
            Lleva el control de tu negocio, inventario y ventas.
          </Text>

          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <View style={styles.settingLabelWrap}>
              <View style={[styles.iconContainer, { backgroundColor: '#3B82F615' }]}>
                <Ionicons name="cart" size={22} color="#3B82F6" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Tienda y Punto de Venta</Text>
                <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>Punto de Venta, Inventario e Historial de Ventas.</Text>
                {user?.role !== 'admin' && (
                  <Text style={{ fontSize: 10, color: theme.accent, fontWeight: 'bold', marginTop: 2 }}>
                    Premium
                  </Text>
                )}
              </View>
            </View>
            <Switch
              value={moduleSettings.showShop}
              onValueChange={() => handleToggleModule('showShop')}
              trackColor={{ false: '#767577', true: theme.accent }}
              thumbColor={Platform.OS === 'ios' ? undefined : (moduleSettings.showShop ? '#FFF' : '#f4f3f4')}
            />
          </View>

          {/* Botón Suscripción Paquete Empresarial */}
          {user?.role !== 'admin' && (
            <View style={styles.premiumBtnWrap}>
              <TouchableOpacity
                style={[styles.subscribeBtn, { backgroundColor: theme.accent }]}
                activeOpacity={0.8}
                onPress={() => {
                  setTargetModule('shop');
                  setSubModalVisible(true);
                }}
              >
                <Ionicons name="briefcase" size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.subscribeBtnText}>Desbloquear Paquete Tienda</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* SECCIÓN SINCRONIZACIÓN */}
        <View style={[styles.section, { backgroundColor: theme.card, shadowColor: theme.shadow, marginTop: isMobile ? 10 : 20 }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Sincronización Offline</Text>
            <View style={[styles.networkBadge, { backgroundColor: networkOnline ? '#10B98120' : theme.danger + '15' }]}>
              <View style={[styles.networkDot, { backgroundColor: networkOnline ? '#10B981' : theme.danger }]} />
              <Text style={[styles.networkBadgeText, { color: networkOnline ? '#10B981' : theme.danger }]}>
                {networkOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
          <Text style={[styles.sectionDesc, { color: theme.textSecondary }]}>
            Los cambios realizados sin internet se encolan localmente y se suben al servidor cuando se restablece la red.
          </Text>

          {pendingQueue.length === 0 ? (
            <View style={styles.emptyQueue}>
              <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
              <Text style={[styles.emptyQueueTitle, { color: theme.text }]}>¡Todo está al día!</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                No tienes ningún cambio pendiente de sincronización.
              </Text>
            </View>
          ) : (
            <View style={styles.queueContainer}>
              <View style={styles.queueHeader}>
                <Text style={[styles.queueTitle, { color: theme.text }]}>
                  Cola de cambios ({pendingQueue.length})
                </Text>
              </View>

              <View style={styles.queueList}>
                {pendingQueue.map((req, index) => {
                  const methodColor = req.method === 'POST' ? '#10B981' : req.method === 'PUT' ? '#3B82F6' : '#EF4444';
                  return (
                    <View
                      key={req.id || index}
                      style={[
                        styles.queueItem,
                        {
                          backgroundColor: theme.background,
                          borderColor: isDarkMode ? '#2D2D2D' : '#E5E7EB',
                          borderLeftColor: methodColor
                        }
                      ]}
                    >
                      <View style={styles.queueItemHeader}>
                        <Text style={[styles.queueMethodText, { color: methodColor }]}>
                          {req.method}
                        </Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
                          {req.timestamp ? new Date(req.timestamp).toLocaleTimeString() : ''}
                        </Text>
                      </View>
                      <Text style={[styles.queueItemDesc, { color: theme.text }]}>
                        {getFriendlyRequestName(req)}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.queueActions}>
                <Button
                  title="Limpiar Cola"
                  onPress={handleClearQueue}
                  variant="danger"
                  style={{ flex: 1 }}
                />

                <Button
                  title="Sincronizar Ahora"
                  onPress={handleManualSync}
                  variant="primary"
                  loading={syncingManual}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          )}
          <SubscriptionModal
            visible={subModalVisible}
            onClose={() => {
              setSubModalVisible(false);
              fetchModules();
            }}
            moduleKey={targetModule}
          />
        </View>

        {/* SECCIÓN PREFERENCIAS Y AYUDA */}
        <View style={[styles.section, { backgroundColor: theme.card, shadowColor: theme.shadow, marginTop: isMobile ? 10 : 20 }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Preferencias y Ayuda</Text>
          </View>

          <View style={[styles.settingRow, { borderBottomWidth: 1, borderColor: theme.border }]}>
            <View style={styles.settingLabelWrap}>
              <View style={[styles.iconContainer, { backgroundColor: isDarkMode ? '#F59E0B15' : '#4F46E515' }]}>
                <Ionicons name={isDarkMode ? 'color-palette' : 'color-palette-outline'} size={22} color={isDarkMode ? '#F59E0B' : '#4F46E5'} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Apariencia y Temas</Text>
                <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>Personaliza los colores de la aplicación.</Text>
              </View>
            </View>
            <Button
              title="Personalizar"
              variant="secondary"
              style={{ paddingHorizontal: 15, height: 35 }}
              onPress={() => navigation.navigate('Appearance')}
            />
          </View>

          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <View style={styles.settingLabelWrap}>
              <View style={[styles.iconContainer, { backgroundColor: '#10B98115' }]}>
                <Ionicons name="mail" size={22} color="#10B981" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Buzón de Sugerencias</Text>
                <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>Ayúdanos a mejorar enviando tus ideas.</Text>
              </View>
            </View>
            <Button
              title="Ir a Sugerencias"
              variant="secondary"
              style={{ paddingHorizontal: 15, height: 35 }}
              onPress={() => navigation.navigate('Suggestions')}
            />
          </View>
        </View>

        {/* SECCIÓN DESCARGAS/WEB */}
        {appVersionInfo && (
          <View style={[styles.section, { backgroundColor: theme.card, shadowColor: theme.shadow, marginTop: isMobile ? 10 : 20, marginBottom: 40 }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Plataformas UniControl</Text>
            </View>
            <Text style={[styles.sectionDesc, { color: theme.textSecondary, marginBottom: 15 }]}>
              {Platform.OS === 'web'
                ? 'Descarga nuestra aplicación para Android y lleva UniControl en tu bolsillo.'
                : 'Accede a la versión web de UniControl desde cualquier computadora.'}
            </Text>

            <Button
              title={Platform.OS === 'web' ? 'Descargar APK para Android' : 'Ir a la Versión Web'}
              icon={<Ionicons name={Platform.OS === 'web' ? 'logo-android' : 'globe-outline'} size={20} color="#FFF" />}
              variant="primary"
              onPress={() => {
                const url = Platform.OS === 'web' ? appVersionInfo.apkUrl : appVersionInfo.webUrl;
                if (url) Linking.openURL(url);
              }}
            />
          </View>
        )}
      </ScrollView>


      {/* Modal Editar Perfil */}
      <Modal
        visible={profileModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, width: isMobile ? '90%' : 400 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Editar Perfil</Text>
              <Button
                icon={<Ionicons name="close" size={24} color={theme.textSecondary} />}
                variant="secondary"
                style={{ paddingHorizontal: 5, paddingVertical: 5, borderWidth: 0, backgroundColor: 'transparent' }}
                onPress={resetProfileModal}
              />
            </View>

            {sandboxMode && sandboxCode ? (
              <View style={{ backgroundColor: '#FBBF2415', padding: 10, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#FBBF24' }}>
                <Text style={{ color: '#FBBF24', fontSize: 12, fontWeight: 'bold' }}>[MODO SANDBOX - CÓDIGO TEMPORAL]</Text>
                <Text style={{ color: theme.text, fontSize: 13, marginTop: 4 }}>Usa este código: <Text style={{ fontWeight: 'bold', fontSize: 14, color: theme.accent }}>{sandboxCode}</Text></Text>
              </View>
            ) : null}

            {profileError ? (
              <View style={{ backgroundColor: theme.danger + '15', padding: 10, borderRadius: 8, marginBottom: 15 }}>
                <Text style={{ color: theme.danger, fontSize: 13 }}>{profileError}</Text>
              </View>
            ) : null}

            <Input
              label="Nombre Completo"
              icon="person-outline"
              value={editName}
              onChangeText={setEditName}
            />

            <Input
              label="Nombre de Usuario"
              icon="at-outline"
              value={editUsername}
              onChangeText={setEditUsername}
              autoCapitalize="none"
            />

            <Input
              label="Correo Electrónico"
              icon="mail-outline"
              value={editEmail}
              onChangeText={setEditEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!isVerifyingEmail}
            />

            {isVerifyingEmail && (
              <Input
                label="Código de Verificación (6 dígitos)"
                icon="key-outline"
                placeholder="123456"
                value={emailCode}
                onChangeText={setEmailCode}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus={true}
              />
            )}

            {!isVerifyingEmail && (
              <Input
                label="Nueva Contraseña (Opcional)"
                icon="lock-closed-outline"
                placeholder="Dejar en blanco para no cambiar"
                value={editPassword}
                onChangeText={setEditPassword}
                isPassword={true}
                autoCapitalize="none"
              />
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button
                title={isVerifyingEmail ? "Cancelar Cambio" : "Cancelar"}
                variant="secondary"
                onPress={isVerifyingEmail ? () => setIsVerifyingEmail(false) : resetProfileModal}
                style={{ flex: 1 }}
              />
              <Button
                title={isVerifyingEmail ? "Verificar y Guardar" : "Guardar Cambios"}
                variant="primary"
                onPress={handleUpdateProfile}
                loading={profileLoading}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
  },
  section: {
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionDesc: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  settingLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  premiumBtnWrap: {
    alignSelf: 'center',
    marginTop: 10,
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  subscribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  subscribeBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  networkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  networkBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyQueue: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyQueueTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 10,
  },
  queueContainer: {
    marginTop: 8,
  },
  queueHeader: {
    marginBottom: 10,
  },
  queueTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  queueList: {
    gap: 8,
    maxHeight: 300,
    overflow: 'hidden',
  },
  queueItem: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  queueItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  queueMethodText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  queueItemDesc: {
    fontSize: 12,
    fontWeight: '500',
  },
  queueActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    ...Platform.select({
      web: { cursor: 'pointer' }
    })
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 16,
    padding: 20,
    elevation: 5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  subscribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  subscribeBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  }
});
