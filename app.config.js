const fs = require("node:fs");
const path = require("node:path");

module.exports = ({ config }) => {
  const android = { ...config.android };
  const googleServicesFile = path.join(__dirname, "google-services.json");

  if (fs.existsSync(googleServicesFile)) {
    android.googleServicesFile = "./google-services.json";
  } else {
    delete android.googleServicesFile;
  }

  return { ...config, android };
};
