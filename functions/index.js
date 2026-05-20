const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

/**
 * Provision a new user account securely.
 * Triggers: Callable from IT Officer Dashboard
 */
exports.createUser = functions.https.onCall(async (data, context) => {
    // 1. Verify Requesting User is IT Officer
    if (!context.auth || context.auth.token.role !== 'IT Officer') {
        throw new functions.https.HttpsError('permission-denied', 'Unauthorized access.');
    }

    const { email, name, role, staffID, initialPassword } = data;

    try {
        // 2. Create Auth User with initial password
        const userRecord = await admin.auth().createUser({
            email,
            password: initialPassword,
            displayName: name,
        });

        // 3. Set Custom Claims (RBAC)
        await admin.auth().setCustomUserClaims(userRecord.uid, { role });

        // 4. Create Firestore Document
        await admin.firestore().collection('users').doc(userRecord.uid).set({
            email,
            name,
            role,
            staffID,
            isActive: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { uid: userRecord.uid, staffID };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Handle Audit Log Cleanup / Indexing
 */
exports.onAuditLogCreated = functions.firestore
    .document('audit_logs/{logId}')
    .onCreate(async (snap, context) => {
        const log = snap.data();
        if (log.severity === 'CRITICAL') {
            // Trigger emergency Notification (e.g. Email/SMS to Admin)
            console.log(`CRITICAL SECURITY EVENT: ${log.details}`);
        }
        return null;
    });
