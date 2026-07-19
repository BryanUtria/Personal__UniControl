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
      "@react-native-google-signin/google-signin"
    ]
  };
};
