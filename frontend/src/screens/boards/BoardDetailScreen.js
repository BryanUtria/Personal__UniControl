import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Modal, useWindowDimensions, TextInput, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import SidebarLayout from '../../navigation/SidebarLayout';
import Button from '../../components/Button';
import Input from '../../components/Input';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const SUBBOARD_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6'];

export default function BoardDetailScreen({ navigation, route }) {
  const { boardId } = route.params || {};
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSubboard, setActiveSubboard] = useState(null); // null = nivel tablero

  // Modales
  const [colModalVisible, setColModalVisible] = useState(false);
  const [colName, setColName] = useState('');
  const [colSubId, setColSubId] = useState(null);

  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [cardColId, setCardColId] = useState(null);
  const [cardTitle, setCardTitle] = useState('');
  const [cardDesc, setCardDesc] = useState('');
  const [cardStartDate, setCardStartDate] = useState('');
  const [cardDueDate, setCardDueDate] = useState('');
  const [cardLabelIds, setCardLabelIds] = useState([]);
  const [cardMemberIds, setCardMemberIds] = useState([]);
  const [savingCard, setSavingCard] = useState(false);

  const [subModalVisible, setSubModalVisible] = useState(false);
  const [subName, setSubName] = useState('');
  const [subDesc, setSubDesc] = useState('');
  const [subColor, setSubColor] = useState(SUBBOARD_COLORS[0]);

  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [labelsModalVisible, setLabelsModalVisible] = useState(false);
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState('#EF4444');

  const [confirmModal, setConfirmModal] = useState({ visible: false, title: '', message: '', onConfirm: null, loading: false });

  const subColors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#6366F1'];

  const fetchBoard = async () => {
    try {
      const response = await fetch(`${API_URL}/boards/${boardId}`, {
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        const data = await response.json();
        setBoard(data);
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al cargar tablero', 'danger');
      }
    } catch (e) {
      console.error('Error cargando tablero:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBoard();
  }, [boardId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBoard();
  }, []);

  // --- Columnas visibles según el nivel actual ---
  const visibleColumns = board?.columns?.filter(col => {
    if (activeSubboard) return col.subboard_id === activeSubboard;
    return !col.subboard_id;
  }) || [];

  const activeSubboardObj = activeSubboard
    ? board?.subboards?.find(s => s.id === activeSubboard)
    : null;

  // --- Crear Columna ---
  const openCreateColumn = (subId = null) => {
    setColSubId(subId);
    setColName('');
    setColModalVisible(true);
  };

  const handleCreateColumn = async () => {
    if (!colName.trim()) {
      showToast('El nombre de la columna es obligatorio', 'warning');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/boards/${boardId}/columns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ name: colName.trim(), subboard_id: colSubId })
      });
      if (response.ok) {
        showToast('Columna creada', 'success');
        setColModalVisible(false);
        fetchBoard();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al crear columna', 'danger');
      }
    } catch (e) {
      showToast('Error de red', 'danger');
    }
  };

  // --- Crear Tarjeta ---
  const openCreateCard = (colId) => {
    setCardColId(colId);
    setCardTitle('');
    setCardDesc('');
    setCardStartDate('');
    setCardDueDate('');
    setCardLabelIds([]);
    setCardMemberIds([]);
    setCardModalVisible(true);
  };

  const toggleCardLabel = (labelId) => {
    setCardLabelIds(prev => prev.includes(labelId) ? prev.filter(l => l !== labelId) : [...prev, labelId]);
  };

  const toggleCardMember = (memberId) => {
    setCardMemberIds(prev => prev.includes(memberId) ? prev.filter(m => m !== memberId) : [...prev, memberId]);
  };

  const handleCreateCard = async () => {
    if (!cardTitle.trim()) {
      showToast('El título de la tarjeta es obligatorio', 'warning');
      return;
    }
    setSavingCard(true);
    try {
      const response = await fetch(`${API_URL}/boards/columns/${cardColId}/cards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({
          title: cardTitle.trim(),
          description: cardDesc.trim() || null,
          start_date: cardStartDate || null,
          due_date: cardDueDate || null,
          label_ids: cardLabelIds,
          member_ids: cardMemberIds
        })
      });
      if (response.ok) {
        showToast('Tarjeta creada', 'success');
        setCardModalVisible(false);
        fetchBoard();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al crear tarjeta', 'danger');
      }
    } catch (e) {
      showToast('Error de red', 'danger');
    } finally {
      setSavingCard(false);
    }
  };

  // --- Crear Subtablero ---
  const handleCreateSubboard = async () => {
    if (!subName.trim()) {
      showToast('El nombre del subtablero es obligatorio', 'warning');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/boards/${boardId}/subboards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({
          name: subName.trim(),
          description: subDesc.trim() || null,
          color: subColor
        })
      });
      if (response.ok) {
        showToast('Subtablero creado', 'success');
        setSubModalVisible(false);
        fetchBoard();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al crear subtablero', 'danger');
      }
    } catch (e) {
      showToast('Error de red', 'danger');
    }
  };

  // --- Miembros ---
  const searchUsers = async (q) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(`${API_URL}/boards/search-users?q=${encodeURIComponent(q.trim())}`, {
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        const data = await response.json();
        // Excluir usuarios que ya son miembros del tablero
        const memberIds = (board?.members || []).map(m => m.id);
        setSearchResults(data.filter(u => !memberIds.includes(u.id)));
      }
    } catch (e) {
      console.error('Error buscando usuarios:', e);
    } finally {
      setSearching(false);
    }
  };

  const addMember = async (userId) => {
    try {
      const response = await fetch(`${API_URL}/boards/${boardId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ user_id: userId })
      });
      if (response.ok) {
        showToast('Miembro agregado', 'success');
        setSearchQuery('');
        setSearchResults([]);
        fetchBoard();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al agregar miembro', 'danger');
      }
    } catch (e) {
      showToast('Error de red', 'danger');
    }
  };

  const removeMember = (member) => {
    setConfirmModal({
      visible: true,
      title: 'Quitar Miembro',
      message: `¿Quitar a "${member.name || member.username}" del tablero?`,
      onConfirm: async () => {
        try {
          const response = await fetch(`${API_URL}/boards/${boardId}/members/${member.id}`, {
            method: 'DELETE',
            headers: { 'x-user-id': user.id.toString() }
          });
          if (response.ok) {
            showToast('Miembro quitado', 'success');
            fetchBoard();
          } else {
            const err = await response.json();
            showToast(err.error || 'Error al quitar miembro', 'danger');
          }
        } catch (e) {
          showToast('Error de red', 'danger');
        }
      },
      loading: false
    });
  };

  // --- Etiquetas ---
  const handleCreateLabel = async () => {
    if (!labelName.trim()) {
      showToast('El nombre de la etiqueta es obligatorio', 'warning');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/boards/${boardId}/labels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ name: labelName.trim(), color: labelColor })
      });
      if (response.ok) {
        showToast('Etiqueta creada', 'success');
        setLabelName('');
        fetchBoard();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al crear etiqueta', 'danger');
      }
    } catch (e) {
      showToast('Error de red', 'danger');
    }
  };

  // --- Eliminaciones ---
  const confirmDeleteColumn = (col) => {
    setConfirmModal({
      visible: true,
      title: 'Eliminar Columna',
      message: `¿Eliminar la columna "${col.name}"? Se eliminarán todas sus tarjetas.`,
      onConfirm: async () => {
        try {
          const response = await fetch(`${API_URL}/boards/columns/${col.id}`, {
            method: 'DELETE',
            headers: { 'x-user-id': user.id.toString() }
          });
          if (response.ok) {
            showToast('Columna eliminada', 'success');
            fetchBoard();
          } else {
            const err = await response.json();
            showToast(err.error || 'Error al eliminar columna', 'danger');
          }
        } catch (e) {
          showToast('Error de red', 'danger');
        }
      },
      loading: false
    });
  };

  const confirmDeleteSubboard = (sub) => {
    setConfirmModal({
      visible: true,
      title: 'Eliminar Subtablero',
      message: `¿Eliminar el subtablero "${sub.name}"? Se eliminarán sus columnas y tarjetas.`,
      onConfirm: async () => {
        try {
          const response = await fetch(`${API_URL}/boards/subboards/${sub.id}`, {
            method: 'DELETE',
            headers: { 'x-user-id': user.id.toString() }
          });
          if (response.ok) {
            showToast('Subtablero eliminado', 'success');
            if (activeSubboard === sub.id) setActiveSubboard(null);
            fetchBoard();
          } else {
            const err = await response.json();
            showToast(err.error || 'Error al eliminar subtablero', 'danger');
          }
        } catch (e) {
          showToast('Error de red', 'danger');
        }
      },
      loading: false
    });
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <SidebarLayout navigation={navigation} title="Proyectos y Tableros" activeRoute="Boards">
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={{ color: theme.textSecondary, marginTop: 12 }}>Cargando tablero...</Text>
        </View>
      </SidebarLayout>
    );
  }

  if (!board) {
    return (
      <SidebarLayout navigation={navigation} title="Proyectos y Tableros" activeRoute="Boards">
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.danger} />
          <Text style={{ color: theme.text, marginTop: 12, fontWeight: '600' }}>No se encontró el tablero</Text>
          <Button title="Volver" variant="secondary" style={{ marginTop: 20 }} onPress={() => navigation.goBack()} />
        </View>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout
      navigation={navigation}
      title="Proyectos y Tableros"
      activeRoute="Boards"
      headerRight={
        <TouchableOpacity
          onPress={() => setMembersModalVisible(true)}
          style={[styles.headerMembersBtn, { backgroundColor: theme.accent + '15' }]}
        >
          <Ionicons name="people" size={18} color={theme.accent} />
          {!isMobile && <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>Miembros</Text>}
        </TouchableOpacity>
      }
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Encabezado de la página: botón volver + título */}
        <View style={[styles.pageHeader, { paddingHorizontal: 10 }]}>
          <Button
            onPress={() => navigation.goBack()}
            variant="secondary"
            style={[styles.backCircleBtn, { shadowColor: theme.shadow, marginRight: 10, borderWidth: 0 }]}
            icon={<Ionicons name="chevron-back" size={22} color={theme.text} />}
          />
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {board.name}
          </Text>
        </View>

        {/* Barra de subtableros (tabs) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.subboardsBar, { borderBottomColor: theme.border }]}
          contentContainerStyle={styles.subboardsBarContent}
        >
          <TouchableOpacity
            style={[
              styles.subTab,
              { backgroundColor: !activeSubboard ? theme.accent + '20' : 'transparent', borderColor: !activeSubboard ? theme.accent : theme.border }
            ]}
            onPress={() => setActiveSubboard(null)}
          >
            <Ionicons name="albums-outline" size={14} color={!activeSubboard ? theme.accent : theme.textSecondary} />
            <Text style={{ color: !activeSubboard ? theme.accent : theme.textSecondary, fontSize: 12, fontWeight: '600' }}>
              Tablero General
            </Text>
          </TouchableOpacity>

          {(board.subboards || []).map((sub) => (
            <TouchableOpacity
              key={sub.id}
              style={[
                styles.subTab,
                { backgroundColor: activeSubboard === sub.id ? sub.color + '25' : 'transparent', borderColor: activeSubboard === sub.id ? sub.color : theme.border }
              ]}
              onPress={() => setActiveSubboard(sub.id)}
            >
              <View style={[styles.subDot, { backgroundColor: sub.color }]} />
              <Text style={{ color: activeSubboard === sub.id ? sub.color : theme.textSecondary, fontSize: 12, fontWeight: '600' }}>
                {sub.name}
              </Text>
              {board.is_owner && (
                <TouchableOpacity onPress={() => confirmDeleteSubboard(sub)} style={{ padding: 2, marginLeft: 2 }}>
                  <Ionicons name="close-circle" size={14} color={theme.danger} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.subTab, { borderColor: theme.accent, borderStyle: 'dashed', backgroundColor: theme.accent + '10' }]}
            onPress={() => {
              setSubName('');
              setSubDesc('');
              setSubColor(SUBBOARD_COLORS[Math.floor(Math.random() * SUBBOARD_COLORS.length)]);
              setSubModalVisible(true);
            }}
          >
            <Ionicons name="add" size={16} color={theme.accent} />
            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>Subtablero</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Contenido del tablero: columnas horizontales */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.columnsContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          {visibleColumns.map((col) => (
            <View key={col.id} style={[styles.column, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.columnHeader}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.columnCount, { backgroundColor: theme.accent + '15' }]}>
                    <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '700' }}>{col.cards.length}</Text>
                  </View>
                  <Text style={[styles.columnTitle, { color: theme.text }]} numberOfLines={1}>{col.name}</Text>
                </View>
                {board.is_owner && (
                  <TouchableOpacity onPress={() => confirmDeleteColumn(col)} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={14} color={theme.danger} />
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.columnCards}>
                {col.cards.map((card) => (
                  <TouchableOpacity
                    key={card.id}
                    style={[styles.cardItem, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={() => navigation.navigate('CardDetail', { cardId: card.id, boardId: board.id })}
                  >
                    {/* Etiquetas */}
                    {card.labels.length > 0 && (
                      <View style={styles.cardLabels}>
                        {card.labels.map(label => (
                          <View key={label.id} style={[styles.cardLabel, { backgroundColor: label.color }]}>
                            <Text style={{ color: '#FFF', fontSize: 8, fontWeight: '700' }} numberOfLines={1}>
                              {label.name}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <Text style={[styles.cardTitle, { color: theme.text }]}>{card.title}</Text>

                    {card.description ? (
                      <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 4 }} numberOfLines={2}>
                        {card.description}
                      </Text>
                    ) : null}

                    <View style={styles.cardFooter}>
                      <View style={styles.cardFooterLeft}>
                        {card.due_date && (
                          <View style={styles.cardBadge}>
                            <Ionicons name="calendar-outline" size={11} color="#F59E0B" />
                            <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '600' }}>
                              {formatDateLabel(card.due_date)}
                            </Text>
                          </View>
                        )}
                        {card.checklists.length > 0 && (
                          <View style={styles.cardBadge}>
                            <Ionicons name="checkbox-outline" size={11} color={theme.textSecondary} />
                            <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '600' }}>
                              {card.checklists.reduce((acc, cl) => acc + cl.items.filter(i => i.checked).length, 0)}/
                              {card.checklists.reduce((acc, cl) => acc + cl.items.length, 0)}
                            </Text>
                          </View>
                        )}
                      </View>
                      {card.members.length > 0 && (
                        <View style={styles.cardMembers}>
                          {card.members.slice(0, 3).map((m, i) => (
                            <View key={m.id} style={[styles.cardMemberAvatar, {
                              backgroundColor: `hsl(${(i * 60) % 360}, 65%, 50%)`,
                              marginLeft: i === 0 ? 0 : -5
                            }]}>
                              <Text style={styles.cardMemberText}>{getInitials(m.name || m.username)}</Text>
                            </View>
                          ))}
                          {card.members.length > 3 && (
                            <View style={[styles.cardMemberAvatar, { backgroundColor: theme.textSecondary, marginLeft: -5 }]}>
                              <Text style={styles.cardMemberText}>+{card.members.length - 3}</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={[styles.addCardBtn, { borderColor: theme.accent + '40' }]}
                  onPress={() => openCreateCard(col.id)}
                >
                  <Ionicons name="add" size={16} color={theme.accent} />
                  <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>Añadir tarjeta</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          ))}

          {/* Botón crear columna */}
          <TouchableOpacity
            style={[styles.addColumnBtn, { borderColor: theme.accent, backgroundColor: theme.accent + '08' }]}
            onPress={() => openCreateColumn(activeSubboard)}
          >
            <Ionicons name="add" size={20} color={theme.accent} />
            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>Nueva columna</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Botón flotante de etiquetas */}
        <TouchableOpacity
          style={[styles.labelsFab, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => setLabelsModalVisible(true)}
        >
          <Ionicons name="pricetags-outline" size={20} color={theme.accent} />
        </TouchableOpacity>
      </View>

      {/* Modal Crear Columna */}
      <Modal visible={colModalVisible} transparent animationType="fade" onRequestClose={() => setColModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, width: isMobile ? '92%' : 380 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Nueva Columna</Text>
              <TouchableOpacity onPress={() => setColModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <Input
              label="Nombre de la columna"
              icon="list-outline"
              placeholder="Ej: Por hacer, En revisión, Hecho..."
              value={colName}
              onChangeText={setColName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" variant="secondary" onPress={() => setColModalVisible(false)} style={{ flex: 1 }} />
              <Button title="Crear Columna" variant="primary" onPress={handleCreateColumn} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Crear Tarjeta */}
      <Modal visible={cardModalVisible} transparent animationType="fade" onRequestClose={() => setCardModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, width: isMobile ? '94%' : 460, maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Nueva Tarjeta</Text>
              <TouchableOpacity onPress={() => setCardModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Input
                label="Título"
                icon="document-text-outline"
                placeholder="Ej: Diseñar landing page"
                value={cardTitle}
                onChangeText={setCardTitle}
                autoFocus
              />
              <Input
                label="Descripción"
                icon="reader-outline"
                placeholder="Detalles de la tarjeta..."
                value={cardDesc}
                onChangeText={setCardDesc}
                multiline
                numberOfLines={3}
              />

              <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Fecha inicio</Text>
                  <TextInput
                    style={[styles.dateInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    placeholder="AAAA-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                    value={cardStartDate}
                    onChangeText={setCardStartDate}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Fecha vencimiento</Text>
                  <TextInput
                    style={[styles.dateInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    placeholder="AAAA-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                    value={cardDueDate}
                    onChangeText={setCardDueDate}
                  />
                </View>
              </View>

              {/* Etiquetas disponibles */}
              {(board.labels || []).length > 0 && (
                <>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Etiquetas</Text>
                  <View style={styles.labelsWrap}>
                    {(board.labels || []).map(label => (
                      <TouchableOpacity
                        key={label.id}
                        onPress={() => toggleCardLabel(label.id)}
                        style={[
                          styles.labelChip,
                          { backgroundColor: label.color },
                          cardLabelIds.includes(label.id) && styles.labelChipSelected
                        ]}
                      >
                        <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>{label.name}</Text>
                        {cardLabelIds.includes(label.id) && <Ionicons name="checkmark-circle" size={14} color="#FFF" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Miembros disponibles */}
              {(board.members || []).length > 0 && (
                <>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Asignar miembros</Text>
                  <View style={styles.labelsWrap}>
                    {(board.members || []).map(member => {
                      const selected = cardMemberIds.includes(member.id);
                      return (
                        <TouchableOpacity
                          key={member.id}
                          onPress={() => toggleCardMember(member.id)}
                          style={[
                            styles.memberChip,
                            { backgroundColor: selected ? theme.accent + '25' : theme.background, borderColor: selected ? theme.accent : theme.border }
                          ]}
                        >
                          <View style={[styles.chipAvatar, { backgroundColor: selected ? theme.accent : theme.textSecondary }]}>
                            <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '700' }}>
                              {getInitials(member.name || member.username)}
                            </Text>
                          </View>
                          <Text style={{ color: selected ? theme.accent : theme.text, fontSize: 11, fontWeight: '600' }}>
                            {member.name || member.username}
                          </Text>
                          {selected && <Ionicons name="checkmark-circle" size={14} color={theme.accent} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <View style={styles.modalActions}>
                <Button title="Cancelar" variant="secondary" onPress={() => setCardModalVisible(false)} style={{ flex: 1 }} />
                <Button title="Crear Tarjeta" variant="primary" onPress={handleCreateCard} loading={savingCard} style={{ flex: 1 }} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Crear Subtablero */}
      <Modal visible={subModalVisible} transparent animationType="fade" onRequestClose={() => setSubModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, width: isMobile ? '92%' : 400 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Nuevo Subtablero</Text>
              <TouchableOpacity onPress={() => setSubModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <Input
              label="Nombre del subtablero"
              icon="git-branch-outline"
              placeholder="Ej: Departamento de Ventas"
              value={subName}
              onChangeText={setSubName}
              autoFocus
            />
            <Input
              label="Descripción (opcional)"
              icon="document-text-outline"
              placeholder="¿Qué se gestiona en este subtablero?"
              value={subDesc}
              onChangeText={setSubDesc}
              multiline
              numberOfLines={2}
            />
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Color</Text>
            <View style={styles.colorRow}>
              {SUBBOARD_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setSubColor(color)}
                  style={[styles.colorDot, { backgroundColor: color }, subColor === color && styles.colorDotSelected]}
                >
                  {subColor === color && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancelar" variant="secondary" onPress={() => setSubModalVisible(false)} style={{ flex: 1 }} />
              <Button title="Crear Subtablero" variant="primary" onPress={handleCreateSubboard} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Miembros */}
      <Modal visible={membersModalVisible} transparent animationType="fade" onRequestClose={() => setMembersModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, width: isMobile ? '94%' : 420, maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Miembros del Tablero</Text>
              <TouchableOpacity onPress={() => setMembersModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Lista de miembros actuales */}
              <View style={styles.membersList}>
                {(board.members || []).map(member => (
                  <View key={member.id} style={[styles.memberRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <View style={[styles.memberRowAvatar, { backgroundColor: member.role === 'owner' ? theme.accent : '#3B82F6' }]}>
                      <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>
                        {getInitials(member.name || member.username)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>
                        {member.name || member.username}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 11 }}>@{member.username}</Text>
                    </View>
                    <View style={[styles.roleBadge, { backgroundColor: member.role === 'owner' ? theme.accent + '15' : '#3B82F615' }]}>
                      <Text style={{ color: member.role === 'owner' ? theme.accent : '#3B82F6', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                        {member.role === 'owner' ? 'Propietario' : 'Miembro'}
                      </Text>
                    </View>
                    {board.is_owner && member.role !== 'owner' && (
                      <TouchableOpacity onPress={() => removeMember(member)} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={16} color={theme.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>

              {/* Buscar y agregar miembros (solo propietario) */}
              {board.is_owner && (
                <>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 10 }]}>
                    Agregar miembro (busca por nombre, usuario o correo)
                  </Text>
                  <View style={[styles.searchRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    <Ionicons name="search" size={16} color={theme.textSecondary} />
                    <TextInput
                      style={[styles.searchInput, { color: theme.text }]}
                      placeholder="Buscar usuario..."
                      placeholderTextColor={theme.textSecondary}
                      value={searchQuery}
                      onChangeText={(text) => {
                        setSearchQuery(text);
                        searchUsers(text);
                      }}
                      autoCapitalize="none"
                    />
                    {searching && <ActivityIndicator size="small" color={theme.accent} />}
                  </View>

                  {searchResults.length > 0 && (
                    <View style={styles.searchResults}>
                      {searchResults.map(u => (
                        <View key={u.id} style={[styles.searchResultItem, { borderColor: theme.border }]}>
                          <View style={[styles.memberRowAvatar, { backgroundColor: theme.textSecondary }]}>
                            <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>{getInitials(u.name || u.username)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{u.name || u.username}</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>@{u.username}</Text>
                          </View>
                          <Button
                            title="Agregar"
                            variant="primary"
                            style={{ paddingHorizontal: 14, height: 32 }}
                            onPress={() => addMember(u.id)}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Etiquetas */}
      <Modal visible={labelsModalVisible} transparent animationType="fade" onRequestClose={() => setLabelsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, width: isMobile ? '92%' : 380 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Etiquetas del Tablero</Text>
              <TouchableOpacity onPress={() => setLabelsModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Lista de etiquetas */}
              <View style={styles.existingLabels}>
                {(board.labels || []).map(label => (
                  <View key={label.id} style={[styles.labelRow, { backgroundColor: label.color + '20', borderColor: label.color + '50' }]}>
                    <View style={[styles.labelPreview, { backgroundColor: label.color }]} />
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{label.name}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setConfirmModal({
                          visible: true,
                          title: 'Eliminar Etiqueta',
                          message: `¿Eliminar la etiqueta "${label.name}"? Se quitará de todas las tarjetas.`,
                          onConfirm: async () => {
                            try {
                              const response = await fetch(`${API_URL}/boards/labels/${label.id}`, {
                                method: 'DELETE',
                                headers: { 'x-user-id': user.id.toString() }
                              });
                              if (response.ok) {
                                showToast('Etiqueta eliminada', 'success');
                                fetchBoard();
                              } else {
                                const err = await response.json();
                                showToast(err.error || 'Error al eliminar etiqueta', 'danger');
                              }
                            } catch (e) {
                              showToast('Error de red', 'danger');
                            }
                          },
                          loading: false
                        });
                      }}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Crear nueva etiqueta */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 10 }]}>Nueva etiqueta</Text>
              <Input
                label=""
                icon="pricetag-outline"
                placeholder="Nombre de la etiqueta"
                value={labelName}
                onChangeText={setLabelName}
              />
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Color</Text>
              <View style={styles.colorRow}>
                {subColors.map(color => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setLabelColor(color)}
                    style={[styles.colorDot, { backgroundColor: color }, labelColor === color && styles.colorDotSelected]}
                  >
                    {labelColor === color && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </TouchableOpacity>
                ))}
              </View>
              <Button title="Crear Etiqueta" variant="primary" onPress={handleCreateLabel} icon={<Ionicons name="add" size={18} color="#FFF" />} />
            </ScrollView>
          </View>
        </View>
      </Modal>

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
                loading={confirmModal.loading}
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
  headerMembersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  subboardsBar: {
    maxHeight: 52,
    borderBottomWidth: 1,
  },
  subboardsBarContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  subTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  subDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  columnsContainer: {
    padding: 10,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexGrow: 1,
  },
  column: {
    width: 272,
    maxHeight: '100%',
    borderRadius: 12,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    flexShrink: 1,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  columnCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  columnTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  columnCards: {
    padding: 8,
    gap: 8,
  },
  cardItem: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  cardLabels: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  cardLabel: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 120,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cardFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardMembers: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardMemberAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  cardMemberText: {
    color: '#FFF',
    fontSize: 7,
    fontWeight: '700',
  },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 8,
  },
  addColumnBtn: {
    width: 180,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  labelsFab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  dateInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    fontSize: 13,
    marginBottom: 12,
  },
  labelsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    opacity: 0.85,
  },
  labelChipSelected: {
    opacity: 1,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: '#FFF',
    borderWidth: 3,
  },
  membersList: {
    gap: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  memberRowAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  searchResults: {
    marginTop: 10,
    gap: 8,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  existingLabels: {
    gap: 8,
    marginBottom: 10,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  labelPreview: {
    width: 26,
    height: 12,
    borderRadius: 4,
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