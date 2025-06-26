// File: src/components/NewExceptionRequestPopup.js
import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import './NewExceptionRequestPopup.css';

import { useAuth } from '../../services/authService';
import { db } from '../../services/firebase';

const NewExceptionRequestPopup = ({ onClose, onSuccess }) => {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please enter a title for your request.');
      return;
    }
    if (!body.trim()) {
      setError('Please provide some details about your request.');
      return;
    }
    if (!currentUser) {
      setError('No authenticated user found.');
      return;
    }

    try {
      setSubmitting(true);
      await addDoc(collection(db, 'requests'), {
        type: 'exception_request',
        userId: currentUser.uid,
        title,
        body,
        createdAt: serverTimestamp()
      });
      // On success
      onSuccess();
    } catch (err) {
      console.error('Error creating exception request:', err);
      setError('Error creating your request. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="popup-overlay">
      <div className="popup-content">
        <h2>Create Exception Request</h2>
        {error && <p className="popup-error">{error}</p>}

        <form onSubmit={handleSubmit} className="popup-form">
          <label htmlFor="titleField">Title</label>
          <input
            id="titleField"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting}
          />

          <label htmlFor="bodyField">Description / Details</label>
          <textarea
            id="bodyField"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={submitting}
          />

          <div className="popup-buttons">
            <button
              type="button"
              className="cancel-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="submit-btn"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewExceptionRequestPopup;