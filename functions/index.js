// functions/index.js
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// v2 triggers + errors
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();
const db = admin.firestore();

// secrets
const BREVO_USER = defineSecret('BREVO_SMTP_USER');
const BREVO_PASS = defineSecret('BREVO_SMTP_PASS');
const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_PASS = defineSecret('GMAIL_PASS');

async function makeTransporter(useGmail = true) {
  const user = useGmail ? await GMAIL_USER.value() : await BREVO_USER.value();
  const pass = useGmail ? await GMAIL_PASS.value() : await BREVO_PASS.value();
  return nodemailer.createTransport({
    service: useGmail ? 'gmail' : 'smtp',
    host: useGmail ? null : 'smtp-relay.brevo.com',
    port: useGmail ? null : 587,
    auth: { user, pass },
  });
}

// ─── sendVerificationCode ─────────────────────────────────────────────────────
exports.sendVerificationCode = onCall(
  { secrets: [GMAIL_USER, GMAIL_PASS] },
  async (req) => {
    const email = (req.data?.email || '').toLowerCase();
    if (!email) {
      throw new HttpsError('invalid-argument', 'Email is required');
    }

    // Generate a unique code for this email
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 10 * 60e3)
    );
    
    // Store the code using email as the document ID for non-registered users
    // or user ID for registered users
    const userSnap = await db
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    
    const docId = userSnap.empty ? email : userSnap.docs[0].id;
    
    await db
      .collection('email_verification_codes')
      .doc(docId)
      .set({ 
        code, 
        expiresAt,
        email // Store email with the code for easier lookup
      });

    // Send the code
    const transporter = await makeTransporter(true);
    try {
      await transporter.sendMail({
        from: `"Unison" <${await GMAIL_USER.value()}>`,
        to: email,
        subject: 'Your verification code',
        html: `<p>Your code is <strong>${code}</strong>. Expires in 10 minutes.</p>`
      });
    } catch (err) {
      console.error('Failed to send email:', err);
      throw new HttpsError('internal', 'Failed to send email');
    }

    return { success: true };
  }
);

// ─── verifyCode ───────────────────────────────────────────────────────────────
exports.verifyCode = onCall(
  { secrets: [] },
  async (req) => {
    const email = (req.data?.email || '').toLowerCase();
    const code = req.data?.code;
    if (!email || !code) {
      throw new HttpsError('invalid-argument', 'Email and code are required');
    }

    // Look up the user to determine which ID to use for code retrieval
    const userSnap = await db
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    
    const docId = userSnap.empty ? email : userSnap.docs[0].id;
    
    // Fetch stored code
    const codeRef = db.collection('email_verification_codes').doc(docId);
    const codeDoc = await codeRef.get();
    
    if (!codeDoc.exists) {
      throw new HttpsError('not-found', 'No code to verify');
    }
    
    const { code: stored, expiresAt } = codeDoc.data();
    
    if (Date.now() > expiresAt.toMillis()) {
      await codeRef.delete();
      throw new HttpsError('deadline-exceeded', 'Code expired');
    }
    
    if (code !== stored) {
      throw new HttpsError('invalid-argument', 'Incorrect code');
    }

    await codeRef.delete();
    return { success: true };
  }
);

// ─── createAuthUser ───────────────────────────────────────────────────────────
exports.createAuthUser = onCall(
  { secrets: [] },
  async (req) => {
    const email = (req.data?.email || '').toLowerCase();
    const password = req.data?.password;
    if (!email || !password) {
      throw new HttpsError('invalid-argument', 'Email and password are required');
    }
    if (password.length < 6) {
      throw new HttpsError('invalid-argument', 'Password must be ≥ 6 chars');
    }

    try {
      // Check if user exists in Auth
      try {
        await admin.auth().getUserByEmail(email);
        throw new HttpsError('already-exists', 'User already exists in authentication');
      } catch (error) {
        // If error code is auth/user-not-found, that's what we want
        if (error.code !== 'auth/user-not-found') {
          throw error;
        }
      }

      // Create new Auth user
      const userRecord = await admin.auth().createUser({ 
        email, 
        password,
        emailVerified: true // Since we verified with OTP
      });

      return { 
        success: true,
        uid: userRecord.uid
      };
    } catch (err) {
      console.error('Create auth user error:', err);
      throw new HttpsError(
        'internal', 
        err.message || 'Failed to create user'
      );
    }
  }
);

// ─── sendJobApplicationEmails ─────────────────────────────────────────────────
exports.sendJobApplicationEmails = onDocumentCreated(
  'requests/{requestId}',
  { secrets: [BREVO_USER, BREVO_PASS] },
  async (event) => {
    const data = event.data?.data();
    if (!data || data.type !== 'job_application') {
      return null;
    }
    const { email, fullName } = data;
    if (!email) return null;

    const transporter = await makeTransporter(false);
    try {
      await transporter.sendMail({
        from: await BREVO_USER.value(),
        to: email,
        subject: 'Thank you for your application',
        text: `Dear ${fullName},\n\nWe've received your application.`,
        html: `<p>Dear ${fullName},<br>Thanks for applying! We'll be in touch soon.</p>`
      });
    } catch (err) {
      console.error('Email send error:', err);
    }

    return { success: true };
  }
);