import { initializeApp, type FirebaseApp, getApp, getApps } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { initializeFirestore, getFirestore, type Firestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCJYluhjr8zMrt6XXWPlWJQk3pw_Px7b6g",
  authDomain: "epub-speed-reader-82342.firebaseapp.com",
  projectId: "epub-speed-reader-82342",
  storageBucket: "epub-speed-reader-82342.firebasestorage.app",
  messagingSenderId: "530438954821",
  appId: "1:530438954821:web:89af49b87006e43b38a82c"
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;

try {
  // Only initialize if config is present (prevents crashing in test/dev if not set)
  if (firebaseConfig.apiKey) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);

    if (getApps().length > 0) {
      try {
        db = getFirestore(app);
      } catch (e) {
        // If getFirestore fails, it means it wasn't initialized yet
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          })
        });
      }
    } else {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    }

    storage = getStorage(app);
  }
} catch {
  console.error("Firebase initialization failed");
}

export { auth, db, storage, app };
