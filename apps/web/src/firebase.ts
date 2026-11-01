import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

const env = import.meta.env;
export const useAuthEmulator = env.VITE_USE_AUTH_EMULATOR === 'true';
const emulatorDefaults = useAuthEmulator && !env.VITE_FIREBASE_API_KEY;

/** Firebase Web config is public (not a secret). */
const config = {
  apiKey: emulatorDefaults ? 'fake-api-key' : (env.VITE_FIREBASE_API_KEY ?? ''),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || (emulatorDefaults ? 'demo-ed.firebaseapp.com' : 'k26game1.firebaseapp.com'),
  projectId: emulatorDefaults ? 'demo-ed' : env.VITE_FIREBASE_PROJECT_ID || 'k26game1',
  ...(env.VITE_FIREBASE_APP_ID && !emulatorDefaults ? { appId: env.VITE_FIREBASE_APP_ID } : {}),
};

export const firebaseApp = initializeApp(config);
export const auth = getAuth(firebaseApp);
if (useAuthEmulator) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
