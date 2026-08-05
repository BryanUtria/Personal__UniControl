import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions, Modal, ActivityIndicator, Pressable, Platform, TextInput } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useShop } from '../../context/ShopContext';
import { useToast } from '../../context/ToastContext';
import { Ionicons } from '@expo/vector-icons';
import SidebarLayout from '../../navigation/SidebarLayout';
import Button from '../../components/Button';

export default function ShopMenuScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const { shops, activeShop, loading, selectShop, createShop, joinShop, refreshShops } = useShop();
  const { showToast } = useToast();

  // Estado del dropdown
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const selectorRef = useRef(null);

  // Estado del modal de gestión de tiendas
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'join'
  const [shopName, setShopName] = useState('');
  const [shopCode, setShopCode] = useState('');
  const [saving, setSaving] = useState(false);

  const menuItems = [
    {
      title: 'Punto de Venta',
      description: 'Registrar ventas y facturación.',
      icon: 'cart',
      route: 'POS',
      color: '#3B82F6'
    },
    {
      title: 'Inventario',
      description: 'Gestión de productos y stock.',
      icon: 'cube',
      route: 'Inventory',
      color: '#10B981'
    },
    {
      title: 'Historial de Ventas',
      description: 'Revisar ventas pasadas y reportes.',
      icon: 'receipt',
      route: 'SalesHistory',
      color: '#8B5CF6'
    }
  ];

  // Al cambiar la tienda activa, refrescamos las tiendas para actualizar contadores
  useEffect(() => {
    if (activeShop && shops.length > 0) {
      const current = shops.find(s => String(s.id) === String(activeShop.id));
      if (current) {
        // Actualizar la referencia activa con datos frescos si cambió
        selectShop(current);
      }
    }
  }, [shops]);

  const openCreateModal = () => {
    setModalMode('create');
    setShopName('');
    setShopCode('');
    setManageModalVisible(true);
  };

  const openJoinModal = () => {
    setModalMode('join');
    setShopName('');
    setShopCode('');
    setManageModalVisible(true);
  };

  const handleSave = async () => {
    if (modalMode === 'create') {
      if (!shopName.trim()) {
        showToast('Ingresa el nombre de la tienda.', 'warning');
        return;
      }
      setSaving(true);
      const result = await createShop(shopName.trim());
      setSaving(false);
      if (result.success) {
        showToast('¡Tienda creada correctamente!', 'success');
        setManageModalVisible(false);
      } else {
        showToast(result.error, 'error');
      }
    } else {
      if (!shopCode.trim()) {
        showToast('Ingresa el código de la tienda.', 'warning');
        return;
      }
      setSaving(true);
      const result = await joinShop(shopCode.trim().toUpperCase());
      setSaving(false);
      if (result.success) {
        showToast(result.shop?.already_member ? 'Ya estabas vinculado a esta tienda.' : '¡Vinculado a la tienda correctamente!', 'success');
        setManageModalVisible(false);
      } else {
        showToast(result.error, 'error');
      }
    }
  };

  const renderShopOnboarding = () => (
    <View style={{ paddingVertical: 20 }}>
      {/* Encabezado */}
      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <View style={[styles.onboardingIcon, { backgroundColor: theme.accent + '15' }]}>
          <Ionicons name="storefront-outline" size={40} color={theme.accent} />
        </View>
        <Text style={[styles.onboardingTitle, { color: theme.text }]}>
          Crea tu primera tienda
        </Text>
        <Text style={[styles.onboardingSubtitle, { color: theme.textSecondary }]}>
          Cada tienda tiene su propio inventario, ventas e historial, identificados con un código único.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <TouchableOpacity
          style={[styles.onboardingCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
          onPress={openCreateModal}
          activeOpacity={0.8}
        >
          <View style={[styles.onboardingCardIcon, { backgroundColor: theme.accent + '15' }]}>
            <Ionicons name="add-circle-outline" size={28} color={theme.accent} />
          </View>
          <View style={styles.onboardingCardContent}>
            <Text style={[styles.onboardingCardTitle, { color: theme.text }]}>Crear nueva tienda</Text>
            <Text style={[styles.onboardingCardDesc, { color: theme.textSecondary }]}>
              Empieza desde cero y genera un código único para compartir.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.textSecondary} style={{ opacity: 0.5 }} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.onboardingCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
          onPress={openJoinModal}
          activeOpacity={0.8}
        >
          <View style={[styles.onboardingCardIcon, { backgroundColor: '#8B5CF615' }]}>
            <Ionicons name="link-outline" size={28} color="#8B5CF6" />
          </View>
          <View style={styles.onboardingCardContent}>
            <Text style={[styles.onboardingCardTitle, { color: theme.text }]}>Vincular a tienda existente</Text>
            <Text style={[styles.onboardingCardDesc, { color: theme.textSecondary }]}>
              Únete con el código alfanumérico que te compartieron.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.textSecondary} style={{ opacity: 0.5 }} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const openDropdown = () => {
    if (selectorRef.current && selectorRef.current.measureInWindow) {
      selectorRef.current.measureInWindow((x, y, width, height) => {
        setDropdownPosition({ x, y, width, height });
        setDropdownVisible(true);
      });
    } else {
      setDropdownVisible(true);
    }
  };

  const renderShopSelector = () => (
    <View style={{ marginBottom: 20 }}>
      {/* Selector desplegable */}
      <View ref={selectorRef} collapsable={false} style={{ position: 'relative', zIndex: 100 }}>
        <TouchableOpacity
          style={[styles.shopSelectorBtn, { backgroundColor: theme.card, shadowColor: theme.shadow, borderColor: theme.border }]}
          onPress={openDropdown}
          activeOpacity={0.8}
        >
          <View style={[styles.shopSelectorIcon, { backgroundColor: theme.accent + '15' }]}>
            <Ionicons name="storefront" size={20} color={theme.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '600' }}>TIENDA ACTIVA</Text>
            <Text style={[styles.shopSelectorName, { color: theme.text }]} numberOfLines={1}>
              {activeShop ? activeShop.name : 'Selecciona una tienda'}
            </Text>
          </View>
          {activeShop && activeShop.code ? (
            <View style={[styles.shopCodeBadge, { backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)' }]}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#3B82F6', letterSpacing: 1 }}>{activeShop.code}</Text>
            </View>
          ) : null}
          <Ionicons name={dropdownVisible ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SidebarLayout 
      navigation={navigation} 
      title="Tienda" 
      activeRoute="ShopMenu"
    >
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.background }]} 
        contentContainerStyle={[styles.scrollContent, { padding: 10 }]}
        onScroll={() => setDropdownVisible(false)}
        scrollEventThrottle={16}
      >
        {loading ? (
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={{ color: theme.textSecondary, marginTop: 12, fontSize: 14 }}>Cargando tiendas...</Text>
          </View>
        ) : shops.length === 0 ? (
          <>
            <Text style={[styles.headerText, { color: theme.textSecondary, marginBottom: 20 }]}>
              Antes de usar los módulos de la tienda, configura una tienda:
            </Text>
            {renderShopOnboarding()}
          </>
        ) : (
          <>
            {renderShopSelector()}

            <Text style={[styles.headerText, { color: theme.textSecondary, marginBottom: 20 }]}>
              Selecciona un módulo de la tienda para continuar:
            </Text>

            <View style={styles.grid}>
              {menuItems.map((item, index) => (
                <TouchableOpacity 
                  key={index}
                  style={[
                    styles.card, 
                    { backgroundColor: theme.card, shadowColor: theme.shadow }
                  ]}
                  onPress={() => navigation.navigate(item.route)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.iconWrapper, { backgroundColor: item.color + '15' }]}>
                    <Ionicons name={item.icon} size={32} color={item.color} />
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{item.title}</Text>
                    <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>{item.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color={theme.textSecondary} style={{ opacity: 0.5 }} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Información de la tienda activa */}
            {activeShop && (
              <View style={[styles.activeShopInfo, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="information-circle-outline" size={18} color={theme.textSecondary} style={{ marginRight: 8 }} />
                  <Text style={{ color: theme.textSecondary, fontSize: 13, flex: 1 }}>
                    Los datos mostrados en los módulos pertenecen a <Text style={{ fontWeight: '700', color: theme.text }}>{activeShop.name}</Text>.
                  </Text>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* MODAL DROPDOWN DE TIENDAS */}
      <Modal
        visible={dropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <Pressable style={styles.dropdownBackdrop} onPress={() => setDropdownVisible(false)}>
          {dropdownPosition && (
            <View style={[styles.shopDropdown, {
              backgroundColor: theme.card,
              borderColor: theme.border,
              shadowColor: theme.shadow,
              position: 'absolute',
              top: dropdownPosition.y + dropdownPosition.height + 0,
              left: dropdownPosition.x,
              width: dropdownPosition.width,
              maxHeight: 320,
            }]}>
              <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                {shops.map((shop, index) => {
                  const isActive = activeShop && String(shop.id) === String(activeShop.id);
                  return (
                    <TouchableOpacity
                      key={shop.id}
                      style={[
                        styles.shopDropdownItem,
                        { borderBottomColor: theme.background },
                        index === shops.length - 1 && { borderBottomWidth: 0 }
                      ]}
                      onPress={() => {
                        selectShop(shop);
                        setDropdownVisible(false);
                        showToast(`Tienda seleccionada: ${shop.name}`, 'info');
                      }}
                    >
                      <View style={[styles.shopDropdownIcon, { backgroundColor: isActive ? theme.accent + '20' : 'rgba(100, 116, 139, 0.1)' }]}>
                        <Ionicons name={isActive ? 'storefront' : 'storefront-outline'} size={18} color={isActive ? theme.accent : theme.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.shopDropdownName, { color: isActive ? theme.accent : theme.text }]} numberOfLines={1}>
                          {shop.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                          {shop.code} · {shop.product_count || 0} productos
                        </Text>
                      </View>
                      {shop.is_owner ? (
                        <View style={[styles.ownerBadge, { backgroundColor: '#F59E0B15' }]}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#F59E0B' }}>DUEÑO</Text>
                        </View>
                      ) : null}
                      {isActive && <Ionicons name="checkmark-circle" size={20} color={theme.accent} style={{ marginLeft: 6 }} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Acciones del dropdown */}
              <View style={[styles.shopDropdownFooter, { borderTopColor: theme.background }]}>
                <TouchableOpacity
                  style={styles.shopDropdownAction}
                  onPress={() => { setDropdownVisible(false); openCreateModal(); }}
                >
                  <Ionicons name="add-circle-outline" size={16} color={theme.accent} />
                  <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600', marginLeft: 6 }}>Nueva tienda</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.shopDropdownAction}
                  onPress={() => { setDropdownVisible(false); openJoinModal(); }}
                >
                  <Ionicons name="link-outline" size={16} color="#8B5CF6" />
                  <Text style={{ color: '#8B5CF6', fontSize: 13, fontWeight: '600', marginLeft: 6 }}>Vincular</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Pressable>
      </Modal>

      {/* MODAL CREAR / VINCULAR TIENDA */}
      <Modal
        visible={manageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setManageModalVisible(false)}
      >
        <Pressable style={[styles.modalOverlay, { padding: isMobile ? 10 : 20 }]} onPress={() => setManageModalVisible(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.card, padding: isMobile ? 15 : 20 }]} onPress={(e) => { if (Platform.OS === 'web') e.stopPropagation(); }}>
            {/* Tabs */}
            <View style={[styles.modalTabs, { backgroundColor: theme.background, borderRadius: 10, padding: 4, marginBottom: 18 }]}>
              <TouchableOpacity
                style={[styles.modalTab, modalMode === 'create' && { backgroundColor: theme.accent }]}
                onPress={() => { setModalMode('create'); setShopCode(''); }}
              >
                <Ionicons name="add-circle-outline" size={16} color={modalMode === 'create' ? '#FFF' : theme.textSecondary} style={{ marginRight: 6 }} />
                <Text style={[styles.modalTabText, { color: modalMode === 'create' ? '#FFF' : theme.textSecondary }]}>Crear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalTab, modalMode === 'join' && { backgroundColor: '#8B5CF6' }]}
                onPress={() => { setModalMode('join'); setShopName(''); }}
              >
                <Ionicons name="link-outline" size={16} color={modalMode === 'join' ? '#FFF' : theme.textSecondary} style={{ marginRight: 6 }} />
                <Text style={[styles.modalTabText, { color: modalMode === 'join' ? '#FFF' : theme.textSecondary }]}>Vincular</Text>
              </TouchableOpacity>
            </View>

            {modalMode === 'create' ? (
              <>
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={[styles.modalIconCircle, { backgroundColor: theme.accent + '15' }]}>
                    <Ionicons name="storefront-outline" size={30} color={theme.accent} />
                  </View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Crear Nueva Tienda</Text>
                  <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                    Al crear la tienda se generará un código único para que otros puedan vincularse.
                  </Text>
                </View>

                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Nombre de la tienda *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Ionicons name="storefront-outline" size={18} color={theme.textSecondary} style={{ marginRight: 8 }} />
                  <TextInput
                    placeholder="Ej. Tienda Centro, Mi Bodega..."
                    placeholderTextColor={theme.textSecondary + '80'}
                    value={shopName}
                    onChangeText={setShopName}
                    style={[styles.input, { color: theme.text }]}
                    autoCapitalize="sentences"
                  />
                </View>
              </>
            ) : (
              <>
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={[styles.modalIconCircle, { backgroundColor: '#8B5CF615' }]}>
                    <Ionicons name="link-outline" size={30} color="#8B5CF6" />
                  </View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Vincular a Tienda Existente</Text>
                  <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                    Ingresa el código alfanumérico que te compartió el dueño de la tienda.
                  </Text>
                </View>

                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Código de la tienda *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Ionicons name="key-outline" size={18} color={theme.textSecondary} style={{ marginRight: 8 }} />
                  <TextInput
                    placeholder="Ej. AB12CD34"
                    placeholderTextColor={theme.textSecondary + '80'}
                    value={shopCode}
                    onChangeText={(text) => setShopCode(text.toUpperCase())}
                    style={[styles.input, { color: theme.text, letterSpacing: 2, fontWeight: '700' }]}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>
              </>
            )}

            <View style={styles.modalButtons}>
              <Button
                title="Cancelar"
                onPress={() => setManageModalVisible(false)}
                variant="secondary"
                style={{ flex: 1 }}
                loading={false}
              />
              <Button
                title={modalMode === 'create' ? 'Crear Tienda' : 'Vincularme'}
                onPress={handleSave}
                variant="primary"
                loading={saving}
                style={{ flex: 1 }}
                backgroundColor={modalMode === 'create' ? theme.accent : '#8B5CF6'}
              />
            </View>
          </Pressable>
        </Pressable>
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
  headerText: {
    fontSize: 16,
  },
  grid: {
    gap: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  iconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 14,
  },

  // Selector de tienda
  shopSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  shopSelectorIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  shopSelectorName: {
    fontSize: 16,
    fontWeight: '700',
  },
  shopCodeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  shopDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  shopDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  shopDropdownIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  shopDropdownName: {
    fontSize: 14,
    fontWeight: '600',
  },
  ownerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  shopDropdownFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  shopDropdownAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  activeShopInfo: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },

  // Onboarding
  onboardingIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  onboardingTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  onboardingSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  onboardingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  onboardingCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  onboardingCardContent: {
    flex: 1,
  },
  onboardingCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  onboardingCardDesc: {
    fontSize: 13,
    lineHeight: 18,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
  },
  modalContent: {
    borderRadius: 20,
    maxWidth: 450,
    width: '100%',
    alignSelf: 'center',
  },
  modalTabs: {
    flexDirection: 'row',
  },
  modalTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalTabText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 10,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
});