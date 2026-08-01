require('dotenv').config();
const packageJson = require('./package.json');

module.exports = ({ config }) => {
  const currentVersion = process.env.VERSION || packageJson.version;
  
  // Convertir "1.0.5" en 10005 para automatizar versionCode de Android
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  const autoVersionCode = (major * 10000) + (minor * 100) + (patch || 0);

  return {
    ...config,
    version: currentVersion,
    android: {
      ...config.android,
      versionCode: autoVersionCode
    },
    plugins: [
      ...(config.plugins || []),
      "@react-native-google-signin/google-signin",
      [
        "react-native-google-mobile-ads",
        {
          androidAppId: process.env.ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713',
          iosAppId: process.env.ADMOB_IOS_APP_ID || 'ca-app-pub-3940256099942544~1458002511',
          userTrackingUsageDescription: "Esta app usa anuncios para ofrecer la versión gratuita. Los datos de uso se comparten con Google AdMob para mostrar publicidad relevante."
        }
      ],
      [
        "expo-build-properties",
        {
          android: {
            // Con react-native-google-mobile-ads 15.2.0 (play-services-ads 24.2.0)
            // el Kotlin por defecto de Expo SDK 54 (2.1.20) es compatible.
            // Ya NO es necesario forzar una versión superior de Kotlin.
          }
        }
      ]
    ]
  };
};
