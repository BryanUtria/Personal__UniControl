import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import SidebarLayout from '../../navigation/SidebarLayout';

export default function ShopMenuScreen({ navigation }) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

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

  return (
    <SidebarLayout 
      navigation={navigation} 
      title="Tienda" 
      activeRoute="ShopMenu"
    >
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.background }]} 
        contentContainerStyle={[styles.scrollContent, { padding: isMobile ? 10 : 20 }]}
      >
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
      </ScrollView>
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
  }
});
