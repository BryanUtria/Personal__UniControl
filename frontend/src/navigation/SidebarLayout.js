import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Platform, ActivityIndicator, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useModules } from '../context/ModuleContext';
import { getOfflineQueue, isConnected } from '../utils/offlineSync';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useResponsive } from '../hooks/useResponsive';
import Button from '../components/Button';

export default function SidebarLayout({
  children,
  navigation,
  title,
  activeRoute,
  headerRight,
  onBackPress
}) {
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { moduleSettings, saveModuleSettings } = useModules();
  const { isMobile, width } = useResponsive();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);

  const isSidebarCollapsed = !isMobile && isCollapsed;

  // Sincronizar estado colapsado del menú lateral con la base de datos
  useEffect(() => {
    if (moduleSettings.unicontrol_sidebar_collapsed !== undefined) {
      setIsCollapsed(moduleSettings.unicontrol_sidebar_collapsed === true || moduleSettings.unicontrol_sidebar_collapsed === 'true');
    }
  }, [moduleSettings.unicontrol_sidebar_collapsed]);

  const toggleSidebar = async () => {
    try {
      const newVal = !isCollapsed;
      setIsCollapsed(newVal);
      await saveModuleSettings({ ...moduleSettings, unicontrol_sidebar_collapsed: newVal });
    } catch (err) {
      console.error('Error guardando estado del menú lateral:', err);
    }
  };

  // Consultar cola de sincronización offline
  const checkQueue = async () => {
    const queue = await getOfflineQueue();
    setQueueCount(queue.length);
  };

  useEffect(() => {
    checkQueue();
    const interval = setInterval(checkQueue, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected === true);
    });
    return () => unsubscribe();
  }, []);

  const handleNavigate = (route) => {
    if (activeRoute === route) {
      setIsDrawerOpen(false);
      return;
    }
    setIsDrawerOpen(false);
    navigation.navigate(route);
  };

  const navItems = [
    {
      label: 'Dashboard',
      icon: 'stats-chart',
      route: 'Dashboard',
      visible: true
    },
    {
      label: 'Deudas y Ahorros',
      icon: 'people',
      route: 'DebtorsList',
      visible: moduleSettings.showDebtors === true || moduleSettings.showDebtors === 'true'
    },
    {
      label: 'Hábitos y Tareas',
      icon: 'calendar',
      route: 'Habits',
      visible: moduleSettings.showHabits === true || moduleSettings.showHabits === 'true'
    },
    {
      label: 'Control de Gastos',
      icon: 'wallet',
      route: 'Expenses',
      visible: moduleSettings.showExpenses === true || moduleSettings.showExpenses === 'true'
    },
    {
      label: 'Tienda',
      icon: 'storefront',
      route: 'ShopMenu',
      visible: moduleSettings.showShop === true || moduleSettings.showShop === 'true'
    }
  ];

  const renderSidebarContent = () => {
    const fullName = user?.name || user?.username || 'Usuario';
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    return (
      <View style={[styles.sidebarContainer, { backgroundColor: theme.card }]}>
        {/* Brand Header */}
        <View style={[
          styles.brandContainer,
          { borderBottomColor: isDarkMode ? '#2D2D2D' : '#E5E7EB' },
          isSidebarCollapsed && { justifyContent: 'center', paddingHorizontal: 0 }
        ]}>
          <Image
            source={require('../../assets/Navegador.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          {!isSidebarCollapsed && <Text style={[styles.brandText, { color: theme.text }]}>UniControl</Text>}
        </View>

        {/* Profile summary */}
        <View style={[
          styles.profileContainer,
          isSidebarCollapsed && { justifyContent: 'center', paddingHorizontal: 0 }
        ]}>
          <View style={[styles.avatar, { backgroundColor: theme.accent + '20' }]}>
            <Text style={[styles.avatarText, { color: theme.accent }]}>
              {user?.username ? user.username.substring(0, 2).toUpperCase() : 'U'}
            </Text>
          </View>
          {!isSidebarCollapsed && (
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
                {firstName}
              </Text>
              {lastName ? (
                <Text style={[styles.profileName, { color: theme.text, marginTop: 1 }]} numberOfLines={1}>
                  {lastName}
                </Text>
              ) : null}
              <Text style={[styles.profileRole, { color: theme.textSecondary, textTransform: 'capitalize', marginTop: 2 }]}>
                {user?.role === 'admin' ? 'Administrador' : (user?.role === 'client' ? 'Cliente' : (user?.role || 'Usuario'))}
              </Text>
            </View>
          )}
        </View>

        {/* Navigation List */}
        <ScrollView
          contentContainerStyle={styles.navList}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {navItems.map((item, index) => {
            if (!item.visible) return null;
            const isActive = activeRoute === item.route || (item.route === 'ShopMenu' && ['POS', 'Inventory', 'SalesHistory'].includes(activeRoute));
            const isItemHovered = hoveredItem === index;
            return (
              <Button
                key={index}
                onPress={() => handleNavigate(item.route)}
                onMouseEnter={() => setHoveredItem(index)}
                onMouseLeave={() => setHoveredItem(null)}
                variant="secondary"
                backgroundColor={isActive ? theme.accent + '15' : 'transparent'}
                hoverBackgroundColor={isActive ? theme.accent + '20' : (isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)')}
                hoverBorderColor={isActive ? theme.accent : 'transparent'}
                style={[
                  styles.navItem,
                  isActive ? { borderColor: theme.accent } : { borderColor: 'transparent' },
                  isSidebarCollapsed ? { justifyContent: 'center', paddingHorizontal: 0, borderLeftWidth: 0 } : { justifyContent: 'flex-start' },
                  { borderWidth: 0, borderLeftWidth: isSidebarCollapsed ? 0 : 3, height: 42 }
                ]}
                icon={
                  <Ionicons
                    name={isActive ? item.icon : `${item.icon}-outline`}
                    size={20}
                    color={isActive ? theme.accent : theme.textSecondary}
                  />
                }
              >
                {!isSidebarCollapsed && (
                  <Text
                    style={[
                      styles.navItemText,
                      { color: isActive ? theme.text : theme.textSecondary },
                      isActive && { fontWeight: '700' }
                    ]}
                  >
                    {item.label}
                  </Text>
                )}
                {!isSidebarCollapsed && item.route === 'Settings' && queueCount > 0 && (
                  <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                    <Text style={styles.badgeText}>{queueCount}</Text>
                  </View>
                )}
                {isSidebarCollapsed && item.route === 'Settings' && queueCount > 0 && (
                  <View style={[styles.miniBadge, { backgroundColor: theme.danger }]} />
                )}

                {/* Tooltip al hacer hover en sidebar colapsado */}
                {isSidebarCollapsed && isItemHovered && Platform.OS === 'web' && (
                  <View
                    style={[
                      styles.tooltip,
                      isDarkMode
                        ? { backgroundColor: '#2D2D2D' }
                        : { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' }
                    ]}
                    pointerEvents="none"
                  >
                    <Text style={[styles.tooltipText, { color: isDarkMode ? '#FFFFFF' : '#1A1A24' }]}>
                      {item.label}
                    </Text>
                  </View>
                )}
              </Button>
            );
          })}
        </ScrollView>

        {/* Sidebar Footer */}
        <View style={[
          styles.sidebarFooter,
          { borderTopColor: theme.border },
          isSidebarCollapsed && { alignItems: 'center' }
        ]}>
          {/* Settings */}
          <Button
            onPress={() => handleNavigate('Settings')}
            onMouseEnter={() => setHoveredItem('settings')}
            onMouseLeave={() => setHoveredItem(null)}
            variant="secondary"
            backgroundColor={activeRoute === 'Settings' ? theme.accent + '15' : "transparent"}
            hoverBackgroundColor={activeRoute === 'Settings' ? theme.accent + '20' : (isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)')}
            style={[
              styles.footerBtn,
              { borderWidth: 0, height: 42, marginBottom: 4 },
              activeRoute === 'Settings' ? { borderColor: theme.accent } : { borderColor: 'transparent' },
              isSidebarCollapsed ? { justifyContent: 'center', paddingHorizontal: 0, width: '100%', borderLeftWidth: 0 } : { justifyContent: 'flex-start' }
            ]}
            icon={<Ionicons name={activeRoute === 'Settings' ? 'settings' : 'settings-outline'} size={20} color={activeRoute === 'Settings' ? theme.accent : theme.textSecondary} />}
          >
            {!isSidebarCollapsed && (
              <Text style={[
                styles.footerBtnText,
                { color: activeRoute === 'Settings' ? theme.text : theme.textSecondary },
                activeRoute === 'Settings' && { fontWeight: '700' }
              ]}>
                Configuración
              </Text>
            )}
            {!isSidebarCollapsed && queueCount > 0 && (
              <View style={[styles.badge, { backgroundColor: theme.danger, marginLeft: 'auto' }]}>
                <Text style={styles.badgeText}>{queueCount}</Text>
              </View>
            )}
            {isSidebarCollapsed && queueCount > 0 && (
              <View style={[styles.miniBadge, { backgroundColor: theme.danger, top: 4, right: 4 }]} />
            )}
            {isSidebarCollapsed && hoveredItem === 'settings' && Platform.OS === 'web' && (
              <View
                style={[
                  styles.tooltip,
                  isDarkMode
                    ? { backgroundColor: '#2D2D2D' }
                    : { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' }
                ]}
                pointerEvents="none"
              >
                <Text style={[styles.tooltipText, { color: isDarkMode ? '#FFFFFF' : '#1A1A24' }]}>Configuración</Text>
              </View>
            )}
          </Button>

          <Button
            onPress={logout}
            onMouseEnter={() => setHoveredItem('logout')}
            onMouseLeave={() => setHoveredItem(null)}
            variant="danger"
            backgroundColor="transparent"
            hoverBackgroundColor={theme.danger + '10'}
            style={[
              styles.footerBtn,
              { marginTop: 8, borderWidth: 0, height: 38 },
              isSidebarCollapsed ? { justifyContent: 'center', paddingHorizontal: 0, width: '100%' } : { justifyContent: 'flex-start' }
            ]}
            icon={<Ionicons name="log-out-outline" size={20} color={theme.danger} />}
          >
            {!isSidebarCollapsed && (
              <Text style={[styles.footerBtnText, { color: theme.danger }]}>
                Cerrar Sesión
              </Text>
            )}
            {isSidebarCollapsed && hoveredItem === 'logout' && Platform.OS === 'web' && (
              <View
                style={[
                  styles.tooltip,
                  isDarkMode
                    ? { backgroundColor: '#2D2D2D' }
                    : { backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FECACA' }
                ]}
                pointerEvents="none"
              >
                <Text style={[styles.tooltipText, { color: theme.danger }]}>Cerrar Sesión</Text>
              </View>
            )}
          </Button>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.mainLayout, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.layoutWrapper}>
        {/* SIDEBAR PERSISTENTE (WEB / TABLET) */}
        {!isMobile && (
          <View style={[
            styles.desktopSidebar,
            { borderRightColor: theme.border },
            isSidebarCollapsed ? { width: 70 } : { width: 230 }
          ]}>
            {renderSidebarContent()}
          </View>
        )}

        {/* CONTENEDOR DE CONTENIDO PRINCIPAL */}
        <View style={styles.contentContainer}>
          {/* HEADER PRINCIPAL */}
          <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border, paddingHorizontal: isMobile ? 10 : 16 }]}>
            <View style={styles.headerLeft}>
              {onBackPress ? (
                <Button
                  onPress={onBackPress}
                  variant="secondary"
                  backgroundColor="transparent"
                  style={[styles.menuButton, { borderWidth: 0, paddingHorizontal: 0 }]}
                  icon={<Ionicons name="chevron-back" size={24} color={theme.text} />}
                />
              ) : (
                <Button
                  onPress={isMobile ? () => setIsDrawerOpen(true) : toggleSidebar}
                  variant="secondary"
                  backgroundColor="transparent"
                  style={[styles.menuButton, { borderWidth: 0, paddingHorizontal: 0 }]}
                  icon={
                    isMobile || isSidebarCollapsed ? (
                      <Ionicons name="menu-outline" size={24} color={theme.text} />
                    ) : (
                      <AntDesign name="menu-fold" size={20} color={theme.text} />
                    )
                  }
                />
              )}
              <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                {title || 'UniControl'}
              </Text>
            </View>

            <View style={[styles.headerRight, { gap: 10 }]}>
              {headerRight}
              {/* Indicador de Estado Offline */}
              {queueCount > 0 ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('Settings')}
                  style={[styles.syncStatusPill, { backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.15)' : 'rgba(251, 191, 36, 0.2)' }]}
                >
                  <Ionicons name="cloud-offline-outline" size={16} color="#F59E0B" />
                  {!isMobile && (
                    <Text style={[styles.syncStatusText, { color: '#F59E0B' }]}>
                      {queueCount} cambio{queueCount > 1 ? 's' : ''} pendiente{queueCount > 1 ? 's' : ''}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : !isOnline ? (
                <View style={[styles.syncStatusPill, { backgroundColor: isDarkMode ? 'rgba(156, 163, 175, 0.15)' : 'rgba(243, 244, 246, 1)' }]}>
                  <Ionicons name="wifi-outline" size={16} color={theme.textSecondary} />
                  {!isMobile && <Text style={[styles.syncStatusText, { color: theme.textSecondary }]}>Sin conexión</Text>}
                </View>
              ) : (
                <View style={[styles.syncStatusPill, { backgroundColor: isDarkMode ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.15)' }]}>
                  <Ionicons name="cloud-done-outline" size={16} color="#10B981" />
                  {!isMobile && <Text style={[styles.syncStatusText, { color: '#10B981' }]}>Sincronizado</Text>}
                </View>
              )}
            </View>
          </View>

          {/* CUERPO DE LA PANTALLA */}
          <View style={styles.pageBody}>
            {children}
          </View>

          {/* BANNER DE PUBLICIDAD PARA USUARIOS GRATUITOS */}
          {(!user?.plan || user?.plan === 'free') && (
            <View style={{ 
              width: '100%', 
              backgroundColor: isDarkMode ? '#1e1e1e' : '#f5f5f5', 
              borderTopWidth: 1, 
              borderTopColor: theme.border, 
              paddingVertical: 24, 
              paddingHorizontal: 15,
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: theme.text, letterSpacing: 0.5, marginBottom: 4 }}>Espacio Publicitario</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary }}>Actualiza a una Suscripción Premium para eliminar anuncios</Text>
            </View>
          )}
        </View>

        {/* DRAWER PARA MÓVIL (MENÚ COLAPSIBLE) */}
        {isMobile && isDrawerOpen && (
          <View style={styles.drawerOverlay}>
            {/* Backdrop clickeable */}
            <Pressable style={styles.backdrop} onPress={() => setIsDrawerOpen(false)} />

            {/* Drawer Content Container */}
            <View style={[styles.drawerContent, { shadowColor: '#000' }]}>
              {renderSidebarContent()}
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainLayout: {
    flex: 1,
  },
  layoutWrapper: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  desktopSidebar: {
    width: 230,
    height: '100%',
    borderRightWidth: 1,
    zIndex: 200,
    ...Platform.select({ web: { overflow: 'visible' } }),
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'column',
    height: '100%',
    zIndex: 1,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    zIndex: 10,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' }
    })
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  syncStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pageBody: {
    flex: 1,
  },
  // Sidebar styling
  sidebarContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  brandLogo: {
    width: 40,
    height: 40,
  },
  brandText: {
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontWeight: 'bold',
    fontSize: 15,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 14,
    fontWeight: '700',
  },
  profileRole: {
    fontSize: 11,
    marginTop: 1,
  },
  navList: {
    paddingHorizontal: 12,
    gap: 4,
    paddingBottom: 20,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderColor: 'transparent',
    gap: 12,
    position: 'relative',
    ...Platform.select({
      web: { cursor: 'pointer', overflow: 'visible' }
    })
  },
  navItemText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  miniBadge: {
    position: 'absolute',
    top: 6,
    right: 20,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tooltip: {
    position: 'absolute',
    left: '100%',
    top: '50%',
    transform: [{ translateY: -14 }],
    marginLeft: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
    whiteSpace: 'nowrap',
  },
  tooltipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  sidebarFooter: {
    padding: 16,
    borderTopWidth: 1,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 12,
    position: 'relative',
    ...Platform.select({
      web: { cursor: 'pointer', overflow: 'visible' }
    })
  },
  footerBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Mobile drawer styling
  drawerOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawerContent: {
    width: 230,
    height: '100%',
    position: 'relative',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 16,
  }
});
