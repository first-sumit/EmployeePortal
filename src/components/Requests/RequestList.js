import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../services/authService';
import { handleError } from '../../utils/errorHandler';

const RequestList = () => {
  const { currentUser, role } = useAuth();
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    // Employees see only their requests; HR/admin see all requests.
    const q = role === 'employee' ? query(collection(db, 'requests'), where('userId', '==', currentUser.uid))
      : collection(db, 'requests');

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs = [];
      snapshot.forEach((doc) => {
        reqs.push({ id: doc.id, ...doc.data() });
      });
      setRequests(reqs);
    }, (err) => {
      setError(handleError(err));
    });

    return () => unsubscribe();
  }, [currentUser, role]);

  return (
    <div className="container">
      <h2>My Requests</h2>
      {error && <p className="error">{error}</p>}
      <ul>
        {requests.map((req) => (
          <li key={req.id}>
            <strong>{req.title}</strong> - {req.status}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RequestList;
