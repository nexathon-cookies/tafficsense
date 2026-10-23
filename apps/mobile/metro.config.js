const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.watchFolders = [
  __dirname,
  path.resolve(__dirname, "../../packages/shared"),
];
config.resolver.blockList = [
  /\/node_modules\/react-native\/ReactAndroid\/.*/,
];

module.exports = config;
