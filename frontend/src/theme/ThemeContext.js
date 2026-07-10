import React, { createContext, useContext, useState, useEffect } from 'react';
import { darkTheme, lightTheme } from './colors';
import { useModules } from '../context/ModuleContext';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const { moduleSettings, saveModuleSettings } = useModules();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      if (moduleSettings.theme_is_dark !== undefined) {
        setIsDarkMode(moduleSettings.theme_is_dark === true || moduleSettings.theme_is_dark === 'true');
      } else if (typeof window !== 'undefined' && window.localStorage) {
        // Fallback for initial load before settings exist
        const savedTheme = window.localStorage.getItem('@theme_is_dark');
        if (savedTheme !== null) {
          setIsDarkMode(savedTheme === 'true');
        }
      }
    } catch (error) {
      console.error("Error cargando el tema:", error);
    } finally {
      setIsLoaded(true);
    }
  }, [moduleSettings.theme_is_dark]);

  const toggleTheme = async () => {
    try {
      const newValue = !isDarkMode;
      setIsDarkMode(newValue);
      
      // Guardar también localmente para que se vea rápido en el próximo inicio
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('@theme_is_dark', String(newValue));
      }

      await saveModuleSettings({ ...moduleSettings, theme_is_dark: newValue });
    } catch (error) {
      console.error("Error guardando el tema:", error);
    }
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  if (!isLoaded) return null;

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
