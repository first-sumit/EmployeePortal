// /Users/sumitpandey/Documents/employee-portal/src/components/Auth/Register.js

import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

import { auth, db } from '../../services/firebase';
import { validateEmail, validatePassword } from '../../utils/validation';
import { handleError } from '../../utils/errorHandler';

import './Auth.css'; // Import the shared CSS file

const Register = () => {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!validateEmail(email)) {
      setError('Invalid email format.');
      return;
    }
    if (!validatePassword(password)) {
      setError('Password must be at least 6 characters.');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Save user details with default role "employee"
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        fullName,
        email,
        role: 'employee',
        createdAt: new Date().toISOString(),
      });

      setMessage('Registration successful! Redirecting...');
      setTimeout(() => {
        navigate('/dashboard/employee');
      }, 1500);
    } catch (err) {
      setError(handleError(err));
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <img
          src="/images/unison-logo.png"
          alt="Company Logo"
          className="auth-logo"
        />
        <h2 className="auth-title">Create an Account</h2>
        <p className="auth-subtitle">Fill in your details to get started</p>

        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-message">{message}</div>}

        <form onSubmit={handleSubmit}>
          <label className="auth-input-label" htmlFor="fullName">Full Name</label>
          <input
            id="fullName"
            type="text"
            className="auth-input"
            placeholder="John Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />

          <label className="auth-input-label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="auth-input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="auth-input-label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="auth-input"
            placeholder="•••••••• (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit" className="auth-button">Register</button>
        </form>

        <p className="auth-subtitle">
          Already have an account? <a href="/login" className="auth-link">Login here</a>
        </p>
      </div>
    </div>
  );
};

export default Register;