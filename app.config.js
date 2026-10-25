const fs = require("node:fs");
const path = require("node:path");

module.exports = ({ config }) => {
  const android = { ...config.android };
  const googleServicesFile = path.join(__dirname, "google-services.json");
  const plugins = [...(config.plugins ?? []), "@maplibre/maplibre-react-native"];
  const googleMapsPluginOptions = {};

  if (process.env.GOOGLE_MAPS_ANDROID_API_KEY) {
    googleMapsPluginOptions.androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  }
  if (process.env.GOOGLE_MAPS_IOS_API_KEY) {
    googleMapsPluginOptions.iosGoogleMapsApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
  }
  if (Object.keys(googleMapsPluginOptions).length > 0) {
    plugins.push(["react-native-maps", googleMapsPluginOptions]);
  }

  if (fs.existsSync(googleServicesFile)) {
    android.googleServicesFile = "./google-services.json";
  } else {
    delete android.googleServicesFile;
  }

  return { ...config, android, plugins };
};
