import React, { useEffect, useRef, useState } from 'react';
import { View, Text, useWindowDimensions, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// Configuración de anuncios web (Google AdSense / AdMob Web)
// Obtén estos IDs desde:
//   - AdMob → Apps → tu app → Add app → Web app (o crea una en AdSense)
//   - AdSense → Ads → Units → + New ad unit
const ADSENSE_CLIENT_ID = process.env.EXPO_PUBLIC_ADSENSE_CLIENT_ID || '';
const ADSENSE_SLOT_ID = process.env.EXPO_PUBLIC_ADSENSE_SLOT_ID || '';

// Script de AdSense (se inyecta UNA sola vez en todo el documento)
const ADSENSE_SCRIPT = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

let scriptInjected = false;

function injectAdSenseScript() {
  if (scriptInjected) return;
  scriptInjected = true;

  // Si una recarga en caliente ya dejó el script, no lo duplicamos
  const existing = document.querySelector(`script[src="${ADSENSE_SCRIPT}"]`);
  if (!existing) {
    const script = document.createElement('script');
    script.src = ADSENSE_SCRIPT;
    script.async = true;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
  }
}

export default function AdBanner() {
  const { theme, isDarkMode } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const bannerRef = useRef(null);
  const pushedRef = useRef(false); // Evita push duplicado en el MISMO banner
  // hasAd = false mientras AdSense no haya renderizado un iframe dentro del ins
  const [hasAd, setHasAd] = useState(false);

  const textColor = isDarkMode ? '#1e1e1e' : '#f5f5f5';
  const borderColor = theme.border;

  useEffect(() => {
    // Inyectar el script de AdSense una sola vez
    injectAdSenseScript();

    // Esperar a que adsbygoogle esté disponible y hacer push UNA sola vez.
    let attempts = 0;
    const tryPush = () => {
      if (pushedRef.current) return;
      if (window.adsbygoogle && bannerRef.current) {
        try {
          window.adsbygoogle.push({});
          pushedRef.current = true;
        } catch (e) {
          console.warn('AdSense push error:', e);
        }
      } else if (attempts < 20) {
        attempts++;
        setTimeout(tryPush, 200);
      }
    };
    tryPush();

    // Detectar si el anuncio realmente se renderizó.
    // AdSense inserta un <iframe> dentro del <ins> cuando el anuncio carga.
    const checkInterval = setInterval(() => {
      const el = bannerRef.current;
      if (el) {
        const iframe = el.querySelector('iframe');
        const hasContent = iframe && (iframe.offsetHeight > 0 || iframe.offsetWidth > 0);
        if (hasContent) {
          setHasAd(true);
          clearInterval(checkInterval);
        }
      }
    }, 500);

    // Dejar de revisar tras 10 segundos para no gastar recursos
    const timeout = setTimeout(() => clearInterval(checkInterval), 10000);
    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, []);

  // Mientras no haya anuncio renderizado (sin IDs, o con IDs pero vacío),
  // se muestra el mensaje de espacio publicitario.
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: textColor, borderTopColor: borderColor },
      ]}
    >
      {/* El <ins> está SIEMPRE en el DOM para que AdSense pueda llenarlo.
          Se le da altura mínima para que AdSense pueda medir/renderizar. */}
      <View
        ref={bannerRef}
        style={{
          maxWidth: 728,
          width: '100%',
          alignItems: 'center',
          maxHeight: 90,
          overflow: 'hidden',
        }}
      >
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', minHeight: 90 }}
          data-ad-client={ADSENSE_CLIENT_ID}
          data-ad-slot={ADSENSE_SLOT_ID}
          data-ad-format="horizontal"
          data-full-width-responsive="false"
        />
      </View>

      {/* Placeholder superpuesto mientras no haya anuncio renderizado */}
      {!hasAd && (
        <View style={[styles.placeholderOverlay, { backgroundColor: textColor }]}>
          <Text style={[styles.placeholderTitle, { color: theme.textSecondary }]}>
            Espacio Publicitario
          </Text>
          <Text style={[styles.placeholderText, { color: theme.textLight }]}>
            Actualiza a una Suscripción Premium para eliminar anuncios
          </Text>
        </View>
      )}

      {/* Disclaimer solo cuando el anuncio se muestra */}
      {hasAd && (
        <Text style={[styles.disclaimer, { color: theme.textLight }]}>
          Actualiza a una Suscripción Premium para eliminar anuncios
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    paddingVertical: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  placeholderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
  },
  placeholderTitle: {
    fontSize: 11,
    fontWeight: '600',
  },
  placeholderText: {
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },
});