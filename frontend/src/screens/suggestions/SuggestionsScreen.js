import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, RefreshControl, Modal, TouchableWithoutFeedback, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/Button';
import Input from '../../components/Input';
import SidebarLayout from '../../navigation/SidebarLayout';
import { formatDateToLocal } from '../../utils/dateUtils';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function SuggestionsScreen({ navigation }) {
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const isAdmin = user?.role === 'admin';

  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Client State
  const [newMessage, setNewMessage] = useState('');

  // Admin State
  const [filter, setFilter] = useState('pending'); // 'pending' or 'replied'
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/suggestions`, {
        headers: { 'x-user-id': user.id.toString() }
      });
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data);
      }
    } catch (e) {
      console.error(e);
      showToast('Error al cargar buzón', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSuggestions().then(() => setRefreshing(false));
  }, []);

  const handleSubmitSuggestion = async () => {
    if (!newMessage.trim()) {
      showToast('Escribe un mensaje', 'error');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ message: newMessage })
      });

      if (response.ok) {
        showToast('Enviado correctamente', 'success');
        setNewMessage('');
        fetchSuggestions();
      } else {
        showToast('Error al enviar', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    }
  };

  const handleReplySuggestion = async () => {
    if (!replyMessage.trim()) {
      showToast('Escribe una respuesta', 'error');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/suggestions/${selectedSuggestion.id}/reply`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ admin_reply: replyMessage })
      });

      if (response.ok) {
        showToast('Respuesta enviada', 'success');
        setReplyModalVisible(false);
        fetchSuggestions();
      } else {
        showToast('Error al enviar respuesta', 'error');
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
    }
  };

  const openReplyModal = (suggestion) => {
    setSelectedSuggestion(suggestion);
    setReplyMessage(suggestion.admin_reply || '');
    setReplyModalVisible(true);
  };

  const formatDate = (dateString) => {
    return formatDateToLocal(dateString);
  };

  const renderAdminView = () => {
    const filtered = suggestions.filter(s => s.status === filter);

    return (
      <View style={{ flex: 1, paddingHorizontal: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
          <Button
            title="Pendientes"
            variant={filter === 'pending' ? 'primary' : 'secondary'}
            onPress={() => setFilter('pending')}
            style={{ flex: 1 }}
          />
          <Button
            title="Respondidas"
            variant={filter === 'replied' ? 'primary' : 'secondary'}
            onPress={() => setFilter('replied')}
            style={{ flex: 1 }}
          />
        </View>

        {filtered.length === 0 ? (
          <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 20 }}>No hay sugerencias {filter === 'pending' ? 'pendientes' : 'respondidas'}.</Text>
        ) : (
          filtered.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => openReplyModal(item)}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text style={{ fontWeight: 'bold', color: theme.text }}>{item.user_name || item.user_username}</Text>
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>{formatDate(item.created_at)}</Text>
              </View>
              <Text style={{ color: theme.text, marginBottom: 10 }}>{item.message}</Text>

              {item.status === 'replied' && (
                <View style={{ backgroundColor: theme.background, padding: 10, borderRadius: 8, marginTop: 5 }}>
                  <Text style={{ fontWeight: 'bold', color: theme.accent, fontSize: 12, marginBottom: 2 }}>Tu respuesta:</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 14 }}>{item.admin_reply}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>
    );
  };

  const renderClientView = () => {
    return (
      <View style={{ flex: 1, paddingHorizontal: 10 }}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 20 }]}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.text, marginBottom: 10 }}>Enviar Sugerencia, Queja o Reclamo</Text>
          <Input
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Escribe tu mensaje aquí..."
            multiline
            numberOfLines={3}
            style={{ height: 80, textAlignVertical: 'top' }}
          />
          <Button title="Enviar Mensaje" variant="primary" onPress={handleSubmitSuggestion} style={{ marginTop: 10 }} />
        </View>

        <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text, marginBottom: 10, marginLeft: 5 }}>Mi Historial</Text>
        {suggestions.length === 0 ? (
          <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 20 }}>Aún no has enviado sugerencias.</Text>
        ) : (
          suggestions.map(item => (
            <View key={item.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text style={{ fontWeight: 'bold', color: theme.text }}>Tú</Text>
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>{formatDate(item.created_at)}</Text>
              </View>
              <Text style={{ color: theme.text, marginBottom: 10 }}>{item.message}</Text>

              {item.status === 'replied' ? (
                <View style={{ backgroundColor: theme.accent + '15', padding: 10, borderRadius: 8, marginTop: 5, borderWidth: 1, borderColor: theme.accent + '30' }}>
                  <Text style={{ fontWeight: 'bold', color: theme.accent, fontSize: 12, marginBottom: 2 }}>Respuesta del Desarrollador:</Text>
                  <Text style={{ color: theme.text, fontSize: 14 }}>{item.admin_reply}</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: '#F59E0B', fontStyle: 'italic' }}>En espera de respuesta...</Text>
              )}
            </View>
          ))
        )}
      </View>
    );
  };

  return (
    <SidebarLayout navigation={navigation}>
      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <>
            <View style={[styles.header, { paddingHorizontal: 15, paddingTop: 10 }]}>
              <Text style={[styles.title, { color: theme.text }]}>Buzón de Sugerencias</Text>
            </View>

            {isAdmin ? renderAdminView() : renderClientView()}
          </>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      />

      {/* Modal de Respuesta Admin */}
      {isAdmin && (
        <Modal visible={replyModalVisible} transparent animationType="fade" onRequestClose={() => setReplyModalVisible(false)}>
          <TouchableWithoutFeedback onPress={() => setReplyModalVisible(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={[styles.modalContent, { backgroundColor: theme.card, maxWidth: 500, padding: 20 }]}>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.text, marginBottom: 15 }}>Responder Mensaje</Text>

                  <View style={{ backgroundColor: theme.background, padding: 15, borderRadius: 10, marginBottom: 15 }}>
                    <Text style={{ fontWeight: 'bold', color: theme.text }}>Mensaje de {selectedSuggestion?.user_name || selectedSuggestion?.user_username}:</Text>
                    <Text style={{ color: theme.textSecondary, marginTop: 5 }}>{selectedSuggestion?.message}</Text>
                  </View>

                  <Input
                    label="Tu Respuesta"
                    value={replyMessage}
                    onChangeText={setReplyMessage}
                    placeholder="Escribe la respuesta aquí..."
                    multiline
                    numberOfLines={3}
                    style={{ height: 100, textAlignVertical: 'top' }}
                  />

                  <View style={{ flexDirection: 'row', gap: 10, paddingTop: 15 }}>
                    <Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => setReplyModalVisible(false)} />
                    <Button title="Enviar" variant="primary" style={{ flex: 1 }} onPress={handleReplySuggestion} />
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold' },
  card: { padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', borderRadius: 20, maxHeight: '90%' },
});
