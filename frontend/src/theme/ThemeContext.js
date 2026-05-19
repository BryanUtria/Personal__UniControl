import React, { createContext, useContext, useState, useEffect } from 'react';
import { darkTheme, lightTheme } from './colors';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Cargar preferencia guardada al iniciar la app (para Web)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
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
  }, []);

  const toggleTheme = () => {
    try {
      const newValue = !isDarkMode;
      setIsDarkMode(newValue);
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('@theme_is_dark', String(newValue));
      }
    } catch (error) {
      console.error("Error guardando el tema:", error);
    }
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  // Renderizar null hasta que se lea el almacenamiento para evitar destellos
  if (!isLoaded) return null;

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
