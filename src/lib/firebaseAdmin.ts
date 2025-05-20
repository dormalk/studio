import admin from 'firebase-admin';

// Ensure your service account key JSON is correctly sourced.
// It's recommended to use environment variables for this.
// Create a .env.local file in your project root with these variables:
// FIREBASE_PROJECT_ID=your-project-id
// FIREBASE_CLIENT_EMAIL=your-service-account-client-email
// FIREBASE_PRIVATE_KEY=your-service-account-private-key (ensure newlines are handled, e.g. by replacing \n with actual newlines)

if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('FIREBASE_PRIVATE_KEY environment variable is not set.');
    }
    if (!process.env.FIREBASE_PROJECT_ID) {
      throw new Error('FIREBASE_PROJECT_ID environment variable is not set.');
    }
    if (!process.env.FIREBASE_CLIENT_EMAIL) {
      throw new Error('FIREBASE_CLIENT_EMAIL environment variable is not set.');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Replace \\n with actual newlines if your private key has them
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      // databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseio.com` // If you use Realtime Database
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error) {
    // Type assertion for better error handling
    const typedError = error as Error;
    console.error('Firebase Admin SDK initialization error:', typedError.message);
    // Optionally, rethrow or handle more gracefully depending on your application needs
    // For now, we log it. Critical functionalities might fail if Admin SDK is not initialized.
  }
}

// Export firestore instance from admin SDK
const firestoreAdmin = admin.firestore();
const authAdmin = admin.auth();

export { admin, firestoreAdmin, authAdmin };
