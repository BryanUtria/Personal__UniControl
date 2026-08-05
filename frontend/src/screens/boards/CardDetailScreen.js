import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, useWindowDimensions, TextInput, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import SidebarLayout from '../../navigation/SidebarLayout';
import Button from '../../components/Button';
import Input from '../../components/Input';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function CardDetailScreen({ navigation, route }) {
  const { cardId, boardId } = route.params || {};
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [card, setCard] = useState(null);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estados de edición
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [selectedColumnId, setSelectedColumnId] = useState('');

  // Elementos de tarjeta
  const [checklistTitle, setChecklistTitle] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');

  // Confirmación
  const [confirmModal, setConfirmModal] = useState({ visible: false, title: '', message: '', onConfirm: null });

  const loadCard = async () => {
    try {
      const [cardRes, boardRes] = await Promise.all([
        fetch(`${API_URL}/boards/cards/${cardId}`, { headers: { 'x-user-id': user.id.toString() } }),
        fetch(`${API_URL}/boards/${boardId}`, { headers: { 'x-user-id': user.id.toString() } })
      ]);
      if (cardRes.ok) {
        const cardData = await cardRes.json();
        setCard(cardData);
        setEditTitle(cardData.title || '');
        setEditDesc(cardData.description || '');
        setEditStartDate(cardData.start_date || '');
        setEditDueDate(cardData.due_date || '');
        setSelectedColumnId(cardData.column_id || '');
      }
      if (boardRes.ok) {
        setBoard(await boardRes.json());
      }
    } catch (e) {
      console.error('Error cargando tarjeta:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCard();
  }, [cardId]);

  const handleSaveCard = async () => {
    if (!editTitle.trim()) {
      showToast('El título es obligatorio', 'warning');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/boards/cards/${cardId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc || null,
          start_date: editStartDate || null,
          due_date: editDueDate || null,
          column_id: selectedColumnId || undefined
        })
      });
      if (response.ok) {
        showToast('Tarjeta actualizada', 'success');
        loadCard();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al actualizar tarjeta', 'danger');
      }
    } catch (e) {
      showToast('Error de red', 'danger');
    } finally {
      setSaving(false);
    }
  };

  // --- Etiquetas ---
  const toggleLabel = async (labelId) => {
    const hasLabel = card.labels.some(l => l.id === labelId);
    try {
      const method = hasLabel ? 'DELETE' : 'POST';
      const url = hasLabel
        ? `${API_URL}/boards/cards/${cardId}/labels/${labelId}`
        : `${API_URL}/boards/cards/${cardId}/labels`;
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: hasLabel ? undefined : JSON.stringify({ label_id: labelId })
      });
      if (response.ok) {
        loadCard();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al actualizar etiqueta', 'danger');
      }
    } catch (e) {
      showToast('Error de red', 'danger');
    }
  };

  // --- Miembros ---
  const toggleMember = async (memberId) => {
    const hasMember = card.members.some(m => m.id === memberId);
    try {
      const method = hasMember ? 'DELETE' : 'POST';
      const url = hasMember
        ? `${API_URL}/boards/cards/${cardId}/members/${memberId}`
        : `${API_URL}/boards/cards/${cardId}/members`;
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: hasMember ? undefined : JSON.stringify({ user_id: memberId })
      });
      if (response.ok) {
        loadCard();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al actualizar miembro', 'danger');
      }
    } catch (e) {
      showToast('Error de red', 'danger');
    }
  };

  // --- Checklists ---
  const addChecklist = async () => {
    if (!checklistTitle.trim()) return;
    try {
      const response = await fetch(`${API_URL}/boards/cards/${cardId}/checklists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ title: checklistTitle.trim() })
      });
      if (response.ok) {
        setChecklistTitle('');
        loadCard();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al crear checklist', 'danger');
      }
    } catch (e) {
      showToast('Error de red', 'danger');
    }
  };

  const addChecklistItem = async (checklistId) => {
    if (!newChecklistItem.trim()) return;
    try {
      const response = await fetch(`${API_URL}/boards/checklists/${checklistId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ text: newChecklistItem.trim() })
      });
      if (response.ok) {
        setNewChecklistItem('');
        loadCard();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al agregar ítem', 'danger');
      }
    } catch (e) {
      showToast('Error de red', 'danger');
    }
  };

  const toggleChecklistItem = async (item) => {
    try {
      const response = await fetch(`${API_URL}/boards/checklist-items/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ checked: !item.checked })
      });
      if (response.ok) {
        loadCard();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al actualizar ítem', 'danger');
      }
    } catch (e) {
      showToast('Error de red', 'danger');
    }
  };

  const deleteChecklistItem = (item) => {
    setConfirmModal({
      visible: true,
      title: 'Eliminar Ítem',
      message: `¿Eliminar "${item.text}"?`,
      onConfirm: async () => {
        try {
          const response = await fetch(`${API_URL}/boards/checklist-items/${item.id}`, {
            method: 'DELETE',
            headers: { 'x-user-id': user.id.toString() }
          });
          if (response.ok) {
            showToast('Ítem eliminado', 'success');
            loadCard();
          } else {
            const err = await response.json();
            showToast(err.error || 'Error al eliminar ítem', 'danger');
          }
        } catch (e) {
          showToast('Error de red', 'danger');
        }
      }
    });
  };

  const deleteChecklist = (checklist) => {
    setConfirmModal({
      visible: true,
      title: 'Eliminar Checklist',
      message: `¿Eliminar el checklist "${checklist.title}"?`,
      onConfirm: async () => {
        try {
          const response = await fetch(`${API_URL}/boards/checklists/${checklist.id}`, {
            method: 'DELETE',
            headers: { 'x-user-id': user.id.toString() }
          });
          if (response.ok) {
            showToast('Checklist eliminado', 'success');
            loadCard();
          } else {
            const err = await response.json();
            showToast(err.error || 'Error al eliminar checklist', 'danger');
          }
        } catch (e) {
          showToast('Error de red', 'danger');
        }
      }
    });
  };

  const handleDeleteCard = () => {
    setConfirmModal({
      visible: true,
      title: 'Eliminar Tarjeta',
      message: `¿Eliminar la tarjeta "${card.title}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          const response = await fetch(`${API_URL}/boards/cards/${cardId}`, {
            method: 'DELETE',
            headers: { 'x-user-id': user.id.toString() }
          });
          if (response.ok) {
            showToast('Tarjeta eliminada', 'success');
            navigation.goBack();
          } else {
            const err = await response.json();
            showToast(err.error || 'Error al eliminar tarjeta', 'danger');
          }
        } catch (e) {
          showToast('Error de red', 'danger');
        }
      }
    });
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  };

  if (loading) {
    return (
      <SidebarLayout navigation={navigation} title="Proyectos y Tableros" activeRoute="Boards">
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={{ color: theme.textSecondary, marginTop: 12 }}>Cargando tarjeta...</Text>
        </View>
      </SidebarLayout>
    );
  }

  if (!card) {
    return (
      <SidebarLayout navigation={navigation} title="Proyectos y Tableros" activeRoute="Boards">
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.danger} />
          <Text style={{ color: theme.text, marginTop: 12, fontWeight: '600' }}>No se encontró la tarjeta</Text>
          <Button title="Volver" variant="secondary" style={{ marginTop: 20 }} onPress={() => navigation.goBack()} />
        </View>
      </SidebarLayout>
    );
  }

  const totalItems = card.checklists.reduce((acc, cl) => acc + cl.items.length, 0);
  const checkedItems = card.checklists.reduce((acc, cl) => acc + cl.items.filter(i => i.checked).length, 0);

  return (
    <SidebarLayout navigation={navigation} title="Proyectos y Tableros" activeRoute="Boards">
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={[styles.content, { paddingHorizontal: 10, paddingBottom: isMobile ? 10 : 20 }]}>
        {/* Encabezado de la página: botón volver + título */}
        <View style={[styles.pageHeader, { paddingHorizontal: 0, marginBottom: 6 }]}>
          <Button
            onPress={() => navigation.goBack()}
            variant="secondary"
            style={[styles.backCircleBtn, { shadowColor: theme.shadow, marginRight: 10, borderWidth: 0 }]}
            icon={<Ionicons name="chevron-back" size={22} color={theme.text} />}
          />
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {card.title}
          </Text>
        </View>
        {/* Sección Título / Descripción */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.accent + '15' }]}>
              <Ionicons name="document-text-outline" size={18} color={theme.accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Título y Descripción</Text>
          </View>

          <Input
            label="Título"
            icon="document-text-outline"
            value={editTitle}
            onChangeText={setEditTitle}
          />
          <Input
            label="Descripción"
            icon="reader-outline"
            placeholder="Añade más detalle a esta tarjeta..."
            value={editDesc}
            onChangeText={setEditDesc}
            multiline
            numberOfLines={4}
          />
          <Button
            title="Guardar Cambios"
            variant="primary"
            onPress={handleSaveCard}
            loading={saving}
            icon={<Ionicons name="save-outline" size={18} color="#FFF" />}
          />
        </View>

        {/* Sección Fechas y Columna */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#F59E0B15' }]}>
              <Ionicons name="calendar-outline" size={18} color="#F59E0B" />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Fechas y Movimiento</Text>
          </View>

          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Fecha inicio</Text>
              <TextInput
                style={[styles.dateInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={theme.textSecondary}
                value={editStartDate}
                onChangeText={setEditStartDate}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Fecha vencimiento</Text>
              <TextInput
                style={[styles.dateInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={theme.textSecondary}
                value={editDueDate}
                onChangeText={setEditDueDate}
              />
            </View>
          </View>

          {/* Mover de columna */}
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Mover a columna</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={styles.columnsRow}>
              {(board?.columns || []).map(col => (
                <TouchableOpacity
                  key={col.id}
                  onPress={() => setSelectedColumnId(col.id)}
                  style={[
                    styles.columnPick,
                    {
                      backgroundColor: selectedColumnId === col.id ? theme.accent + '20' : theme.background,
                      borderColor: selectedColumnId === col.id ? theme.accent : theme.border
                    }
                  ]}
                >
                  <Text style={{ color: selectedColumnId === col.id ? theme.accent : theme.textSecondary, fontSize: 11, fontWeight: '600' }}>
                    {col.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Button
            title="Guardar Cambios"
            variant="primary"
            onPress={handleSaveCard}
            loading={saving}
            icon={<Ionicons name="save-outline" size={18} color="#FFF" />}
          />
        </View>

        {/* Sección Etiquetas */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#8B5CF615' }]}>
              <Ionicons name="pricetags-outline" size={18} color="#8B5CF6" />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Etiquetas</Text>
          </View>

          {board?.labels?.length > 0 ? (
            <View style={styles.chipsWrap}>
              {board.labels.map(label => {
                const hasLabel = card.labels.some(l => l.id === label.id);
                return (
                  <TouchableOpacity
                    key={label.id}
                    onPress={() => toggleLabel(label.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: hasLabel ? label.color : theme.background,
                        borderColor: hasLabel ? label.color : theme.border
                      }
                    ]}
                  >
                    <Text style={{ color: hasLabel ? '#FFF' : theme.textSecondary, fontSize: 11, fontWeight: '600' }}>
                      {label.name}
                    </Text>
                    {hasLabel && <Ionicons name="checkmark-circle" size={14} color="#FFF" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              No hay etiquetas en este tablero. Créalas desde el tablero.
            </Text>
          )}
        </View>

        {/* Sección Miembros */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#3B82F615' }]}>
              <Ionicons name="people-outline" size={18} color="#3B82F6" />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Miembros asignados</Text>
          </View>

          <View style={styles.chipsWrap}>
            {(board?.members || []).map(member => {
              const hasMember = card.members.some(m => m.id === member.id);
              return (
                <TouchableOpacity
                  key={member.id}
                  onPress={() => toggleMember(member.id)}
                  style={[
                    styles.memberChip,
                    { backgroundColor: hasMember ? theme.accent + '25' : theme.background, borderColor: hasMember ? theme.accent : theme.border }
                  ]}
                >
                  <View style={[styles.memberAvatar, { backgroundColor: hasMember ? theme.accent : theme.textSecondary }]}>
                    <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '700' }}>{getInitials(member.name || member.username)}</Text>
                  </View>
                  <Text style={{ color: hasMember ? theme.accent : theme.textSecondary, fontSize: 11, fontWeight: '600' }}>
                    {member.name || member.username}
                  </Text>
                  {hasMember && <Ionicons name="checkmark-circle" size={14} color={theme.accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Sección Checklists */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#10B98115' }]}>
              <Ionicons name="checkbox-outline" size={18} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Checklists</Text>
              {totalItems > 0 && (
                <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>
                  {checkedItems}/{totalItems} completados ({totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0}%)
                </Text>
              )}
            </View>
          </View>

          {/* Barra de progreso */}
          {totalItems > 0 && (
            <View style={[styles.progressTrack, { backgroundColor: theme.background }]}>
              <View style={[styles.progressFill, { width: `${(checkedItems / totalItems) * 100}%`, backgroundColor: '#10B981' }]} />
            </View>
          )}

          {/* Checklists existentes */}
          <View style={{ gap: 12 }}>
            {card.checklists.map(checklist => (
              <View key={checklist.id} style={[styles.checklistBlock, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <View style={styles.checklistHeader}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{checklist.title}</Text>
                  <TouchableOpacity onPress={() => deleteChecklist(checklist)} style={{ padding: 3 }}>
                    <Ionicons name="trash-outline" size={15} color={theme.danger} />
                  </TouchableOpacity>
                </View>

                <View style={{ gap: 6 }}>
                  {checklist.items.map(item => (
                    <View key={item.id} style={styles.checklistItemRow}>
                      <TouchableOpacity onPress={() => toggleChecklistItem(item)} style={styles.checkboxTouch}>
                        <Ionicons
                          name={item.checked ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={item.checked ? '#10B981' : theme.textSecondary}
                        />
                      </TouchableOpacity>
                      <Text
                        style={[
                          { color: item.checked ? theme.textSecondary : theme.text, fontSize: 13, flex: 1 },
                          item.checked && { textDecorationLine: 'line-through' }
                        ]}
                      >
                        {item.text}
                      </Text>
                      <TouchableOpacity onPress={() => deleteChecklistItem(item)} style={{ padding: 3 }}>
                        <Ionicons name="close-circle-outline" size={16} color={theme.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>

                {/* Agregar ítem */}
                <View style={styles.addItemRow}>
                  <TextInput
                    style={[styles.itemInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                    placeholder="Añadir ítem..."
                    placeholderTextColor={theme.textSecondary}
                    value={newChecklistItem}
                    onChangeText={setNewChecklistItem}
                    onSubmitEditing={() => addChecklistItem(checklist.id)}
                  />
                  <Button
                    title="Añadir"
                    variant="primary"
                    style={{ paddingHorizontal: 12, height: 36 }}
                    onPress={() => addChecklistItem(checklist.id)}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* Crear nuevo checklist */}
          <View style={styles.addChecklistRow}>
            <TextInput
              style={[styles.itemInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              placeholder="Nombre del nuevo checklist..."
              placeholderTextColor={theme.textSecondary}
              value={checklistTitle}
              onChangeText={setChecklistTitle}
              onSubmitEditing={addChecklist}
            />
            <Button
              title="Crear Checklist"
              variant="secondary"
              style={{ paddingHorizontal: 12, height: 36 }}
              onPress={addChecklist}
              icon={<Ionicons name="add" size={16} color={theme.text} />}
            />
          </View>
        </View>

        {/* Sección Eliminar */}
        <View style={[styles.section, { backgroundColor: theme.danger + '08', borderColor: theme.danger + '30' }]}>
          <Button
            title="Eliminar Tarjeta"
            variant="danger"
            onPress={handleDeleteCard}
            icon={<Ionicons name="trash-outline" size={18} color={theme.danger} />}
          />
        </View>
      </ScrollView>

      {/* Modal Confirmación */}
      <Modal visible={confirmModal.visible} transparent animationType="fade" onRequestClose={() => setConfirmModal({ ...confirmModal, visible: false })}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, width: isMobile ? '92%' : 400 }]}>
            <View style={[styles.deleteIcon, { backgroundColor: theme.danger + '15' }]}>
              <Ionicons name="warning-outline" size={30} color={theme.danger} />
            </View>
            <Text style={[styles.modalTitle, { color: theme.text, textAlign: 'center' }]}>{confirmModal.title}</Text>
            <Text style={{ color: theme.textSecondary, textAlign: 'center', fontSize: 13, marginTop: 8, lineHeight: 19 }}>
              {confirmModal.message}
            </Text>
            <View style={styles.modalActions}>
              <Button
                title="Cancelar"
                variant="secondary"
                onPress={() => setConfirmModal({ ...confirmModal, visible: false })}
                style={{ flex: 1 }}
              />
              <Button
                title="Confirmar"
                variant="danger"
                onPress={() => {
                  setConfirmModal({ ...confirmModal, visible: false });
                  if (confirmModal.onConfirm) confirmModal.onConfirm();
                }}
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
  container: { flex: 1 },
  content: { paddingBottom: 40, gap: 10 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
  },
  title: { fontSize: 20, fontWeight: 'bold', flexShrink: 1 },
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
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },
  dateInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    fontSize: 13,
    marginBottom: 12,
  },
  columnsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  columnPick: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  memberAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    marginBottom: 14,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  checklistBlock: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB33',
  },
  checklistItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxTouch: {
    padding: 2,
  },
  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  addChecklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  itemInput: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 18,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  deleteIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
});