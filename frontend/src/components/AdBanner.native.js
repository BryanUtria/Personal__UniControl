import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useTheme } from '../theme/ThemeContext';

// ID del banner: en desarrollo (__DEV__) se usa el ID de prueba oficial de Google,
// que muestra anuncios de prueba sin necesidad de cuenta aprobada.
// En producción se usa el ID real de AdMob del .env (EXPO_PUBLIC_ADMOB_BANNER_ID).
const bannerAdUnitId = process.env.EXPO_PUBLIC_ADMOB_BANNER_ID || TestIds.BANNER;
// const bannerAdUnitId = __DEV__
//   ? TestIds.BANNER
//   : (process.env.EXPO_PUBLIC_ADMOB_BANNER_ID || TestIds.BANNER);

export default function AdBanner() {
  const { theme, isDarkMode } = useTheme();
  // Estados del banner: 'empty' (sin anuncio aún) | 'loaded'
  const [adState, setAdState] = useState('empty');

  return (
    <View style={[styles.container, styles.containerOverflow, { backgroundColor: isDarkMode ? '#1e1e1e' : '#f5f5f5' }]}>
      {/* El BannerAd está SIEMPRE montado para intentar cargar el anuncio.
          Mientras no cargue, se mantiene oculto (height 0 / absolute).
          Al cargar (onAdLoaded) se hace visible y se oculta el placeholder. */}
      <BannerAd
        unitId={bannerAdUnitId}
        size={BannerAdSize.ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => setAdState('loaded')}
        onAdFailedToLoad={(error) => {
          // 'error-code-no-fill' es normal: la solicitud fue exitosa
          // pero no había inventario de anuncios disponible en ese momento.
          console.log('AdMob banner error:', error);
          setAdState('empty');
        }}
        style={adState === 'loaded' ? styles.adVisible : styles.adHidden}
      />
      
      {/* Mientras no haya un anuncio cargado, se muestra el mismo texto que en la web */}
      {adState !== 'loaded' && (
        <View style={styles.placeholderWrap}>
          <Text style={[styles.placeholderTitle, { color: theme.textSecondary }]}>
            Espacio Publicitario
          </Text>
          <Text style={[styles.placeholderText, { color: theme.textLight }]}>
            Actualiza a una Suscripción Premium para eliminar anuncios
          </Text>
        </View>
      )}

      {adState === 'loaded' && (
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
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
    paddingVertical: 10,
  },
  // Recorta el anuncio si supera la altura máxima deseada
  containerOverflow: {
    overflow: 'hidden',
  },
  placeholderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
  },
  placeholderTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  placeholderText: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 15,
  },
  adHidden: {
    // display:'none' oculta el componente NATIVO por completo,
    // garantizando que no ocupe NINGUNA altura en el layout mientras
    // no haya un anuncio cargado. Sigue montado para poder cargar.
    display: 'none',
  },
  adVisible: {
    width: '100%',
    // Altura máxima del anuncio adaptativo (ajústala a tu gusto).
    // El exceso se recorta con el overflow:hidden del contenedor.
    maxHeight: 90,
    overflow: 'hidden',
  },
  disclaimer: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});