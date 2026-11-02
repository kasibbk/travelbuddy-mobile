const fs = require("node:fs/promises");
const path = require("node:path");
const { withDangerousMod } = require("@expo/config-plugins");

const keepRule = "-keep class androidx.work.impl.WorkDatabase_Impl { <init>(); }";

module.exports = function withWorkDatabaseProguard(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const proguardPath = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "proguard-rules.pro",
      );
      const existingRules = await fs.readFile(proguardPath, "utf8");
      if (!existingRules.includes(keepRule)) {
        await fs.writeFile(proguardPath, `${existingRules.trimEnd()}\n\n${keepRule}\n`);
      }
      return config;
    },
  ]);
};
