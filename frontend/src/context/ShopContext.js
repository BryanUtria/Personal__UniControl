import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const ShopContext = createContext();
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';
const ACTIVE_SHOP_KEY = '@unicontrol_active_shop';

export const ShopProvider = ({ children }) => {
  const { user } = useAuth();
  const [shops, setShops] = useState([]);
  const [activeShop, setActiveShop] = useState(null);
  const [loading, setLoading] = useState(true);

  // Cargar la tienda activa persistida al montar
  useEffect(() => {
    const loadActiveShop = async () => {
      try {
        const saved = await AsyncStorage.getItem(ACTIVE_SHOP_KEY);
        if (saved) {
          setActiveShop(JSON.parse(saved));
        }
      } catch (e) {
        console.error('Error cargando tienda activa:', e);
      }
    };
    loadActiveShop();
  }, []);

  // Cargar las tiendas del usuario cuando cambia el usuario
  const refreshShops = useCallback(async () => {
    if (!user) {
      setShops([]);
      setActiveShop(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/shops`, {
        headers: { 'x-user-id': user.id.toString() }
      });
      const data = await response.json();
      if (response.ok) {
        const shopList = Array.isArray(data) ? data : [];
        setShops(shopList);

        // Si hay tiendas, asegurar que la activa existe en la lista
        if (shopList.length > 0) {
          setActiveShop(prev => {
            const stillExists = prev && shopList.some(s => String(s.id) === String(prev.id));
            return stillExists ? prev : shopList[0];
          });
        } else {
          setActiveShop(null);
        }
      } else {
        console.error('Error al cargar tiendas:', data.error);
      }
    } catch (error) {
      console.error('Error de red al cargar tiendas:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshShops();
  }, [refreshShops]);

  // Cambiar la tienda activa (persistida)
  const selectShop = async (shop) => {
    setActiveShop(shop);
    try {
      await AsyncStorage.setItem(ACTIVE_SHOP_KEY, JSON.stringify(shop));
    } catch (e) {
      console.error('Error guardando tienda activa:', e);
    }
  };

  // Crear una nueva tienda
  const createShop = async (name) => {
    if (!user) return { success: false, error: 'Inicia sesión primero.' };
    try {
      const response = await fetch(`${API_URL}/shops`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ name })
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Error al crear la tienda.' };
      }
      setShops(prev => {
        if (prev.some(s => String(s.id) === String(data.id))) return prev;
        return [...prev, data];
      });
      await selectShop(data);
      return { success: true, shop: data };
    } catch (error) {
      return { success: false, error: 'Error de red al crear la tienda.' };
    }
  };

  // Vincularse a una tienda existente con código
  const joinShop = async (code) => {
    if (!user) return { success: false, error: 'Inicia sesión primero.' };
    try {
      const response = await fetch(`${API_URL}/shops/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString()
        },
        body: JSON.stringify({ code })
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Error al vincular la tienda.' };
      }
      await refreshShops();
      return { success: true, shop: data };
    } catch (error) {
      return { success: false, error: 'Error de red al vincular la tienda.' };
    }
  };

  return (
    <ShopContext.Provider value={{
      shops,
      activeShop,
      loading,
      refreshShops,
      selectShop,
      createShop,
      joinShop
    }}>
      {children}
    </ShopContext.Provider>
  );
};

export const useShop = () => useContext(ShopContext);