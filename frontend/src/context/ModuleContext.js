import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ModuleContext = createContext();

export const ModuleProvider = ({ children }) => {
  const [moduleSettings, setModuleSettings] = useState({
    showShop: true,
    showDebtors: true,
  });
  const [loadingModules, setLoadingModules] = useState(true);

  useEffect(() => {
    const loadModuleSettings = async () => {
      try {
        const saved = await AsyncStorage.getItem('@unicontrol_module_settings');
        if (saved) {
          setModuleSettings(JSON.parse(saved));
        }
      } catch (e) {
        console.error('Error cargando ajustes de módulos:', e);
      } finally {
        setLoadingModules(false);
      }
    };
    loadModuleSettings();
  }, []);

  const saveModuleSettings = async (settings) => {
    try {
      await AsyncStorage.setItem('@unicontrol_module_settings', JSON.stringify(settings));
      setModuleSettings(settings);
    } catch (e) {
      console.error('Error guardando ajustes de módulos:', e);
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
