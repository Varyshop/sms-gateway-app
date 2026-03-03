const { withPlugins } = require('@expo/config-plugins');

/**
 * Config plugin for SimManager module.
 * Permissions are already declared in app.config.js
 */
function withSimManager(config) {
  return config;
}

module.exports = withSimManager;
