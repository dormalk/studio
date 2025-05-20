import admin from 'firebase-admin';

// Ensure your service account key JSON is correctly sourced.
// Option 1: From environment variables (recommended for security)
// Ensure these are set in your deployment environment and .env.local for development.
const serviceAccount = {
  type: process.env.FIREBASE_ADMIN_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_ADMIN_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_ADMIN_CLIENT_ID,
  auth_uri: process.env.FIREBASE_ADMIN_AUTH_URI,
  token_uri: process.env.FIREBASE_ADMIN_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_ADMIN_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_ADMIN_CLIENT_X509_CERT_URL,
  universe_domain: process.env.FIREBASE_ADMIN_UNIVERSE_DOMAIN,
};

// Check if all necessary service account details are present from environment variables
const hasAllServiceAccountDetails =
  serviceAccount.project_id &&
  serviceAccount.client_email &&
  serviceAccount.private_key;

if (!admin.apps.length) {
  try {
    if (hasAllServiceAccountDetails) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        // databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseio.com` // If you use Realtime Database
      });
      console.log('Firebase Admin SDK initialized successfully from environment variables.');
    } else {
      // Fallback or error if not all details are present - adjust as needed
      console.warn('Firebase Admin SDK: Not all service account details found in environment variables. Initialization might fail or use defaults.');
      // You might want to throw an error here if these are strictly required for your app to run.
      // For example:
      // throw new Error('Missing Firebase Admin SDK service account details in environment variables.');
      // For now, let's log a warning and let it try to initialize if it can, or fail.
      // If you have a local service account JSON file for development (NOT RECOMMENDED FOR PRODUCTION)
      // you could add fallback logic here, but it's better to rely on env vars.
    }
  } catch (error) {
    const typedError = error as Error;
    console.error('Firebase Admin SDK initialization error:', typedError.message, typedError.stack);
  }
}

// Export firestore instance from admin SDK
const firestoreAdmin = admin.firestore();
const authAdmin = admin.auth();

export { admin, firestoreAdmin, authAdmin };
