import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App | undefined;

/** Firebase Admin. On Cloud Run it uses the service account (ADC); locally the emulators. */
export function firebaseApp(projectId: string): App {
  if (!app) app = getApps()[0] ?? initializeApp({ projectId });
  return app;
}

/** English Detective keeps its data in its own Firestore database (default id "detective"). */
export function firestore(projectId: string, databaseId: string): Firestore {
  const db = databaseId === '(default)' ? getFirestore(firebaseApp(projectId)) : getFirestore(firebaseApp(projectId), databaseId);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    /* settings already applied */
  }
  return db;
}

/** Firebase Auth is shared with English City Simulator (same project → same accounts). */
export function adminAuth(projectId: string) {
  return getAuth(firebaseApp(projectId));
}
