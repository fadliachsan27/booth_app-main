// Firebase app + Firestore instance, shared by the kiosk UI.
//
// Config comes from firebase.config.json at the repo root (safe to commit —
// a Firebase Web API key is not a secret; access is controlled by Firestore
// Security Rules, not by hiding this file). The same file is read by
// agent/index.cjs (Node) so the kiosk and the local DSLR/printer agent always
// point at the same project.

import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase.config.json";

export const firebaseReady = !!(firebaseConfig as FirebaseOptions).projectId;

export const firebaseApp = getApps().length
  ? getApps()[0]!
  : initializeApp(firebaseConfig as FirebaseOptions);

// long-polling avoids WebChannel issues behind some proxies/tunnels
export const db = initializeFirestore(firebaseApp, {
  experimentalAutoDetectLongPolling: true,
});
