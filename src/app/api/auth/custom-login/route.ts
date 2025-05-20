
import { NextResponse } from 'next/server';
import { authAdmin, firestoreAdmin } from '@/lib/firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const { soldierId, password } = await request.json();

    if (!soldierId || !password) {
      return NextResponse.json({ error: 'מספר אישי וסיסמה נדרשים' }, { status: 400 });
    }

    // 1. Fetch soldier record from Firestore using `soldierId`.
    const soldierDocRef = firestoreAdmin.collection('soldiers').doc(soldierId);
    const soldierDocSnap = await soldierDocRef.get();

    if (!soldierDocSnap.exists) {
      return NextResponse.json({ error: 'חייל עם מספר אישי זה לא נמצא' }, { status: 404 });
    }

    const soldierData = soldierDocSnap.data();
    if (!soldierData) {
        // Should not happen if soldierDocSnap.exists is true, but good for type safety
        return NextResponse.json({ error: 'שגיאה בטעינת נתוני החייל' }, { status: 500 });
    }

    const hashedPassword = soldierData.hashedPassword;
    if (!hashedPassword) {
      return NextResponse.json({ error: 'שגיאה: לא נמצאה סיסמה עבור משתמש זה. פנה למנהל.' }, { status: 500 });
    }

    // 2. Compare the provided `password` with the `hashedPassword`.
    const isPasswordValid = await bcrypt.compare(password, hashedPassword);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'סיסמה שגויה' }, { status: 401 });
    }

    // 3. If credentials are valid, mint a custom token.
    // The UID for the custom token is the soldierId, as this is what Firebase Auth user was created with.
    const customToken = await authAdmin.createCustomToken(soldierId);
    console.log(`Custom token generated for soldierId: ${soldierId}`);

    // 4. Update lastLoginAt timestamp.
    await soldierDocRef.update({ lastLoginAt: Timestamp.now() });
    console.log(`Updated lastLoginAt for soldierId: ${soldierId}`);

    // 5. Respond with the custom token.
    return NextResponse.json({ token: customToken, soldierId: soldierId }, { status: 200 });

  } catch (error: any) {
    console.error("Custom Login API error:", error.message, error.stack);
    return NextResponse.json({ error: 'Internal Server Error. Please try again later.' }, { status: 500 });
  }
}

// --- Client-Side Usage Notes (from your snippet) ---
// 1. Client sends PLAIN TEXT password over HTTPS.
// 2. Make a POST request to \`/api/auth/custom-login\` with:
//    {
//      "soldierId": "existing_soldier_id",
//      "password": "plain_text_password"
//    }
// 3. After receiving the token, client uses Firebase Client SDK to sign in:
//    signInWithCustomToken(auth, token).then(...)
