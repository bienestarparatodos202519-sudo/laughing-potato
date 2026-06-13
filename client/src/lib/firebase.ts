import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const missingFirebaseKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const isFirebaseConfigured = missingFirebaseKeys.length === 0;

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : undefined;

export const auth = app ? getAuth(app) : undefined;
export const db = app ? getFirestore(app) : undefined;

export async function signInWithGoogleDrive() {
  if (!auth) {
    throw new Error("Firebase no esta configurado.");
  }

  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/drive.file");
  provider.setCustomParameters({
    prompt: "consent",
    access_type: "online",
  });

  const credential = await signInWithPopup(auth, provider);
  const googleCredential = GoogleAuthProvider.credentialFromResult(credential);

  if (!googleCredential?.accessToken) {
    throw new Error("Google no devolvio el token OAuth de Drive. Revisa los scopes autorizados.");
  }

  sessionStorage.setItem("googleDriveAccessToken", googleCredential.accessToken);
  return {
    user: credential.user,
    accessToken: googleCredential.accessToken,
  };
}

export async function signOut() {
  sessionStorage.removeItem("googleDriveAccessToken");
  if (auth) {
    await firebaseSignOut(auth);
  }
}

export function getCachedDriveAccessToken() {
  return sessionStorage.getItem("googleDriveAccessToken");
}
