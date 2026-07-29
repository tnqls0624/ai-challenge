'use client';

import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig).every(
    (value) => typeof value === 'string' && value.length > 0,
  );
}

export function getGuardianFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase web configuration is missing');
  }
  return getApps().length === 0 ? initializeApp(requireFirebaseConfig()) : getApp();
}

export function getGuardianAuth(): Auth {
  return getAuth(getGuardianFirebaseApp());
}

function requireFirebaseConfig(): FirebaseOptions {
  const { apiKey, appId, authDomain, messagingSenderId, projectId } = firebaseConfig;
  if (
    apiKey === undefined ||
    appId === undefined ||
    authDomain === undefined ||
    messagingSenderId === undefined ||
    projectId === undefined
  ) {
    throw new Error('Firebase web configuration is missing');
  }
  return {
    apiKey,
    appId,
    authDomain,
    messagingSenderId,
    projectId,
  };
}
