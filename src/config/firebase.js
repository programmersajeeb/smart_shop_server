const admin = require("firebase-admin");

function initFirebase() {
  if (admin.apps.length) return admin;

  const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "")
    .replace(/\\n/g, "\n")
    .trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  const storageBucket = String(process.env.FIREBASE_STORAGE_BUCKET || "").trim();

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    ...(storageBucket ? { storageBucket } : {}),
  });

  return admin;
}

module.exports = initFirebase;