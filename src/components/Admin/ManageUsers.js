import React, { useState } from 'react';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { generateUniqueId } from '../../utils/generateId';

const ManageUsers = () => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('hr');
  const [bulkCSV, setBulkCSV] = useState('');
  const [message, setMessage] = useState('');

  const addUser = async (userEmail, userRole) => {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', userEmail));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      let existingRole = null;
      let existingDocId = null;
      querySnapshot.forEach((docSnap) => {
        existingRole = docSnap.data().role;
        existingDocId = docSnap.id;
      });
      if (existingRole !== userRole) {
        const confirmReplace = window.confirm(
          `Email ${userEmail} is already registered as ${existingRole}. Do you want to replace it?`
        );
        if (confirmReplace) {
          await deleteDoc(doc(db, 'users', existingDocId));
          const newId = generateUniqueId();
          await setDoc(doc(db, 'users', newId), {
            email: userEmail,
            role: userRole,
            uniqueId: newId,
            createdAt: new Date().toISOString()
          });
          setMessage(`Replaced ${userEmail} registered as ${existingRole} with role ${userRole}.`);
        } else {
          setMessage(`Skipped ${userEmail} as it is already registered as ${existingRole}.`);
        }
      } else {
        setMessage(`Email ${userEmail} is already registered as ${userRole}.`);
      }
    } else {
      const newId = generateUniqueId();
      await setDoc(doc(db, 'users', newId), {
        email: userEmail,
        role: userRole,
        uniqueId: newId,
        createdAt: new Date().toISOString()
      });
      setMessage(`Added ${userEmail} as ${userRole}.`);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    await addUser(email, role);
    setEmail('');
    setRole('hr');
  };

  const handleCSVUpload = async (e) => {
    e.preventDefault();
    const lines = bulkCSV.split('\n').filter(line => line.trim() !== '');
    for (let line of lines) {
      const [userEmail, userRole] = line.split(',').map(item => item.trim());
      if (userEmail && userRole) {
        await addUser(userEmail, userRole);
      }
    }
    setBulkCSV('');
  };

  return (
    <div>
      <h2>Manage HR/IT/Admin Users</h2>
      <p>
        Instructions: Use the form below to manually add new HR, IT, or Admin user emails.
        Alternatively, paste CSV content (one record per line in the format <code>email,role</code>)
        in the bulk upload area. If an email already exists with a different role, you will be alerted and given the option to replace it.
      </p>
      
      <h3>Manual Entry</h3>
      <form onSubmit={handleManualSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="hr">HR</option>
          <option value="it">IT</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit">Add User</button>
      </form>

      <h3>Bulk CSV Upload</h3>
      <form onSubmit={handleCSVUpload}>
        <textarea
          placeholder="Enter CSV content: email,role per line"
          value={bulkCSV}
          onChange={(e) => setBulkCSV(e.target.value)}
          rows="5"
          cols="50"
        ></textarea>
        <br />
        <button type="submit">Upload CSV</button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
};

export default ManageUsers;
