const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      // Remover cabeceras de seguridad estrictas que bloquean el popup de Google Auth en Web
      res.removeHeader('Cross-Origin-Opener-Policy');
      res.removeHeader('Cross-Origin-Embedder-Policy');
      
      const originalSetHeader = res.setHeader;
      res.setHeader = function (name, value) {
        if (
          name.toLowerCase() === 'cross-origin-opener-policy' ||
          name.toLowerCase() === 'cross-origin-embedder-policy'
        ) {
          return;
        }
        return originalSetHeader.apply(this, arguments);
      };

      return middleware(req, res, next);
    };
  },
};

module.exports = config;
