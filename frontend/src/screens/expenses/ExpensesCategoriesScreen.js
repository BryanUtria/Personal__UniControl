import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/Button';
import Input from '../../components/Input';
import SidebarLayout from '../../navigation/SidebarLayout';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const ICONS = [
  'wallet-outline', 'home-outline', 'car-outline', 'cart-outline', 'bulb-outline',
  'fast-food-outline', 'medkit-outline', 'school-outline', 'airplane-outline',
  'business-outline', 'cafe-outline', 'fitness-outline', 'gift-outline', 'book-outline',
  'game-controller-outline', 'paw-outline', 'shirt-outline', 'subway-outline', 'water-outline', 'construct-outline', 'flame-outline'
];
const COLORS = [
  // Rojos y Rosados
  '#f44336', '#f43f5e', '#e91e63', '#ec4899',
  // Naranjas y Amarillos
  '#f97316', '#ff9800', '#fbbf24',
  // Verdes y Turquesas
  '#84cc16', '#4caf50', '#10b981', '#14b8a6',
  // Azules y Celestes
  '#00bcd4', '#2196f3', '#3b82f6',
  // Morados e Índigos
  '#6366f1', '#8b5cf6', '#9c27b0',
  // Marrones y Grises
  '#795548', '#a8a29e', '#607d8b'
];

export default function ExpensesCategoriesScreen({ navigation }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [categories, setCategories] = useState([]);
  const [editCatId, setEditCatId] = useState(null);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState(ICONS[0]);
  const [catColor, setCatColor] = useState(COLORS[0]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API_URL}/expenses/categories`, {
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (e) {
      console.error(e);
      showToast('Error al cargar categorías', 'error');
    }
  };

  const handleSaveCategory = async () => {
    if (!catName) {
      showToast('El nombre de la categoría es obligatorio', 'error');
      return;
    }
    try {
      const url = editCatId ? `${API_URL}/expenses/categories/${editCatId}` : `${API_URL}/expenses/categories`;
      const method = editCatId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ name: catName, icon: catIcon, color: catColor })
      });
      if (response.ok) {
        showToast(editCatId ? 'Categoría actualizada' : 'Categoría creada', 'success');
        setEditCatId(null);
        setCatName('');
        setCatIcon(ICONS[0]);
        setCatColor(COLORS[0]);
        fetchCategories();
      } else {
        const errorData = await response.json();
        showToast(errorData.error || 'Error al guardar categoría', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    }
  };

  const openEditCategory = (cat) => {
    setEditCatId(cat.id);
    setCatName(cat.name);
    setCatIcon(cat.icon);
    setCatColor(cat.color);
  };

  const handleDeleteCategory = async (id) => {
    try {
      const response = await fetch(`${API_URL}/expenses/categories/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        showToast('Categoría eliminada', 'success');
        fetchCategories();
      } else {
        const errorData = await response.json();
        showToast(errorData.error || 'Error al eliminar', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    }
  };

  return (
    <SidebarLayout navigation={navigation} activeRoute="Expenses">
      <ScrollView contentContainerStyle={{ paddingHorizontal: isMobile ? 10 : 20, paddingTop: 10 }} showsVerticalScrollIndicator={false}>
        {/* Header with Back Button */}
        <View style={[styles.header]}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>Mis Categorías</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Category Form */}
        <View style={[styles.formContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{editCatId ? "Editar Categoría" : "Nueva Categoría"}</Text>
          <Input
            value={catName}
            onChangeText={setCatName}
            placeholder="Nombre de categoría"
          />

          <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 8, marginTop: 10 }}>Color</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20, justifyContent: 'center' }}>
            {COLORS.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => setCatColor(c)}
                style={[styles.colorDot, { backgroundColor: c, borderWidth: catColor === c ? 2 : 0, borderColor: theme.text }]}
              />
            ))}
          </View>

          <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 8 }}>Ícono</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20, justifyContent: 'center' }}>
            {ICONS.map(i => (
              <TouchableOpacity
                key={i}
                onPress={() => setCatIcon(i)}
                style={{ padding: 10, borderRadius: 12, backgroundColor: catIcon === i ? theme.accent + '20' : theme.background }}
              >
                <Ionicons name={i} size={28} color={catIcon === i ? theme.accent : theme.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {editCatId && (
              <Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => { setEditCatId(null); setCatName(''); }} />
            )}
            <Button title={editCatId ? "Guardar" : "Añadir Categoría"} variant="primary" style={{ flex: 1 }} onPress={handleSaveCategory} />
          </View>
        </View>

        {/* Existing Categories */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 0, marginBottom: 15 }]}>Categorías Existentes</Text>
        <View style={[styles.listContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {categories.map((cat, index) => (
            <View key={cat.id} style={[styles.categoryItem, { borderBottomColor: index === categories.length - 1 ? 'transparent' : theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.iconWrapper, { backgroundColor: cat.color + '20' }]}>
                  <Ionicons name={cat.icon} size={22} color={cat.color} />
                </View>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '500' }}>{cat.name}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 15 }}>
                <TouchableOpacity onPress={() => openEditCategory(cat)} style={{ padding: 5 }}>
                  <Ionicons name="pencil" size={20} color={theme.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteCategory(cat.id)} style={{ padding: 5 }}>
                  <Ionicons name="trash" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {categories.length === 0 && (
            <Text style={{ color: theme.textSecondary, textAlign: 'center', padding: 20 }}>No has creado ninguna categoría.</Text>
          )}
        </View>
      </ScrollView>
    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  formContainer: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 15,
    elevation: 1
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  listContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 1,
    marginBottom: 100,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  }
});
