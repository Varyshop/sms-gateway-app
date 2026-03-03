const { withPlugins } = require('@expo/config-plugins');

/**
 * Config plugin for DirectSms module
 * This module doesn't need any additional native configuration beyond what's
 * already in expo-module.config.json, but we need this file for Expo to recognize
 * it as a valid plugin.
 */
function withDirectSms(config) {
  return config;
}

module.exports = withDirectSms;
