import React, { createContext, useContext, useState, useEffect } from 'react';
import { predefinedThemes, lightTheme } from './colors';
import { useModules } from '../context/ModuleContext';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const { moduleSettings, saveModuleSettings } = useModules();
  
  // themeConfig: { mode: 'light', customColors: null }
  const [themeConfig, setThemeConfig] = useState({ mode: 'light', customColors: null });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      if (moduleSettings.themeConfig !== undefined) {
        setThemeConfig(
          typeof moduleSettings.themeConfig === 'string' 
            ? JSON.parse(moduleSettings.themeConfig) 
            : moduleSettings.themeConfig
        );
      } else if (typeof window !== 'undefined' && window.localStorage) {
        const savedTheme = window.localStorage.getItem('@themeConfig');
        if (savedTheme) {
          setThemeConfig(JSON.parse(savedTheme));
        } else {
          // Backward compatibility
          const savedDark = window.localStorage.getItem('@theme_is_dark');
          if (savedDark === 'true') {
            setThemeConfig({ mode: 'dark', customColors: null });
          }
        }
      }
    } catch (error) {
      console.error("Error cargando el tema:", error);
    } finally {
      setIsLoaded(true);
    }
  }, [moduleSettings.themeConfig]);

  const updateThemeConfig = async (newConfig) => {
    try {
      setThemeConfig(newConfig);
      
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('@themeConfig', JSON.stringify(newConfig));
      }

      await saveModuleSettings({ 
        ...moduleSettings, 
        themeConfig: JSON.stringify(newConfig) 
      });
    } catch (error) {
      console.error("Error guardando el tema:", error);
    }
  };

  // Derive final theme object
  let theme = lightTheme; // Default
  if (themeConfig.mode === 'custom' && themeConfig.customColors) {
    theme = { ...lightTheme, ...themeConfig.customColors, isDark: themeConfig.customColors.background < '#888888' }; // basic heuristic
  } else if (predefinedThemes[themeConfig.mode]) {
    theme = predefinedThemes[themeConfig.mode];
  }

  const isDarkMode = theme.isDark;

  if (!isLoaded) return null;

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode, themeConfig, updateThemeConfig }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

