import React, { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../services/authService';
import { handleError } from '../../utils/errorHandler';

const NewRequest = () => {
  const { currentUser } = useAuth();
  const [requestData, setRequestData] = useState({ title: '', description: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    if (!requestData.title.trim() || !requestData.description.trim()) {
      setError('All fields are required.');
      return;
    }

    try {
      await addDoc(collection(db, 'requests'), {
        ...requestData,
        userId: currentUser.uid,
        status: 'pending',
        type: 'exception', // Exception requests submitted by accepted employees
        createdAt: new Date().toISOString()
      });
      setMessage('Request submitted successfully.');
      setRequestData({ title: '', description: '' });
    } catch (err) {
      setError(handleError(err));
    }
  };

  return (
    <div className="container">
      <h2>New Exception Request</h2>
      {error && <p className="error">{error}</p>}
      {message && <p>{message}</p>}
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Request Title"
          value={requestData.title}
          onChange={(e) => setRequestData({ ...requestData, title: e.target.value })}
          required
        />
        <textarea
          placeholder="Request Description"
          value={requestData.description}
          onChange={(e) => setRequestData({ ...requestData, description: e.target.value })}
          required
        ></textarea>
        <button type="submit">Submit Exception Request</button>
      </form>
    </div>
  );
};

export default NewRequest;
