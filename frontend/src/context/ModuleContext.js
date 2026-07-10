import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const ModuleContext = createContext();
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

export const ModuleProvider = ({ children }) => {
  const { user } = useAuth();
  const [moduleSettings, setModuleSettings] = useState({
    showShop: true,
    showDebtors: true,
  });
  const [loadingModules, setLoadingModules] = useState(true);

  useEffect(() => {
    const loadModuleSettings = async () => {
      if (!user) {
        setLoadingModules(false);
        return;
      }
      try {
        const response = await fetch(`${API_URL}/users/settings`, {
          headers: {
            'x-user-id': user.id.toString(),
          }
        });
        if (response.ok) {
          const settings = await response.json();
          setModuleSettings(settings);
        }
      } catch (e) {
        console.error('Error cargando ajustes de módulos:', e);
      } finally {
        setLoadingModules(false);
      }
    };
    loadModuleSettings();
  }, [user]);

  const saveModuleSettings = async (settings) => {
    setModuleSettings(settings); // Optimistic UI update
    if (!user) return;
    try {
      await fetch(`${API_URL}/users/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id.toString(),
        },
        body: JSON.stringify(settings),
      });
    } catch (e) {
      console.error('Error guardando ajustes de módulos en backend:', e);
    }
  };

  return (
    <ModuleContext.Provider value={{ moduleSettings, saveModuleSettings, loadingModules }}>
      {children}
    </ModuleContext.Provider>
  );
};

export const useModules = () => {
  const context = useContext(ModuleContext);
  if (!context) {
    throw new Error('useModules debe utilizarse dentro de un ModuleProvider');
  }
  return context;
};
