import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
const modulePath = resolve(root, "firebase-env.js");
const publicPath = resolve(root, "public", "firebase-config.js");

const emptyConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

function parseEnvFile(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = parseEnvFile(envPath);
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: env.VITE_FIREBASE_APP_ID || "",
};

const hasConfig = Object.values(config).every(Boolean);

writeFileSync(
  modulePath,
  `// Auto-generated from .env — run: npm run sync-config\nexport const firebaseEnv = ${JSON.stringify(config, null, 2)};\n`,
  "utf8"
);

mkdirSync(resolve(root, "public"), { recursive: true });
writeFileSync(
  publicPath,
  `window.__FIREBASE_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`,
  "utf8"
);

if (hasConfig) {
  console.log("Firebase config synced from .env");
} else {
  console.warn("Warning: .env is missing or incomplete. Firebase will not work until you add credentials.");
}
