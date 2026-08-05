import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import SidebarLayout from '../../navigation/SidebarLayout';
import Button from '../../components/Button';
import { predefinedThemes, lightTheme } from '../../theme/colors';

const colorMatrix = [
  '#FFFFFF', '#F8FAFC', '#F1F5F9', '#E2E8F0', '#CBD5E1',
  '#000000', '#121212', '#1E1E1E', '#252525', '#333333',
  '#0F172A', '#1E293B', '#334155', '#475569', '#64748B',
  '#14532D', '#166534', '#15803D', '#16A34A', '#22C55E',
  '#7F1D1D', '#991B1B', '#B91C1C', '#DC2626', '#EF4444',
  '#2563EB', '#3B82F6', '#60A5FA', '#38BDF8', '#0EA5E9',
  '#00E676', '#FACC15', '#FDE047', '#F59E0B', '#D97706',
  '#F43F5E', '#E11D48', '#BE123C', '#9D174D', '#831843'
];

export default function AppearanceScreen({ navigation }) {
  const { theme, themeConfig, updateThemeConfig } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [activePicker, setActivePicker] = useState(null); // 'background', 'card', 'text', 'accent'
  const [hexInput, setHexInput] = useState('');

  // The custom configuration we are currently editing (optimistic state before save)
  const [customColors, setCustomColors] = useState(
    themeConfig.mode === 'custom' && themeConfig.customColors
      ? themeConfig.customColors
      : {
        background: theme.background,
        card: theme.card,
        surface: theme.surface,
        text: theme.text,
        textSecondary: theme.textSecondary,
        textLight: theme.textLight,
        border: theme.border,
        accent: theme.accent,
      }
  );

  const applyPreset = (presetKey) => {
    updateThemeConfig({ mode: presetKey, customColors: null });
    const pt = predefinedThemes[presetKey];
    setCustomColors({
      background: pt.background,
      card: pt.card,
      surface: pt.surface,
      text: pt.text,
      textSecondary: pt.textSecondary,
      textLight: pt.textLight,
      border: pt.border,
      accent: pt.accent,
    });
  };

  const handleCustomColorChange = (key, color) => {
    const newCustom = { ...customColors, [key]: color };
    setCustomColors(newCustom);
    updateThemeConfig({ mode: 'custom', customColors: newCustom });
  };

  const openPicker = (key) => {
    setActivePicker(key);
    setHexInput(customColors[key] || '');
  };

  const closePicker = () => {
    setActivePicker(null);
    setHexInput('');
  };

  const submitHex = () => {
    if (/^#[0-9A-F]{6}$/i.test(hexInput) || /^#[0-9A-F]{3}$/i.test(hexInput)) {
      handleCustomColorChange(activePicker, hexInput);
      closePicker();
    } else {
      alert('Código HEX inválido');
    }
  };

  const ColorRow = ({ title, desc, colorKey }) => (
    <View style={[styles.colorRow, { borderBottomColor: theme.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.colorTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.colorDesc, { color: theme.textSecondary }]}>{desc}</Text>
      </View>
      <TouchableOpacity
        style={[styles.colorPreview, { backgroundColor: customColors[colorKey], borderColor: theme.border }]}
        onPress={() => openPicker(colorKey)}
      />
    </View>
  );

  return (
    <SidebarLayout activeRoute="Settings" navigation={navigation}>
      <ScrollView contentContainerStyle={[styles.container, { paddingHorizontal: 10 }]}>
        <View style={[styles.header]}>
          <Button
            onPress={() => navigation.goBack()}
            variant="secondary"
            style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
            icon={<Ionicons name="chevron-back" size={22} color={theme.text} />}
          />
          <Text style={[styles.title, { color: theme.text }]}>Apariencia y Temas</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* PALETAS PREDEFINIDAS */}
        <View style={[styles.section, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Paletas Predefinidas</Text>
          <Text style={[styles.sectionDesc, { color: theme.textSecondary }]}>Selecciona un tema rápido diseñado por profesionales.</Text>

          <View style={styles.presetsGrid}>
            {Object.keys(predefinedThemes).map((key) => {
              const pt = predefinedThemes[key];
              const isActive = themeConfig.mode === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.presetCard,
                    { backgroundColor: pt.card, borderColor: isActive ? pt.accent : pt.border }
                  ]}
                  onPress={() => applyPreset(key)}
                >
                  <View style={[styles.presetBg, { backgroundColor: pt.background }]}>
                    <View style={[styles.presetDot, { backgroundColor: pt.accent }]} />
                    <View style={[styles.presetDot, { backgroundColor: pt.text }]} />
                  </View>
                  <Text style={[styles.presetName, { color: pt.text }]}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </Text>
                  {isActive && (
                    <View style={[styles.activeBadge, { backgroundColor: pt.accent }]}>
                      <Ionicons name="checkmark" size={12} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* MODO AVANZADO */}
        <View style={[styles.section, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Modo Avanzado</Text>
          <Text style={[styles.sectionDesc, { color: theme.textSecondary }]}>Personaliza cada elemento a tu gusto. (Seleccionar un color cambiará tu tema a Modo Personalizado).</Text>

          <ColorRow title="Fondo de la App" desc="El color que está detrás de todos los paneles." colorKey="background" />
          <ColorRow title="Paneles y Tarjetas" desc="El fondo del menú lateral, navbar y tarjetas." colorKey="card" />
          <ColorRow title="Superficies" desc="Entradas de texto y modales." colorKey="surface" />
          <ColorRow title="Texto Principal" desc="Color para los títulos y textos legibles." colorKey="text" />
          <ColorRow title="Texto Secundario" desc="Textos descriptivos y subtítulos." colorKey="textSecondary" />
          <ColorRow title="Texto Atenuado" desc="Textos menos importantes y placeholders." colorKey="textLight" />
          <ColorRow title="Bordes y Divisores" desc="Color de las líneas separadoras y bordes." colorKey="border" />
          <ColorRow title="Color de Acento" desc="Botones principales, íconos activos." colorKey="accent" />

        </View>
      </ScrollView>

      {/* COLOR PICKER MODAL */}
      <Modal visible={activePicker !== null} transparent animationType="fade" onRequestClose={closePicker}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closePicker}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContent, { backgroundColor: theme.card, shadowColor: theme.shadow, width: isMobile ? '90%' : 400 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Seleccionar Color</Text>
              <TouchableOpacity onPress={closePicker}><Ionicons name="close" size={24} color={theme.textSecondary} /></TouchableOpacity>
            </View>

            {/* Matrix */}
            <View style={styles.matrixContainer}>
              {colorMatrix.map((hex, idx) => {
                const isSelected = hexInput.toUpperCase() === hex.toUpperCase();
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.matrixSwatch,
                      { backgroundColor: hex, borderColor: isSelected ? theme.accent : theme.border },
                      isSelected && { borderWidth: 3 }
                    ]}
                    onPress={() => {
                      handleCustomColorChange(activePicker, hex);
                      closePicker();
                    }}
                  />
                );
              })}
            </View>

            <View style={[styles.hexInputContainer, { borderTopColor: theme.border }]}>
              <Text style={{ color: theme.textSecondary, marginBottom: 5 }}>O ingresa un código HEX:</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, flex: 1 }]}
                  value={hexInput}
                  onChangeText={setHexInput}
                  placeholder="#FFFFFF"
                  placeholderTextColor={theme.textLight}
                />
                <Button title="Aplicar" variant="primary" onPress={submitHex} />
              </View>
            </View>

          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  backCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  section: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  sectionDesc: {
    fontSize: 13,
    marginBottom: 15,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 15,
    paddingTop: 5,
  },
  presetCard: {
    width: 110,
    height: 90,
    borderRadius: 12,
    borderWidth: 2,
    padding: 8,
    justifyContent: 'space-between',
    position: 'relative',
  },
  presetBg: {
    flex: 1,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  presetDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  presetName: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  activeBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  colorTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  colorDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  colorPreview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    marginLeft: 15,
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
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  matrixContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 20,
  },
  matrixSwatch: {
    width: 35,
    height: 35,
    borderRadius: 8,
    borderWidth: 1,
  },
  hexInputContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    paddingTop: 15,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  }
});
