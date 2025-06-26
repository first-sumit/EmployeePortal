// src/components/Auth/Login.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, functions } from '../../services/firebase';
import { validateEmail, validatePassword } from '../../utils/validation';
import { useAuth } from '../../services/authService';
import './Auth.css';
import CircularProgress from '@mui/material/CircularProgress';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

// ─── Error Handler ─────────────────────────────────────────────────────────────
const handleError = (error) => {
  console.error(error);
  if (typeof error === 'string') return error;
  if (error.code) {
    switch (error.code) {
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/user-not-found':
        return 'No user found with this email.';
      case 'auth/wrong-password':
        return 'Incorrect password. Try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a bit and retry.';
      case 'auth/email-already-in-use':
        return 'This email is already registered. Try logging in.';
      default:
        return error.message || 'An unexpected error occurred.';
    }
  }
  return error.message || 'An unexpected error occurred.';
};
// ────────────────────────────────────────────────────────────────────────────────
const sendCodeFn = httpsCallable(functions, 'sendVerificationCode');
const verifyCodeFn = httpsCallable(functions, 'verifyCode');
const createAuthUserFn = httpsCallable(functions, 'createAuthUser');

const Login = () => {
  const navigate = useNavigate();
  const { currentUser, role } = useAuth();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [userExists, setUserExists] = useState(false);
  const [firstLoginDone, setFirstLoginDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [otpSentCount, setOtpSentCount] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [lastCharVisible, setLastCharVisible] = useState(false);
  const lastCharTimerRef = useRef(null);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLinkSent, setResetLinkSent] = useState(false);
  const timerRef = useRef(null);
  
  // Redirect if already logged in - use the context values instead of direct onAuthStateChanged
  useEffect(() => {
    if (currentUser && role) {
      // Navigate based on user role
      switch (role) {
        case 'hr':
          navigate('/dashboard/hr');
          break;
        case 'it':
          navigate('/dashboard/it');
          break;
        case 'admin':
          navigate('/dashboard/admin');
          break;
        default:
          navigate('/dashboard/employee');
          break;
      }
    }
  }, [currentUser, role, navigate]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(lastCharTimerRef.current);
    };
  }, []);

  // OTP resend countdown
  useEffect(() => {
    if (resendTimer > 0) {
      timerRef.current = setInterval(() => {
        setResendTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [resendTimer]);

  const lookupEmail = async () => {
    setError('');
    setMessage('');
    if (!validateEmail(email)) {
      setError('Invalid email format.');
      return;
    }
    try {
      setLoading(true);
      
      // Check if user exists in Firestore
      const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        // New user - send OTP directly
        setUserExists(false);
        setFirstLoginDone(false);
        await sendOTP();
      } else {
        // Existing user
        const userData = snap.docs[0].data();
        setUserExists(true);
        setFirstLoginDone(!!userData.firstLoginDone);
        
        if (!userData.firstLoginDone) {
          // User exists but hasn't completed first login
          await sendOTP();
        } else {
          // User exists and has completed first login - go to password step
          setStep('login');
        }
      }
    } catch (e) {
      setError(handleError(e));
    } finally {
      setLoading(false);
    }
  };

  const sendOTP = async () => {
    if (otpSentCount >= 5) {
      setError('Rate limit reached. Please try again later.');
      return;
    }
    try {
      setLoading(true);
      // Send verification code to the email
      await sendCodeFn({ email: email.toLowerCase() });
      setOtpSentCount(prev => prev + 1);
      setResendTimer(60);
      setMessage('Verification code sent to your email.');
      setStep('verifyCode');
    } catch (e) {
      setError(handleError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    setMessage('');
    if (!code) {
      setError('Please enter the verification code.');
      return;
    }
    try {
      setLoading(true);
      // Verify the OTP code
      await verifyCodeFn({ email: email.toLowerCase(), code });
      
      if (!userExists) {
        // New user - collect full name
        setMessage('Code verified! Please complete your profile.');
        setStep('fullName');
      } else {
        // Existing user but first login not done
        setMessage('Code verified! Now set your password.');
        setStep('setPassword');
      }
    } catch (e) {
      setError(handleError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleFullNameSubmit = () => {
    setError('');
    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    setStep('setPassword');
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!validatePassword(password)) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    try {
      setLoading(true);
      
      if (step === 'setPassword') {
        if (!userExists) {
          // Brand new user - create auth user first
          const authResult = await createAuthUserFn({ 
            email: email.toLowerCase(), 
            password 
          });
          
          // Create Firestore document for the user
          const userRef = doc(collection(db, 'users'));
          await setDoc(userRef, {
            email: email.toLowerCase(),
            fullName: fullName || email.split('@')[0],
            role: 'employee',
            firstLoginDone: true,
            createdAt: serverTimestamp()
          });
          
          // Sign in new user
          await signInWithEmailAndPassword(auth, email.toLowerCase(), password);
        } else {
          // Existing user but first login not done
          try {
            // Try to sign in first (user might already exist in Authentication)
            await signInWithEmailAndPassword(auth, email.toLowerCase(), password);
          } catch (authError) {
            if (authError.code === 'auth/user-not-found') {
              // Create auth user if not found
              await createAuthUserFn({ 
                email: email.toLowerCase(), 
                password 
              });
              // Sign in after creation
              await signInWithEmailAndPassword(auth, email.toLowerCase(), password);
            } else {
              throw authError;
            }
          }
          
          // Update the Firestore document
          const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const userRef = doc(db, 'users', snap.docs[0].id);
            await setDoc(userRef, {
              firstLoginDone: true,
              ...(fullName ? { fullName } : {})
            }, { merge: true });
          }
        }
      } else {
        // Normal login for existing users with firstLoginDone = true
        await signInWithEmailAndPassword(auth, email.toLowerCase(), password);
      }
      // Redirect handled by useEffect with currentUser and role
    } catch (e) {
      console.error('Auth error:', e);
      setError(handleError(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = (e) => {
    const newPass = e.target.value;
    setPassword(newPass);
    clearTimeout(lastCharTimerRef.current);
    setLastCharVisible(true);
    lastCharTimerRef.current = setTimeout(() => {
      setLastCharVisible(false);
    }, 1000);
  };

  const handleForgotPassword = async () => {
    setError('');
    setMessage('');
    const emailToReset = resetEmail || email;
    if (!validateEmail(emailToReset)) {
      setError('Please enter a valid email address.');
      return;
    }
    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, emailToReset);
      setResetLinkSent(true);
      setMessage(`Password reset link sent to ${emailToReset}. Please check your inbox.`);
    } catch (e) {
      setError(handleError(e));
    } finally {
      setLoading(false);
    }
  };

  const renderResendButton = () => {
    if (resendTimer > 0) {
      return <div className="resend-timer">Resend in {resendTimer}s</div>;
    }
    return (
      <button
        onClick={sendOTP}
        className="resend-button"
        disabled={loading || otpSentCount >= 5}
      >
        {loading ? <CircularProgress size={16} /> : 'Resend Code'}
      </button>
    );
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <img
          src="/images/unison-logo.png"
          alt="Unison Logo"
          className="auth-logo"
        />
        <h2 className="auth-title">
          {step === 'email'     && 'Sign In'}
          {step === 'verifyCode'&& 'Verify Email'}
          {step === 'fullName'  && 'Complete Your Profile'}
          {step === 'setPassword'&& 'Create Password'}
          {step === 'login'     && 'Welcome Back'}
          {step === 'forgotPassword' && 'Reset Password'}
        </h2>
        {step === 'email' && (
          <p className="auth-subtitle">Enter your email to continue</p>
        )}
        {error   && <div className="auth-error">{error}</div>}
        {message && <div className="auth-message">{message}</div>}
        {/* Email Step */}
        {step === 'email' && (
          <>
            <div className="input-container">
              <input
                type="email"
                className="auth-input"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <button
              onClick={lookupEmail}
              className="auth-button"
              disabled={loading}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Continue'}
            </button>
          </>
        )}
        {/* Verify Code Step */}
        {step === 'verifyCode' && (
          <>
            <div className="input-container">
              <input
                type="email"
                className="auth-input"
                value={email}
                disabled
              />
            </div>
            <div className="input-container">
              <input
                type="text"
                className="auth-input"
                placeholder="Verification code"
                value={code}
                onChange={e => setCode(e.target.value)}
              />
            </div>
            <button
              onClick={handleVerifyCode}
              className="auth-button"
              disabled={loading}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Verify Code'}
            </button>
            {renderResendButton()}
            {otpSentCount >= 5 && (
              <div className="rate-limit-message">
                Rate limit reached. Please try again later.
              </div>
            )}
          </>
        )}
        {/* Full Name Step */}
        {step === 'fullName' && (
          <>
            <div className="input-container">
              <input
                type="text"
                className="auth-input"
                placeholder="Full Name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
              />
            </div>
            <button
              onClick={handleFullNameSubmit}
              className="auth-button"
              disabled={loading}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Continue'}
            </button>
          </>
        )}
        {/* Password / Login Step */}
        {(step === 'setPassword' || step === 'login') && (
          <form onSubmit={handlePasswordSubmit}>
            <div className="input-container">
              <input
                type="email"
                className="auth-input"
                value={email}
                disabled
              />
            </div>
            <div className="input-container password-container">
              <input
                type={showPassword ? 'text' : 'password'}
                className="auth-input"
                placeholder="Password"
                value={password}
                onChange={handlePasswordChange}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </button>
            </div>
            <button
              type="submit"
              className="auth-button"
              disabled={loading}
            >
              {loading
                ? <CircularProgress size={20} color="inherit" />
                : (step === 'setPassword' ? 'Create Password' : 'Sign In')
              }
            </button>
            {step === 'login' && (
              <button
                type="button"
                className="forgot-password-button"
                onClick={() => setStep('forgotPassword')}
              >
                Forgot Password?
              </button>
            )}
          </form>
        )}
        {/* Forgot Password Step */}
        {step === 'forgotPassword' && (
          <div>
            {!resetLinkSent ? (
              <>
                <div className="input-container">
                  <input
                    type="email"
                    className="auth-input"
                    placeholder="Enter your email address"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleForgotPassword}
                  className="auth-button"
                  disabled={loading}
                >
                  {loading ? <CircularProgress size={20} color="inherit" /> : 'Send Reset Link'}
                </button>
                <button
                  onClick={() => setStep('email')}
                  className="secondary-button"
                >
                  Back to Login
                </button>
              </>
            ) : (
              <>
                <div className="reset-success">
                  <p>Reset link sent! Check your email inbox.</p>
                  <p className="reset-tip">If you don't see it, check your spam folder.</p>
                </div>
                <button
                  onClick={() => {
                    setStep('email');
                    setResetLinkSent(false);
                  }}
                  className="auth-button"
                >
                  Back to Login
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;