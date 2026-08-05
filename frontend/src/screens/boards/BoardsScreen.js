import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Modal, useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import SidebarLayout from '../../navigation/SidebarLayout';
import { useIsFocused } from '@react-navigation/native';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { useModules } from '../../context/ModuleContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

const BOARD_COLORS = [
  '#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#84CC16'
];

export default function BoardsScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { moduleSettings } = useModules();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const isFocused = useIsFocused();

  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal crear/editar tablero
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBoard, setEditingBoard] = useState(null);
  const [boardName, setBoardName] = useState('');
  const [boardDesc, setBoardDesc] = useState('');
  const [boardColor, setBoardColor] = useState(BOARD_COLORS[0]);
  const [saving, setSaving] = useState(false);

  // Modal eliminar
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [boardToDelete, setBoardToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchBoards = async () => {
    try {
      const response = await fetch(`${API_URL}/boards`, {
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        const data = await response.json();
        setBoards(Array.isArray(data) ? data : []);
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al cargar tableros', 'danger');
      }
    } catch (e) {
      console.error('Error cargando tableros:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      fetchBoards();
    }
  }, [isFocused]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBoards();
  }, []);

  const openCreateModal = () => {
    setEditingBoard(null);
    setBoardName('');
    setBoardDesc('');
    setBoardColor(BOARD_COLORS[Math.floor(Math.random() * BOARD_COLORS.length)]);
    setModalVisible(true);
  };

  const openEditModal = (board) => {
    setEditingBoard(board);
    setBoardName(board.name);
    setBoardDesc(board.description || '');
    setBoardColor(board.color || BOARD_COLORS[0]);
    setModalVisible(true);
  };

  const handleSaveBoard = async () => {
    if (!boardName.trim()) {
      showToast('El nombre del tablero es obligatorio', 'warning');
      return;
    }
    setSaving(true);
    try {
      const url = editingBoard ? `${API_URL}/boards/${editingBoard.id}` : `${API_URL}/boards`;
      const method = editingBoard ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({
          name: boardName.trim(),
          description: boardDesc.trim() || null,
          color: boardColor
        })
      });
      if (response.ok) {
        showToast(editingBoard ? 'Tablero actualizado' : 'Tablero creado', 'success');
        setModalVisible(false);
        fetchBoards();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al guardar tablero', 'danger');
      }
    } catch (e) {
      showToast('Error de red al guardar tablero', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteBoard = (board) => {
    setBoardToDelete(board);
    setDeleteModalVisible(true);
  };

  const handleDeleteBoard = async () => {
    if (!boardToDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(`${API_URL}/boards/${boardToDelete.id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        showToast('Tablero eliminado', 'success');
        setDeleteModalVisible(false);
        setBoardToDelete(null);
        fetchBoards();
      } else {
        const err = await response.json();
        showToast(err.error || 'Error al eliminar tablero', 'danger');
        setDeleteModalVisible(false);
      }
    } catch (e) {
      showToast('Error de red al eliminar tablero', 'danger');
      setDeleteModalVisible(false);
    } finally {
      setDeleting(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  };

  return (
    <SidebarLayout navigation={navigation} title="Proyectos y Tableros" activeRoute="Boards">
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={[styles.content, { padding: 10 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      >
        {/* Header de acción */}
        <View style={[styles.headerRow, { marginBottom: isMobile ? 12 : 20 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Mis Tableros</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Organiza tus proyectos en tableros colaborativos estilo Kanban.
            </Text>
          </View>
          <Button
            title="Nuevo Tablero"
            variant="primary"
            onPress={openCreateModal}
            icon={<Ionicons name="add" size={20} color="#FFF" />}
            style={isMobile ? { paddingHorizontal: 14 } : {}}
          />
        </View>

        {/* Requiere módulo empresarial activo: se muestra un aviso si no tiene activado el paquete */}
        {moduleSettings.showBoards === false || moduleSettings.showBoards === 'false' ? (
          <View style={[styles.moduleLocked, { backgroundColor: isDarkMode ? 'rgba(245,158,11,0.1)' : 'rgba(251,191,36,0.15)', borderColor: '#F59E0B' }]}>
            <Ionicons name="lock-closed" size={24} color="#F59E0B" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.moduleLockedTitle, { color: theme.text }]}>Módulo deshabilitado</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                Actívalo desde Configuración → Módulos Empresariales para usar Proyectos y Tableros.
              </Text>
            </View>
            <Button
              title="Configuración"
              variant="secondary"
              style={{ paddingHorizontal: 14, height: 35 }}
              onPress={() => navigation.navigate('Settings')}
            />
          </View>
        ) : null}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={{ color: theme.textSecondary, marginTop: 12 }}>Cargando tableros...</Text>
          </View>
        ) : boards.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.accent + '15' }]}>
              <Ionicons name="albums-outline" size={40} color={theme.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Aún no tienes tableros</Text>
            <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
              Crea tu primer tablero para comenzar a organizar tus proyectos y tareas en equipo.
            </Text>
            <Button
              title="Crear Tablero"
              variant="primary"
              onPress={openCreateModal}
              icon={<Ionicons name="add-circle-outline" size={18} color="#FFF" />}
              style={{ marginTop: 15 }}
            />
          </View>
        ) : (
          <View style={[styles.grid, { gap: isMobile ? 12 : 16 }]}>
            {boards.map((board) => {
              const isOwner = board.is_owner || board.owner_user_id === user.id.toString();
              return (
                <View
                  key={board.id}
                  style={[
                    styles.boardCard,
                    { backgroundColor: theme.card, borderColor: theme.border, width: isMobile ? '100%' : '48%' }
                  ]}
                >
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('BoardDetail', { boardId: board.id, boardName: board.name })}
                  >
                    <View style={[styles.boardColorBar, { backgroundColor: board.color || '#6366F1' }]} />
                    <View style={styles.boardCardBody}>
                      <View style={styles.boardCardHeader}>
                        <Text style={[styles.boardName, { color: theme.text }]} numberOfLines={1}>
                          {board.name}
                        </Text>
                        {isOwner ? (
                          <View style={[styles.ownerBadge, { backgroundColor: theme.accent + '15' }]}>
                            <Text style={{ color: theme.accent, fontSize: 10, fontWeight: '700' }}>PROPIETARIO</Text>
                          </View>
                        ) : (
                          <View style={[styles.memberBadge, { backgroundColor: '#3B82F615' }]}>
                            <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: '700' }}>MIEMBRO</Text>
                          </View>
                        )}
                      </View>

                      {board.description ? (
                        <Text style={[styles.boardDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                          {board.description}
                        </Text>
                      ) : null}

                      <View style={styles.boardMeta}>
                        <View style={styles.metaItem}>
                          <Ionicons name="git-branch-outline" size={14} color={theme.textSecondary} />
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {board.subboards_count} subtablero{board.subboards_count !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Ionicons name="people-outline" size={14} color={theme.textSecondary} />
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {board.members?.length + 1} miembro{(board.members?.length + 1) !== 1 ? 's' : ''}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.membersRow}>
                        {[{ id: board.owner_user_id, name: board.owner_name, username: board.owner_username }, ...(board.members || [])]
                          .slice(0, 5)
                          .map((m, i) => (
                            <View
                              key={`${m.id}-${i}`}
                              style={[
                                styles.avatar,
                                {
                                  backgroundColor: i === 0 ? theme.accent : `hsl(${(i * 60) % 360}, 65%, 50%)`,
                                  marginLeft: i === 0 ? 0 : -6,
                                  zIndex: 5 - i
                                }
                              ]}
                            >
                              <Text style={styles.avatarText}>{getInitials(m.name || m.username)}</Text>
                            </View>
                          ))}
                      </View>
                    </View>
                  </TouchableOpacity>

                  <View style={[styles.cardActions, { borderTopColor: theme.border }]}>
                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => navigation.navigate('BoardDetail', { boardId: board.id, boardName: board.name })}
                    >
                      <Ionicons name="open-outline" size={16} color={theme.accent} />
                      <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>Abrir</Text>
                    </TouchableOpacity>
                    {isOwner && (
                      <>
                        <TouchableOpacity style={styles.cardActionBtn} onPress={() => openEditModal(board)}>
                          <Ionicons name="create-outline" size={16} color={theme.textSecondary} />
                          <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>Editar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cardActionBtn} onPress={() => confirmDeleteBoard(board)}>
                          <Ionicons name="trash-outline" size={16} color={theme.danger} />
                          <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600' }}>Eliminar</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modal Crear/Editar Tablero */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, width: isMobile ? '92%' : 420 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingBoard ? 'Editar Tablero' : 'Nuevo Tablero'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Input
              label="Nombre del tablero"
              icon="albums-outline"
              placeholder="Ej: Lanzamiento Web"
              value={boardName}
              onChangeText={setBoardName}
              autoFocus
            />

            <Input
              label="Descripción (opcional)"
              icon="document-text-outline"
              placeholder="¿De qué trata este tablero?"
              value={boardDesc}
              onChangeText={setBoardDesc}
              multiline
              numberOfLines={3}
            />

            <Text style={[styles.labelSmall, { color: theme.textSecondary }]}>Color del tablero</Text>
            <View style={styles.colorRow}>
              {BOARD_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setBoardColor(color)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    boardColor === color && styles.colorDotSelected
                  ]}
                >
                  {boardColor === color && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Button
                title="Cancelar"
                variant="secondary"
                onPress={() => setModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title={editingBoard ? 'Guardar Cambios' : 'Crear Tablero'}
                variant="primary"
                onPress={handleSaveBoard}
                loading={saving}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, width: isMobile ? '92%' : 400 }]}>
            <View style={[styles.deleteIcon, { backgroundColor: theme.danger + '15' }]}>
              <Ionicons name="trash-outline" size={32} color={theme.danger} />
            </View>
            <Text style={[styles.modalTitle, { color: theme.text, textAlign: 'center' }]}>Eliminar Tablero</Text>
            <Text style={{ color: theme.textSecondary, textAlign: 'center', fontSize: 13, marginTop: 8, lineHeight: 19 }}>
              ¿Estás seguro de eliminar el tablero <Text style={{ fontWeight: 'bold', color: theme.text }}>"{boardToDelete?.name}"</Text>?
              Se eliminarán todos sus subtableros, columnas, tarjetas y datos asociados. Esta acción no se puede deshacer.
            </Text>
            <View style={styles.modalActions}>
              <Button
                title="Cancelar"
                variant="secondary"
                onPress={() => setDeleteModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Sí, Eliminar"
                variant="danger"
                onPress={handleDeleteBoard}
                loading={deleting}
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
  content: { paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  centerBox: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
    maxWidth: 300,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  boardCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  boardColorBar: {
    height: 6,
  },
  boardCardBody: {
    padding: 14,
  },
  boardCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  boardName: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  ownerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  memberBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  boardDesc: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 17,
  },
  boardMeta: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
  },
  moduleLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 15,
  },
  moduleLockedTitle: {
    fontSize: 13,
    fontWeight: '700',
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
  closeBtn: {
    padding: 4,
  },
  labelSmall: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  deleteIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 15,
  },
});