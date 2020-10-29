"use strict";

import clear from "rollup-plugin-clear";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "rollup-plugin-typescript2";
import screeps from "rollup-plugin-screeps";
import { ConfigManager } from "./ConfigManager";
import replace from "rollup-plugin-replace";

const dest = process.env.DEST;

const loadSS3Config = async () => {
  if (!dest) {
    console.log("no destination, returning empty cfg");
    return null;
  }

  // SS3 https://github.com/screepers/screepers-standards/blob/master/SS3-Unified_Credentials_File.md
  const configManager = new ConfigManager();
  const ss3 = await configManager.getConfig();

  const server = ss3 ? ss3.servers[dest] : null;

  if (!server) {
    console.log("did not find dest");
    throw new Error("Invalid upload destination");
  }

  // console.log("SS3 config found", server);

  return {
    token: server.token,
    protocol: server.secure ? "https" : "http",
    hostname: server.host,
    port: server.port || (server.secure ? 443 : 21025),
    path: server.ptr ? "/ptr" : "/",
    branch: server.sim ? "sim" : "auto",
    email: server.username,
    password: server.password
  };
};

const configPromise = new Promise((resolvePromise, rejectPromise) => {
  if (!dest) {
    console.log("No destination specified - code will be compiled but not uploaded");
  } else {
    try {
      const cfg = require("./screeps.json")[dest];
      if (cfg) {
        return Promise.resolve(cfg);
      }
    } catch (error) {}
  }

  return loadSS3Config(dest).then(cfg => {
    resolvePromise({
      input: "src/main.ts",
      output: {
        file: "dist/main.js",
        format: "cjs",
        sourcemap: true,
        intro: `const __PROFILER_ENABLED__ = ${dest === "sim" ? "false" : "true"};`
      },

      plugins: [
        replace({
          // returns 'true' if code is bundled in prod mode
          // PRODUCTION: JSON.stringify(isProduction),
          // you can also use this to include deploy-related data, such as
          // date + time of build, as well as latest commit ID from git
          __BUILD_TIME__: Date.now(),
          __REVISION__: require("git-rev-sync").short()
        }),
        clear({ targets: ["dist"] }),
        resolve(),
        commonjs(),
        typescript({ tsconfig: "./tsconfig.json" }),
        screeps({ config: cfg, dryRun: cfg == null })
      ]
    });
  });
});

export default configPromise;
