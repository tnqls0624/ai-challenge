import { cert, getApps, initializeApp, type App, type AppOptions } from 'firebase-admin/app';

const FIREBASE_APP_NAME = 'dont-worry-api';

export type FirebaseAdminSettings = {
  clientEmail: string | undefined;
  privateKey: string | undefined;
  projectId: string;
};

export function getOrCreateFirebaseAdminApp(settings: FirebaseAdminSettings): App {
  const existing = getApps().find((app) => app.name === FIREBASE_APP_NAME);
  if (existing !== undefined) return existing;

  const options: AppOptions = {
    projectId: settings.projectId,
  };
  if (settings.clientEmail !== undefined && settings.privateKey !== undefined) {
    options.credential = cert({
      clientEmail: settings.clientEmail,
      privateKey: settings.privateKey.replaceAll('\\n', '\n'),
      projectId: settings.projectId,
    });
  }

  return initializeApp(options, FIREBASE_APP_NAME);
}
