
import { NextResponse } from 'next/server';
import { firestoreAdmin, authAdmin } from '@/lib/firebaseAdmin';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore'; // Alias to be clear
import bcrypt from 'bcryptjs';
import type { Role } from '@/types'; // SoldierProfileData type not strictly needed for the object literal here

export async function POST(request: Request) {
  try {
    const { soldierId, fullName, name, divisionId, password } = await request.json();
    const actualName = fullName || name;

    if (!soldierId || !actualName || !divisionId || !password) {
      return NextResponse.json({ error: 'כל השדות נדרשים להרשמה' }, { status: 400 });
    }

    const soldierDocRef = firestoreAdmin.collection('soldiers').doc(soldierId);
    const soldierDocSnap = await soldierDocRef.get();

    if (soldierDocSnap.exists) {
      return NextResponse.json(
        { error: 'משתמש עם מספר אישי זה כבר רשום', errorType: 'USER_ALREADY_EXISTS' }, 
        { status: 409 }
      );
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const now = AdminTimestamp.now(); // Use aliased AdminTimestamp for clarity
    const defaultRoles: Role[] = ['ROLE_SOLDIER'];

    try {
      await authAdmin.createUser({
        uid: soldierId, 
        displayName: actualName,
        email: `${soldierId}@tzahal.app`, 
        emailVerified: true, 
      });
      console.log(`Firebase Auth user created for UID: ${soldierId}`);
    } catch (authError: any) {
      if (authError.code === 'auth/uid-already-exists') {
        console.warn(`Firebase Auth user with UID ${soldierId} already exists.`);
      } else if (authError.code === 'auth/email-already-exists') {
         return NextResponse.json({ error: 'שגיאה: כתובת המייל הנגזרת מהמספר האישי כבר קיימת במערכת האימות.' }, { status: 409 });
      } else {
        console.error("Error creating Firebase Auth user:", authError);
        throw authError; 
      }
    }

    // This object is directly for firestoreAdmin.set()
    // It uses AdminTimestamp (now) which is fine for the Admin SDK.
    // SoldierProfileData type (with client Timestamps) is for client-side representation.
    const newSoldierDataObject = {
      soldierId, 
      name: actualName, 
      divisionId,
      hashedPassword, 
      roles: defaultRoles, 
      createdAt: now, // now is admin.firestore.Timestamp
      lastLoginAt: now, // now is admin.firestore.Timestamp
      isActive: true,   
      email: `${soldierId}@tzahal.app`,
    };

    await soldierDocRef.set(newSoldierDataObject);
    console.log(`New soldier registered in Firestore with soldierId: ${soldierId}, roles: ${defaultRoles.join(', ')}`);

    return NextResponse.json(
        { message: 'Soldier registered successfully.', soldierId: soldierId },
        { status: 201 }
    );

  } catch (error: any) {
    console.error("Custom Register API error:", error.message, error.stack);
    if (error.code && error.code.startsWith('auth/')) {
        return NextResponse.json({ error: `שגיאת אימות: ${error.message}` }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error. Please try again later.' }, { status: 500 });
  }
}
