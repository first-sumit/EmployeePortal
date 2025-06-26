/* eslint-disable react/prop-types */
import React, { useState, useEffect } from 'react';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { FaFileAlt } from 'react-icons/fa';
import './AdminDashboard.css';

/* ────────────────────────── constants ────────────────────────── */
const db            = getFirestore();
const funcs         = getFunctions();
const deleteAuth    = httpsCallable(funcs, 'deleteUserByUid');

const MAX_FILE_SIZE = 100 * 1024 * 1024;                 // 100 MB
const EMAIL_REGEX   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const REQUIRED_COLS = ['email', 'fullname', 'role'];
const ALLOWED_ROLES = ['hr', 'it', 'admin', 'employee'];

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

/* ───────────────────────── helpers ───────────────────────────── */
const formatDate = timestamp => {
  const d = new Date(timestamp.seconds * 1000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const formatDateTime = timestamp => {
  const d  = new Date(timestamp.seconds * 1000);
  const hr = d.getHours() % 12 || 12;
  const mn = String(d.getMinutes()).padStart(2, '0');
  const ap = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} at ${hr}:${mn} ${ap}`;
};

const titleCase = str => str.split('_').map(s => s[0].toUpperCase() + s.slice(1)).join(' ');

/* ───────────────────────── component ─────────────────────────── */
export default function AdminDashboard() {

  /* ───────────── state ───────────── */
  const [users, setUsers]     = useState([]);
  const [userMap, setUserMap] = useState({});
  const [requests, setRequests] = useState([]);

  const [tab, setTab] = useState('users');

  /* Add Modal */
  const [showAdd, setShowAdd] = useState(false);
  const [indUser, setIndUser] = useState({ email: '', fullName: '', role: 'hr' });
  const [bulkFile, setBulkFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [infoMsg, setInfoMsg] = useState('');
  const [errMsg, setErrMsg]   = useState('');

  /* User Modal */
  const [showUserModal, setShowUserModal] = useState(false);
  const [userDetail, setUserDetail]       = useState(null);
  const [isEditing, setIsEditing]         = useState(false);
  const [editName, setEditName]           = useState('');
  const [editRole, setEditRole]           = useState('');
  const [hasChanges, setHasChanges]       = useState(false);

  /* Delete Confirm */
  const [deleteTarget, setDeleteTarget] = useState(null);

  /* Request Modal */
  const [showReqModal, setShowReqModal] = useState(false);
  const [reqDetail, setReqDetail]       = useState(null);

  /* ───────────── load data once ───────────── */
  useEffect(() => {
    (async () => {
      /* users */
      const uSnap = await getDocs(collection(db, 'users'));
      const uList = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(uList);
      setUserMap(Object.fromEntries(uList.map(u => [u.id, u])));

      /* requests */
      const rSnap = await getDocs(collection(db, 'requests'));
      const rList = rSnap.docs.map(d => {
        const data = d.data();
        const u    = uList.find(x => x.id === data.userId) || {};
        return {
          id: d.id,
          ...data,
          displayName : u.fullName || 'Unknown',
          displayEmail: u.email    || '—'
        };
      });
      setRequests(rList);
    })();
  }, []);

  /* track edit changes */
  useEffect(() => {
    setHasChanges(
      editName.trim() !== userDetail?.fullName ||
      editRole         !== userDetail?.role
    );
  }, [editName, editRole, userDetail]);

  /* clear error after 5 s */
  useEffect(() => {
    if (errMsg) {
      const t = setTimeout(() => setErrMsg(''), 5000);
      return () => clearTimeout(t);
    }
  }, [errMsg]);

  /* ───────────── utility functions ───────────── */
  const resetMessages = () => { setErrMsg(''); setInfoMsg(''); };

  const isValidEmail = email => EMAIL_REGEX.test(email);

  /* upsert user doc (never create Auth) */
  const upsertUserDoc = async ({ email, fullName, role }) => {
    await setDoc(
      doc(db, 'users', email),
      {
        email,
        fullName,
        role: role.toLowerCase(),
        status: 'neverLoggedIn',
        createdAt: serverTimestamp()
      },
      { merge: true }
    );
  };

  /* quick file validation */
  const quickValidateFile = async file => {
    if (!file)            return { ok: false, err: 'No file selected' };
    if (file.size > MAX_FILE_SIZE)
      return { ok: false, err: 'File exceeds 100 MB' };
    if (!file.name.match(/\.csv$|\.xlsx?$/i))
      return { ok: false, err: 'Only CSV or XLSX supported' };

    /* read first row / headers */
    try {
      let headers;
      if (file.name.toLowerCase().endsWith('.csv')) {
        headers = await new Promise((res, rej) =>
          Papa.parse(file, {
            header: true,
            preview: 1,
            complete: r => res(r.meta.fields.map(f => f.toLowerCase())),
            error: rej
          })
        );
      } else {
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, { type: 'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        headers   = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0 })[0]
                     .map(h => String(h).toLowerCase());
      }
      for (const col of REQUIRED_COLS)
        if (!headers.includes(col)) return { ok: false, err: `Missing "${col}" column` };
      if (headers.some(h => !REQUIRED_COLS.includes(h)))
        return { ok: false, err: 'Extra columns not allowed' };
      return { ok: true };
    } catch {
      return { ok: false, err: 'Unreadable file' };
    }
  };

  /* handle new file */
  const handleFile    = async f => {
    resetMessages();
    const v = await quickValidateFile(f);
    if (!v.ok) { setErrMsg(v.err); setBulkFile(null); return; }
    setBulkFile(f);
  };

  /* add single */
  const handleSingleAdd = async e => {
    e.preventDefault();
    resetMessages();
    if (!isValidEmail(indUser.email))          { setErrMsg('Invalid email');     return; }
    if (!indUser.fullName.trim())              { setErrMsg('Name required');     return; }
    setBusy(true);
    await upsertUserDoc(indUser);
    setInfoMsg('1 user added. They can now log in with their email and will create a password at first login.');
    setIndUser({ email: '', fullName: '', role: 'hr' });
    setBusy(false);
  };

  /* bulk add */
  const handleBulkAdd = async () => {
    resetMessages();
    if (!bulkFile) return;
    setBusy(true);
    try {
      let rows = [];
      if (bulkFile.name.toLowerCase().endsWith('.csv')) {
        rows = await new Promise((res, rej) =>
          Papa.parse(bulkFile, {
            header: true,
            skipEmptyLines: true,
            complete: r => res(r.data),
            error: rej
          })
        );
      } else {
        const buf = await bulkFile.arrayBuffer();
        const wb  = XLSX.read(buf, { type: 'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        rows      = XLSX.utils.sheet_to_json(ws);
      }
      let added = 0;
      for (const r of rows) {
        const email    = r.email    || r.Email    || '';
        const fullName = r.fullName || r.fullname || r.FullName || '';
        const role     = (r.role || r.Role || '').toLowerCase();
        if (!email || !fullName.trim() || !isValidEmail(email) ||
            !ALLOWED_ROLES.includes(role)) continue;
        await upsertUserDoc({ email, fullName, role });
        added++;
      }
      setInfoMsg(`${added} user${added !== 1 ? 's' : ''} added. They can now log in with their email and will create a password at first login.`);
      setBulkFile(null);
    } catch (e) {
      setErrMsg(e.message);
    }
    setBusy(false);
  };

  /* save user edits */
  const saveUserEdits = async () => {
    if (!hasChanges || !editName.trim()) { setErrMsg('Name cannot be blank'); return; }
    await updateDoc(doc(db, 'users', userDetail.id), {
      fullName: editName.trim(),
      role: editRole.toLowerCase()
    });
    setUsers(v => v.map(u => u.id === userDetail.id
      ? { ...u, fullName: editName.trim(), role: editRole.toLowerCase() }
      : u));
    setShowUserModal(false);
  };

  /* delete user */
  const deleteUser = async u => {
    const q = query(collection(db, 'requests'), where('userId', '==', u.id));
    const s = await getDocs(q);
    const b = writeBatch(db);
    s.forEach(d => b.delete(doc(db, 'requests', d.id)));
    b.delete(doc(db, 'users', u.id));
    await b.commit();
    await deleteAuth({ uid: u.id }).catch(() => {});
    setUsers(v => v.filter(x => x.id !== u.id));
    setRequests(v => v.filter(r => r.userId !== u.id));
    setDeleteTarget(null);
    setShowUserModal(false);
  };

  /* count subtitle */
  const subText = tab === 'users'
    ? `${users.length} users`
    : `${requests.length} applications`;

  /* ────────────────────────────── render ───────────────────────────── */
  return (
    <div className="dashboard-container">

      {/* ── header row ── */}
      <div className="top-row">
        <div className="segmented-control">
          {['users','applications'].map(t => (
            <button
              key={t}
              className={`seg-btn ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}>
              {t === 'users' ? 'Manage Users' : 'Applications'}
            </button>
          ))}
        </div>
        {tab === 'users' && (
          <button
            className="btn-add"
            onClick={() => { resetMessages(); setShowAdd(true); }}>
            + Add Users
          </button>
        )}
      </div>

      <p className="sub-info">{subText}</p>

      {/* ── USERS TABLE ── */}
      {tab === 'users' && (
        <div className="table-container">
          <table className="apple-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} onClick={() => {
                    setUserDetail(u);
                    setEditName(u.fullName);
                    setEditRole(u.role);
                    setIsEditing(false);
                    setShowUserModal(true);
                  }}>
                  <td><strong>{u.fullName}</strong></td>
                  <td>{u.email}</td>
                  <td>{u.role.toUpperCase()}</td>
                  <td>{u.createdAt ? formatDate(u.createdAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── APPLICATIONS TABLE ── */}
      {tab === 'applications' && (
        <div className="table-container">
          <table className="apple-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Type</th><th>Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {requests.map(r => {
                const st = (r.status || r.approvalStatus?.HR?.status || 'pending').toLowerCase();
                return (
                  <tr key={r.id} onClick={() => { setReqDetail(r); setShowReqModal(true); }}>
                    <td><strong>{r.displayName}</strong></td>
                    <td>{r.displayEmail}</td>
                    <td>{titleCase(r.type)}</td>
                    <td>{formatDate(r.createdAt)}</td>
                    <td><span className={`status ${st}`}>{titleCase(st)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ───────────────────────────── ADD USERS MODAL ───────────────────────────── */}
      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <button className="modal-close-icon" onClick={() => setShowAdd(false)}>
              <svg width="16" height="16"><circle cx="8" cy="8" r="8" fill="#F2F2F7"/><path d="M5 5L11 11M11 5L5 11" stroke="#6E6E73" strokeWidth="1.5"/></svg>
            </button>

            <h3>Add / Update Users</h3>
            {errMsg && <p className="error-text">{errMsg}</p>}
            {infoMsg && <p className="info-msg">{infoMsg}</p>}

            <div className="modal-content-split">
              {/* Single User */}
              <form className="add-section" onSubmit={handleSingleAdd}>
                <h4>Single User</h4>
                <input
                  placeholder="Email"
                  value={indUser.email}
                  onChange={e => setIndUser({ ...indUser, email: e.target.value })}
                />
                <input
                  placeholder="Full Name"
                  value={indUser.fullName}
                  onChange={e => setIndUser({ ...indUser, fullName: e.target.value })}
                />
                <select
                  value={indUser.role}
                  onChange={e => setIndUser({ ...indUser, role: e.target.value })}>
                  {['hr','it','admin'].map(r => (
                    <option key={r} value={r}>{r.toUpperCase()}</option>
                  ))}
                </select>
                <button
                  className="btn btn-primary"
                  disabled={
                    busy ||
                    !(indUser.email && indUser.fullName && isValidEmail(indUser.email))
                  }>
                  {busy ? 'Please wait…' : 'Add / Update'}
                </button>
              </form>

              {/* Bulk Upload */}
              <div className="add-section">
                <h4>Bulk Upload</h4>
                <div
                  className={`file-drop-area ${dragOver ? 'drag' : ''}`}
                  onDragOver={e => e.preventDefault()}
                  onDragEnter={() => setDragOver(true)}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={async e => {
                    e.preventDefault();
                    setDragOver(false);
                    await handleFile(e.dataTransfer.files[0]);
                  }}
                  onClick={() => document.getElementById('bulk-file-input').click()}>
                  {bulkFile ? (
                    <div className="selected-file">
                      {bulkFile.name}
                      <button
                        className="remove-file"
                        onClick={e => { e.stopPropagation(); setBulkFile(null); resetMessages(); }}>
                        <svg width="12" height="12"><path d="M2 2L10 10M10 2L2 10" stroke="#6E6E73" strokeWidth="1.5"/></svg>
                      </button>
                    </div>
                  ) : (
                    'Drag & drop CSV/XLSX\n(columns: email, fullName, role)\nrole must be one of: hr, it, admin, employee\nmax 100 MB'
                  )}
                  <input
                    id="bulk-file-input"
                    hidden
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    onChange={async e => await handleFile(e.target.files[0])}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  disabled={busy || !bulkFile}
                  onClick={handleBulkAdd}>
                  {busy ? 'Processing…' : 'Import Bulk'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────── USER MODAL ───────────────────────────── */}
      {showUserModal && userDetail && (
        <div className="modal-backdrop" onClick={() => setShowUserModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <button className="modal-close-icon" onClick={() => setShowUserModal(false)}>
              <svg width="16" height="16"><circle cx="8" cy="8" r="8" fill="#F2F2F7"/><path d="M5 5L11 11M11 5L5 11" stroke="#6E6E73" strokeWidth="1.5"/></svg>
            </button>

            <h3>User Details</h3>

            <div className="req-details">
              {/* Name */}
              <div className="detail-block">
                <span className="detail-label">NAME</span>
                {isEditing ? (
                  <input
                    className="detail-input"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                ) : (
                  <div className="detail-value">{userDetail.fullName}</div>
                )}
              </div>
              {/* Email */}
              <div className="detail-block">
                <span className="detail-label">EMAIL</span>
                <div className="detail-value">{userDetail.email}</div>
              </div>
              {/* Role */}
              <div className="detail-block">
                <span className="detail-label">ROLE</span>
                {isEditing ? (
                  <div className="segmented-control small">
                    {ALLOWED_ROLES.map(r => (
                      <button
                        key={r}
                        className={`seg-btn small ${editRole === r ? 'active' : ''}`}
                        onClick={() => setEditRole(r)}>
                        {r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="detail-value">{userDetail.role.toUpperCase()}</div>
                )}
              </div>
              {/* Joined */}
              <div className="detail-block">
                <span className="detail-label">JOINED</span>
                <div className="detail-value">
                  {userDetail.createdAt ? formatDateTime(userDetail.createdAt) : '—'}
                </div>
              </div>
            </div>

            <div className="modal-footer between">
              {!isEditing ? (
                <button className="edit-btn-icon" onClick={() => setIsEditing(true)}>
                  <svg width="14" height="14" style={{ marginRight: 4 }}>
                    <path d="M2 10L2 12L4 12L10 6L8 4L2 10Z" fill="#007AFF" />
                  </svg>
                  Edit
                </button>
              ) : (
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setIsEditing(false);
                    setEditName(userDetail.fullName);
                    setEditRole(userDetail.role);
                  }}>
                  Cancel
                </button>
              )}

              {isEditing ? (
                <button
                  className="btn-save"
                  disabled={!hasChanges || !editName.trim()}
                  onClick={saveUserEdits}>
                  Save Changes
                </button>
              ) : (
                <button
                  className="delete-user-btn"
                  onClick={() => setDeleteTarget(userDetail)}>
                  Delete User
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────── CONFIRM DELETE ───────────────────────────── */}
      {deleteTarget && (
        <div className="modal-backdrop delete-confirm" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" style={{ zIndex: 1200 }} onClick={e => e.stopPropagation()}>
            <button className="modal-close-icon" onClick={() => setDeleteTarget(null)}>
              <svg width="16" height="16"><circle cx="8" cy="8" r="8" fill="#F2F2F7"/><path d="M5 5L11 11M11 5L5 11" stroke="#6E6E73" strokeWidth="1.5"/></svg>
            </button>
            <h3>Confirm Deletion</h3>
            <p>
              Delete <strong>{deleteTarget.fullName}</strong> and all data? This cannot be undone.
            </p>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="delete-user-btn" onClick={() => deleteUser(deleteTarget)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────── REQUEST MODAL ───────────────────────────── */}
      {showReqModal && reqDetail && (
        <div className="modal-backdrop" onClick={() => setShowReqModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <button className="modal-close-icon" onClick={() => setShowReqModal(false)}>
              <svg width="16" height="16"><circle cx="8" cy="8" r="8" fill="#F2F2F7"/><path d="M5 5L11 11M11 5L5 11" stroke="#6E6E73" strokeWidth="1.5"/></svg>
            </button>

            <h3>Application Details</h3>
            <div className="req-details">

              {/* basic data */}
              <div className="detail-block">
                <span className="detail-label">TYPE</span>
                <div className="detail-value">{titleCase(reqDetail.type)}</div>
              </div>
              <div className="detail-block">
                <span className="detail-label">NAME</span>
                <div className="detail-value">{reqDetail.displayName}</div>
              </div>
              <div className="detail-block">
                <span className="detail-label">EMAIL</span>
                <div className="detail-value">{reqDetail.displayEmail}</div>
              </div>
              {reqDetail.details && (
                <div className="detail-block">
                  <span className="detail-label">DETAILS</span>
                  <pre className="detail-value preformatted">{reqDetail.details}</pre>
                </div>
              )}

              {/* Resume section */}
              {reqDetail.resumeUrl && (
                <div className="detail-section">
                  <span className="detail-section-label">Resume</span>
                  <div className="file-card">
                    <div className="file-info">
                      <FaFileAlt size={20} />
                      <span className="file-name">
                        {reqDetail.resumeOriginalName ||
                         reqDetail.resumeUrl.split('/').pop().split('?')[0]}
                      </span>
                    </div>
                    <button
                      className="btn-view"
                      onClick={() => window.open(reqDetail.resumeUrl,'_blank')}>
                      View
                    </button>
                  </div>
                </div>
              )}

              {/* Additional documents */}
              {reqDetail.additionalFiles?.length > 0 && (
                <div className="detail-section">
                  <span className="detail-section-label">Additional Documents</span>
                  {reqDetail.additionalFiles.map((f, idx) => {
                    const name = f.name || f.elements?.name || 'Document';
                    const url  = f.url  || f.elements?.url;
                    return (
                      <div className="file-card" key={idx}>
                        <div className="file-info">
                          <FaFileAlt size={20} />
                          <span className="file-name">{name}</span>
                        </div>
                        <button
                          className="btn-view"
                          onClick={() => window.open(url,'_blank')}>
                          View
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
