// File: src/components/Dashboard/EmployeeApplicationDashboard.js

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  limit
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { db, storage } from '../../services/firebase';
import { useAuth } from '../../services/authService';
import JobApplication from '../Application/JobApplication';
import { Link } from 'react-router-dom';
import './EmployeeApplicationDashboard.css';
import { formatDate } from '../../utils/dateFormatter';
import Lottie from 'lottie-react';
import { FaChevronRight, FaChevronLeft } from 'react-icons/fa';

/** Helper to generate a 6-digit alphanumeric unique ID */
function generateUniqueRequestId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/** Fallback download function */
async function forceDownloadFile(url, fileName = 'file') {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const blobURL = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobURL;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobURL);
  } catch (err) {
    console.error('Download error:', err);
  }
}

function viewFileInNewTab(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Lottie animation for pending review */
function PendingReviewAnimation() {
  const [animationData, setAnimationData] = useState(null);
  useEffect(() => {
    fetch('/lottie/being-reviewed-animation.json')
      .then((res) => res.json())
      .then((data) => setAnimationData(data))
      .catch((err) => console.error('Error loading lottie:', err));
  }, []);
  if (!animationData) return null;
  return <Lottie animationData={animationData} loop={true} className="pending-animation" />;
}

/** Format time as "2:12 AM" */
function formatTime(dateObj) {
  let hours = dateObj.getHours();
  const minutes = dateObj.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

/** Format a timestamp (Firestore or Date) as date only, e.g., "6 April 2025" */
function formatDateOnly(ts) {
  if (!ts) return '';
  const dt = ts.toDate ? ts.toDate() : new Date(ts);
  return formatDate(dt);
}

/** Format a timestamp as full date and time, e.g., "6 April 2025 at 2:30 PM" */
function formatDateTime(ts) {
  if (!ts) return '';
  const dt = ts.toDate ? ts.toDate() : new Date(ts);
  return `${formatDate(dt)} at ${formatTime(dt)}`;
}

/** Format a JS Date as YYYY-MM-DD (for date inputs) */
function formatDateInput(jsDate) {
  const y = jsDate.getFullYear();
  const m = String(jsDate.getMonth() + 1).padStart(2, '0');
  const d = String(jsDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** AcceptedAppDetailsPopup: shows accepted application details in a popup */
function AcceptedAppDetailsPopup({ app, onClose }) {
  if (!app) return null;
  const phoneEmailCombined = `${app.phone} • ${app.email}`;
  let submittedText = '';
  if (app.createdAt) {
    const dt = app.createdAt.toDate();
    submittedText = `Submitted on ${formatDate(dt)} at ${formatTime(dt)} IST`;
  }
  return (
    <div className="popup-overlay">
      <div className="popup-content accepted-details-popup scrollable-popup">
        <button className="popup-close-btn" onClick={onClose}>×</button>
        <div className="dash-card detail-card" style={{ textAlign: 'left' }}>
          <div className="primary-text">{app.fullName}</div>
          <div className="secondary-text phone-email">{phoneEmailCombined}</div>
          {submittedText && <div className="secondary-text submitted-text">{submittedText}</div>}
          {app.details && (
            <>
              <div className="field-title" style={{ marginTop: '14px' }}>
                Additional Details
              </div>
              <p className="details-text">{app.details}</p>
            </>
          )}
          {app.resumeUrl && (
            <>
              <div className="field-title" style={{ marginTop: '14px' }}>Resume</div>
              <div className="doc-card">
                <div className="doc-icon">📄</div>
                <div className="doc-info">
                  <div className="doc-name">Resume</div>
                </div>
                <div className="doc-actions">
                  <button className="download-btn" onClick={() => viewFileInNewTab(app.resumeUrl)}>Download</button>
                </div>
              </div>
            </>
          )}
          {app.additionalFiles && app.additionalFiles.length > 0 && (
            <>
              <div className="field-title" style={{ marginTop: '14px' }}>Additional Documents</div>
              {app.additionalFiles.map((fileObj, idx) => (
                <div key={idx}>
                  <div className="doc-card">
                    <div className="doc-icon">📄</div>
                    <div className="doc-info">
                      <div className="doc-name">{fileObj.name}</div>
                    </div>
                    <div className="doc-actions">
                      <button className="download-btn" onClick={() => viewFileInNewTab(fileObj.url)}>Download</button>
                    </div>
                  </div>
                  {idx < app.additionalFiles.length - 1 && <div className="thin-divider"></div>}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** DeleteConfirmationPopup: custom popup for confirming deletions */
function DeleteConfirmationPopup({ message, onConfirm, onCancel, destructive }) {
  return (
    <div className="popup-overlay">
      <div className="popup-content scrollable-popup" style={{ maxWidth: '400px', textAlign: 'center' }}>
        <p>{message}</p>
        <div className="popup-buttons" style={{ justifyContent: 'center' }}>
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
          <button className={destructive ? 'destructive-confirm-btn' : 'submit-btn'} onClick={onConfirm}>
            Yes, Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/** FileDropzone: component to handle file uploads */
function FileDropzone({
  label,
  multiple,
  maxFiles,
  accept,
  files,
  onFilesChange,
  required,
  fieldType,
  displayAccept,
  displayLimit,
  usageNote,
  error,
  disabled
}) {
  const [dragActive, setDragActive] = useState(false);

  function isFileAllowed(file, acceptStr) {
    const ext = file.name.split('.').pop().toLowerCase();
    const acceptedTypes = acceptStr.split(',').map(s => s.trim());
    const extensionSet = new Set();
    acceptedTypes.forEach(mime => {
      switch (mime) {
        case 'application/pdf':
          extensionSet.add('pdf');
          break;
        case 'text/plain':
          extensionSet.add('txt');
          break;
        case 'image/png':
          extensionSet.add('png');
          break;
        case 'image/jpeg':
          extensionSet.add('jpeg');
          extensionSet.add('jpg');
          break;
        default:
          break;
      }
    });
    return extensionSet.has(ext);
  }

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled && files.length < maxFiles) setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (!disabled) setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (disabled) return;
    setDragActive(false);
    if (files.length >= maxFiles) return;
    const dropped = Array.from(e.dataTransfer.files);
    const valid = [];
    for (const file of dropped) {
      if (!isFileAllowed(file, accept)) {
        console.warn(`Unsupported file type: ${file.name}`);
      } else if (file.size > 10 * 1024 * 1024) {
        console.warn(`File too large: ${file.name}`);
      } else {
        valid.push(file);
      }
    }
    let newFiles = multiple ? [...files, ...valid] : valid.slice(0, 1);
    if (newFiles.length > maxFiles) newFiles = newFiles.slice(0, maxFiles);
    onFilesChange(newFiles);
  };

  const handleFileSelect = (e) => {
    if (disabled) return;
    const selected = Array.from(e.target.files);
    const valid = [];
    for (const file of selected) {
      if (!isFileAllowed(file, accept)) {
        console.warn(`Unsupported file type: ${file.name}`);
      } else if (file.size > 10 * 1024 * 1024) {
        console.warn(`File too large: ${file.name}`);
      } else {
        valid.push(file);
      }
    }
    let newFiles = multiple ? [...files, ...valid] : valid.slice(0, 1);
    if (newFiles.length > maxFiles) newFiles = newFiles.slice(0, maxFiles);
    onFilesChange(newFiles);
  };

  const removeFile = (idx) => {
    if (disabled) return;
    const updated = files.filter((_, i) => i !== idx);
    onFilesChange(updated);
  };

  const canAddMore = multiple && files.length < maxFiles;
  const showDashedArea = files.length === 0;

  return (
    <div className={`file-dropzone ${error ? 'dropzone-error' : ''}`}>
      <label className="file-dropzone-label">
        {label}{!required && <span className="optional"> (optional)</span>}
      </label>
      {usageNote && <div className="usage-note">{usageNote}</div>}
      {showDashedArea ? (
        <div
          className={`dropzone-area ${dragActive ? 'active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (!disabled && files.length < maxFiles) {
              document.getElementById(`fileInput-${fieldType}`).click();
            }
          }}
        >
          <div className="dropzone-placeholder">
            Allowed: {displayAccept}<br />{displayLimit}
          </div>
        </div>
      ) : (
        <>
          <div
            className={`dropzone-area ${dragActive && files.length < maxFiles ? 'active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => {
              if (!disabled && fieldType !== 'additional' && files.length < maxFiles) {
                document.getElementById(`fileInput-${fieldType}`).click();
              }
            }}
          >
            <div className="file-cards">
              {files.map((file, idx) => (
                <div key={idx} className="file-card">
                  <div className="file-icon">📄</div>
                  <div className="file-info">
                    <div className="file-name">{file.name}</div>
                    <div className="file-size">{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <button type="button" className="remove-file-button" onClick={() => removeFile(idx)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
          {fieldType === 'additional' && canAddMore && !disabled && (
            <button
              type="button"
              className="add-more-button"
              onClick={() => document.getElementById(`fileInput-${fieldType}`).click()}
            >
              <span className="plus-icon">➕</span> Attach More
            </button>
          )}
        </>
      )}
      <input
        id={`fileInput-${fieldType}`}
        type="file"
        style={{ display: 'none' }}
        accept={accept}
        multiple={multiple}
        onChange={handleFileSelect}
      />
      {error && <div className="field-error-message">{error}</div>}
    </div>
  );
}

/** Helper to upload a file to Firebase Storage */
async function uploadFileToStorage(file) {
  const uniqueFileName = `${generateUniqueRequestId()}-${file.name}`;
  const storagePath = `exception_files/${uniqueFileName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

/** WithdrawExceptionButton: custom button with a destructive style and custom confirmation popup */
function WithdrawExceptionButton({ request, onSuccess }) {
  const { currentUser } = useAuth();
  const [confirming, setConfirming] = useState(false);

  async function handleWithdraw() {
    if (!currentUser) return;
    if (request.additionalFiles && request.additionalFiles.length > 0) {
      for (const fileObj of request.additionalFiles) {
        if (fileObj.storagePath) {
          await deleteObject(ref(storage, fileObj.storagePath));
        }
      }
    }
    await deleteDoc(doc(db, 'requests', request.id));
    onSuccess();
  }

  if (!confirming) {
    return (
      <button
        className="withdraw-btn destructive-btn"
        style={{ marginTop: '20px' }}
        onClick={() => setConfirming(true)}
      >
        Withdraw Request
      </button>
    );
  }

  return (
    <DeleteConfirmationPopup
      message="Are you sure you want to withdraw this exception request? This action cannot be undone."
      onConfirm={async () => {
        await handleWithdraw();
        setConfirming(false);
      }}
      onCancel={() => setConfirming(false)}
      destructive
    />
  );
}

/** RequestExceptionPopup: Popup form for creating an exception request */
function RequestExceptionPopup({ onClose, onSuccess }) {
  const { currentUser } = useAuth();
  const [systems, setSystems] = useState({
    saiba: false,
    sarb: false,
    tally: false,
    otherCheck: false,
    otherText: ''
  });
  const [approvals, setApprovals] = useState({
    hr: false,
    it: false,
    both: false
  });
  const [reason, setReason] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [indefinite, setIndefinite] = useState(false);
  const [additionalFiles, setAdditionalFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({
    systems: '',
    approvals: '',
    reason: '',
    date: '',
    files: ''
  });
  const today = new Date();
  const todayStr = formatDateInput(today);

  const handleSystemsChange = (field) => {
    setSystems((prev) => {
      let updated;
      if (field === 'otherCheck') {
        updated = { ...prev, otherCheck: !prev.otherCheck };
      } else {
        updated = { ...prev, [field]: !prev[field] };
      }
      return updated;
    });
    setErrors((prev) => ({ ...prev, systems: '' }));
  };

  const handleSystemsOtherText = (val) => {
    setSystems((prev) => ({ ...prev, otherText: val }));
    setErrors((prev) => ({ ...prev, systems: '' }));
  };

  const handleApprovalsChange = (field) => {
    if (field === 'both') {
      setApprovals({ hr: false, it: false, both: !approvals.both });
    } else {
      setApprovals((prev) => ({ ...prev, both: false, [field]: !prev[field] }));
    }
    setErrors((prev) => ({ ...prev, approvals: '' }));
  };

  const handleReasonChange = (val) => {
    setReason(val);
    setErrors((prev) => ({ ...prev, reason: '' }));
  };

  const handleStartDateChange = (val) => {
    setStartDate(val);
    setErrors((prev) => ({ ...prev, date: '' }));
    if (!val) {
      setIndefinite(false);
      setEndDate('');
    }
  };

  const handleEndDateChange = (val) => {
    setEndDate(val);
    setErrors((prev) => ({ ...prev, date: '' }));
  };

  const handleIndefiniteChange = () => {
    setIndefinite(!indefinite);
    setErrors((prev) => ({ ...prev, date: '' }));
    if (!indefinite) {
      setEndDate('');
    }
  };

  function validateFields() {
    let temp = { systems: '', approvals: '', reason: '', date: '', files: '' };
    const { saiba, sarb, tally, otherCheck, otherText } = systems;
    const hasSystems = saiba || sarb || tally || otherCheck;
    if (!hasSystems) {
      temp.systems = 'Select at least one system.';
    } else if (otherCheck && !saiba && !sarb && !tally && !otherText.trim()) {
      temp.systems = 'Please specify the "Other" system.';
    }
    const { hr, it, both } = approvals;
    if (!hr && !it && !both) {
      temp.approvals = 'Select at least one approval option.';
    }
    if (!reason.trim()) {
      temp.reason = 'Please provide a reason.';
    }
    if (!startDate) {
      temp.date = 'Please select a start date.';
    } else {
      const start = new Date(startDate);
      const nowDate = new Date(todayStr);
      if (start < nowDate) {
        temp.date = 'Start date cannot be in the past.';
      } else if (!indefinite && !endDate) {
        temp.date = 'Please select an end date or choose "No End Date".';
      } else if (!indefinite && endDate) {
        const end = new Date(endDate);
        if (end < start) {
          temp.date = 'End date cannot be before start date.';
        }
      }
    }
    return temp;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      setErrors((prev) => ({ ...prev, reason: 'No authenticated user found.' }));
      return;
    }
    const valErr = validateFields();
    setErrors(valErr);
    if (Object.values(valErr).some((msg) => msg)) return;
    try {
      setSubmitting(true);
      const systemsNeeded = [];
      if (systems.saiba) systemsNeeded.push('SAIBA');
      if (systems.sarb) systemsNeeded.push('SARB');
      if (systems.tally) systemsNeeded.push('Tally');
      if (systems.otherCheck && systems.otherText.trim()) {
        systemsNeeded.push(systems.otherText.trim());
      }
      const approvalStatus = {
        HR: {
          required: approvals.both || approvals.hr,
          status: 'pending',
          decisionBy: null,
          lastUpdated: approvals.both || approvals.hr ? serverTimestamp() : null
        },
        IT: {
          required: approvals.both || approvals.it,
          status: 'pending',
          decisionBy: null,
          lastUpdated: approvals.both || approvals.it ? serverTimestamp() : null
        }
      };
      const uniqueRequestId = generateUniqueRequestId();
      let uploadedFiles = [];
      if (additionalFiles.length > 0) {
        for (const file of additionalFiles) {
          const fileData = await uploadFileToStorage(file);
          uploadedFiles.push({
            name: file.name,
            url: fileData.url,
            storagePath: fileData.storagePath
          });
        }
      }
      await addDoc(collection(db, 'requests'), {
        type: 'exception_request',
        userId: currentUser.uid,
        systemsNeeded,
        approvalStatus,
        reason,
        startDate: startDate ? new Date(startDate) : null,
        endDate: !indefinite && endDate ? new Date(endDate) : null,
        uniqueId: uniqueRequestId,
        additionalFiles: uploadedFiles,
        createdAt: serverTimestamp()
      });
      onSuccess();
    } catch (err) {
      console.error('Error creating exception request:', err);
      setErrors((prev) => ({
        ...prev,
        reason: 'Error creating request. Please try again.'
      }));
      setSubmitting(false);
    }
  };

  const indefiniteDisabled = !startDate || submitting;
  const endDateDisabled = indefinite || !startDate || submitting;

  return (
    <div className="popup-overlay">
      <div className="popup-content scrollable-popup">
        <button className="popup-close-btn" onClick={onClose}>×</button>
        <h2 style={{ marginBottom: '16px' }}>Request an Exception</h2>
        <form onSubmit={handleSubmit} className="popup-form">
          <label className="form-section-label">Requested System(s)</label>
          <div className={`checkboxes-row ${errors.systems ? 'field-error' : ''}`}>
            <label>
              <input type="checkbox" checked={systems.saiba} onChange={() => handleSystemsChange('saiba')} disabled={submitting} />
              SAIBA
            </label>
            <label>
              <input type="checkbox" checked={systems.sarb} onChange={() => handleSystemsChange('sarb')} disabled={submitting} />
              SARB
            </label>
            <label>
              <input type="checkbox" checked={systems.tally} onChange={() => handleSystemsChange('tally')} disabled={submitting} />
              Tally
            </label>
            <label>
              <input type="checkbox" checked={systems.otherCheck} onChange={() => handleSystemsChange('otherCheck')} disabled={submitting} />
              Other
            </label>
            {systems.otherCheck && (
              <input type="text" placeholder="Specify system" value={systems.otherText} onChange={(e) => handleSystemsOtherText(e.target.value)} disabled={submitting} className={errors.systems ? 'field-error' : ''} />
            )}
          </div>
          {errors.systems && <div className="field-error-message">{errors.systems}</div>}
          <label className="form-section-label">Approval Required from</label>
          <div className={`checkboxes-row ${errors.approvals ? 'field-error' : ''}`}>
            <label>
              <input type="checkbox" checked={approvals.hr} onChange={() => handleApprovalsChange('hr')} disabled={submitting || approvals.both} />
              HR
            </label>
            <label>
              <input type="checkbox" checked={approvals.it} onChange={() => handleApprovalsChange('it')} disabled={submitting || approvals.both} />
              IT
            </label>
            <label>
              <input type="checkbox" checked={approvals.both} onChange={() => handleApprovalsChange('both')} disabled={submitting} />
              Both
            </label>
          </div>
          {errors.approvals && <div className="field-error-message">{errors.approvals}</div>}
          <label className="form-section-label">Reason for Exception Request</label>
          <textarea placeholder="Explain your justification..." value={reason} onChange={(e) => handleReasonChange(e.target.value)} disabled={submitting} className={errors.reason ? 'field-error' : ''} />
          {errors.reason && <div className="field-error-message">{errors.reason}</div>}
          <label className="form-section-label">Requested Duration of Access</label>
          <div className={`date-row ${errors.date ? 'field-error' : ''}`}>
            <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} disabled={submitting} min={todayStr} className="date-input" />
            <span className="date-sep">to</span>
            <input type="date" value={endDate} onChange={(e) => handleEndDateChange(e.target.value)} disabled={endDateDisabled} min={startDate || todayStr} className="date-input" />
            <label>
              <input type="checkbox" checked={indefinite} onChange={handleIndefiniteChange} disabled={indefiniteDisabled} />
              <span style={{ marginLeft: '4px' }}>No End Date</span>
            </label>
          </div>
          {errors.date && <div className="field-error-message">{errors.date}</div>}
          <FileDropzone
            label="Additional Files"
            multiple={true}
            maxFiles={3}
            accept="application/pdf, text/plain, image/png, image/jpeg"
            files={additionalFiles}
            onFilesChange={setAdditionalFiles}
            required={false}
            fieldType="additional"
            displayAccept="PDF, TXT, PNG, JPEG, JPG"
            displayLimit="Up to 3 files, Max 10 MB each."
            usageNote="Attach any supporting documents if needed."
            error={errors.files}
            disabled={submitting}
          />
          <div className="popup-buttons" style={{ marginTop: '20px' }}>
            <button type="button" className="cancel-btn" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="submit-btn" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** ResignationRequestPopup: Popup form for submitting a resignation request */
function ResignationRequestPopup({ onClose, onSuccess }) {
  const { currentUser } = useAuth();
  const [reason, setReason] = useState('Personal');
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const [resignationType, setResignationType] = useState('Voluntary');
  const [noticeAcknowledged, setNoticeAcknowledged] = useState(false);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({ lastWorkingDay: '', notice: '' });
  const today = new Date();
  const todayStr = formatDateInput(today);

  function validateFields() {
    let temp = { lastWorkingDay: '', notice: '' };
    if (!lastWorkingDay) {
      temp.lastWorkingDay = 'Please select your proposed last working day.';
    } else if (new Date(lastWorkingDay) < today) {
      temp.lastWorkingDay = 'Last working day cannot be in the past.';
    }
    if (!noticeAcknowledged) {
      temp.notice = 'You must acknowledge your notice period as per company policy.';
    }
    return temp;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const valErr = validateFields();
    setErrors(valErr);
    if (Object.values(valErr).some((msg) => msg)) return;
    try {
      setSubmitting(true);
      const q = query(
        collection(db, 'requests'),
        where('type', '==', 'resignation'),
        where('userId', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const latestDoc = snap.docs[0].data();
        const hrStatus = latestDoc.approvalStatus?.HR?.status;
        if (hrStatus === 'pending') {
          setErrors((prev) => ({
            ...prev,
            lastWorkingDay: 'Cannot submit a new resignation request because your latest one is still pending.'
          }));
          setSubmitting(false);
          return;
        }
      }
      const uniqueRequestId = generateUniqueRequestId();
      const approvalStatus = {
        HR: {
          required: true,
          status: 'pending',
          decisionBy: null,
          lastUpdated: null
        }
      };
      await addDoc(collection(db, 'requests'), {
        type: 'resignation',
        userId: currentUser.uid,
        reason,
        lastWorkingDay: new Date(lastWorkingDay),
        resignationType,
        noticeAcknowledged,
        comments,
        approvalStatus,
        uniqueId: uniqueRequestId,
        createdAt: serverTimestamp()
      });
      onSuccess();
    } catch (err) {
      console.error('Error submitting resignation request:', err);
      setSubmitting(false);
    }
  };

  return (
    <div className="popup-overlay">
      <div className="popup-content scrollable-popup">
        <button className="popup-close-btn" onClick={onClose}>×</button>
        <h2 style={{ marginBottom: '16px' }}>Submit Resignation Request</h2>
        <form onSubmit={handleSubmit} className="popup-form">
          <label className="form-section-label">Reason for Resignation</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} disabled={submitting}>
            <option value="Personal">Personal</option>
            <option value="Health">Health</option>
            <option value="Better Opportunity">Better Opportunity</option>
            <option value="Higher Studies">Higher Studies</option>
            <option value="Other">Other</option>
          </select>
          <label className="form-section-label">Last Working Day (Proposed)</label>
          <input
            type="date"
            value={lastWorkingDay}
            onChange={(e) => setLastWorkingDay(e.target.value)}
            disabled={submitting}
            min={todayStr}
            className="date-input"
          />
          {errors.lastWorkingDay && <div className="field-error-message">{errors.lastWorkingDay}</div>}
          <label className="form-section-label">Resignation Type</label>
          <select value={resignationType} onChange={(e) => setResignationType(e.target.value)} disabled={submitting}>
            <option value="Voluntary">Voluntary</option>
            <option value="Forced/Termination">Forced/Termination</option>
            <option value="Retirement">Retirement</option>
            <option value="Probation Dropout">Probation Dropout</option>
          </select>
          <label className="form-section-label">
            <input type="checkbox" checked={noticeAcknowledged} onChange={(e) => setNoticeAcknowledged(e.target.checked)} disabled={submitting} />
            <span style={{ marginLeft: '4px' }}>
              I acknowledge my notice period as per company policy.
            </span>
          </label>
          {errors.notice && <div className="field-error-message">{errors.notice}</div>}
          <label className="form-section-label">Comments (Optional)</label>
          <textarea placeholder="Additional comments or feedback..." value={comments} onChange={(e) => setComments(e.target.value)} disabled={submitting} />
          <div className="popup-buttons" style={{ marginTop: '20px' }}>
            <button type="button" className="cancel-btn" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** ResignationRequestsDashboard: lists and displays resignation requests */
function ResignationRequestsDashboard({ onBackHome }) {
  const { currentUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReq, setSelectedReq] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  const fetchRequests = async () => {
    if (!currentUser) {
      setRequests([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'requests'),
      where('type', '==', 'resignation'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      setRequests([]);
      setLoading(false);
      return;
    }
    let arr = [];
    snap.forEach(docSnap => {
      arr.push({ id: docSnap.id, ...docSnap.data() });
    });
    setRequests(arr);
    setLoading(false);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchRequests();
      setLoading(false);
    };
    loadData();
  }, [currentUser]);

  // Eligibility for submitting a new resignation request
  let canSubmitNew = true;
  let infoMessage = '';
  if (requests.length > 0) {
    const latest = requests[0];
    if (latest.approvalStatus?.HR?.status === 'pending') {
      canSubmitNew = false;
      infoMessage = 'A decision must be made on your latest request before submitting a new one.';
    }
  }

  const deleteResignationRequest = async (request) => {
    try {
      if (request.additionalFiles && request.additionalFiles.length > 0) {
        for (const fileObj of request.additionalFiles) {
          if (fileObj.storagePath) {
            await deleteObject(ref(storage, fileObj.storagePath));
          }
        }
      }
      await deleteDoc(doc(db, 'requests', request.id));
      await fetchRequests();
      setSelectedReq(null);
    } catch (err) {
      console.error('Error deleting resignation request:', err);
    }
  };

  if (loading) {
    return (
      <div className="employee-dash-container">
        <button className="back-to-home-btn" onClick={onBackHome}>
          <FaChevronLeft className="left-chevron-icon" /> Home
        </button>
        <h2 className="page-subtitle">Your Resignation Requests</h2>
        <p>Loading...</p>
      </div>
    );
  }

  if (selectedReq) {
    let submittedLine = '';
    if (selectedReq.createdAt) {
      submittedLine = `${formatDateTime(selectedReq.createdAt)}`;
    }
    const hrStatusObj = selectedReq.approvalStatus?.HR;
    const canWithdraw =
      hrStatusObj?.status === 'pending' &&
      !hrStatusObj?.decisionBy &&
      !hrStatusObj?.lastUpdated;
  
    return (
      <div className="employee-dash-container">
        <button className="back-to-home-btn" onClick={() => setSelectedReq(null)}>
          <FaChevronLeft className="left-chevron-icon" /> Requests
        </button>
        <h2 className="page-subtitle">Resignation Request Detail</h2>
        <div className="dash-card detail-card" style={{ textAlign: 'left' }}>
          {/* New Unique ID row */}
          <div className="info-row">
            <div className="info-label"><strong>Request ID:</strong></div>
            <div className="info-value">{selectedReq.uniqueId}</div>
          </div>
          <div className="info-row">
            <div className="info-label"><strong>Reason for Resignation:</strong></div>
            <div className="info-value">{selectedReq.reason}</div>
          </div>
          <div className="info-row">
            <div className="info-label"><strong>Last Working Day:</strong></div>
            <div className="info-value">
              {selectedReq.lastWorkingDay
                ? formatDateOnly(selectedReq.lastWorkingDay)
                : 'No End Date'}
            </div>
          </div>
          <div className="info-row">
            <div className="info-label"><strong>Resignation Type:</strong></div>
            <div className="info-value">{selectedReq.resignationType}</div>
          </div>
          <div className="info-row">
            <div className="info-label"><strong>Notice Period Acknowledgement:</strong></div>
            <div className="info-value">
              {selectedReq.noticeAcknowledged ? 'Yes' : 'No'}
            </div>
          </div>
          {submittedLine && (
            <div className="info-row">
              <div className="info-label"><strong>Date Submitted:</strong></div>
              <div className="info-value">{submittedLine}</div>
            </div>
          )}
          {selectedReq.comments && (
            <div className="info-row">
              <div className="info-label"><strong>Comments:</strong></div>
              <div className="info-value">{selectedReq.comments}</div>
            </div>
          )}
          {hrStatusObj?.status && (
            <div className="info-row" style={{ marginTop: '16px' }}>
              <div className="info-label"><strong>HR Approval Status:</strong></div>
              <div className="info-value">{hrStatusObj.status}</div>
            </div>
          )}
          {canWithdraw ? (
            <div style={{ marginTop: '20px' }}>
              <button
                className="withdraw-btn destructive-btn"
                onClick={() => setShowWithdrawConfirm(true)}
              >
                Withdraw Request
              </button>
            </div>
          ) : (
            <p className="secondary-text" style={{ marginTop: '20px', color: '#888' }}>
              Request cannot be withdrawn as it has been updated by department(s).
            </p>
          )}
        </div>
        {showWithdrawConfirm && (
          <DeleteConfirmationPopup
            message="Are you sure you want to withdraw this resignation request? This action cannot be undone."
            onConfirm={async () => {
              if (currentUser) {
                if (selectedReq.additionalFiles && selectedReq.additionalFiles.length > 0) {
                  for (const fileObj of selectedReq.additionalFiles) {
                    if (fileObj.storagePath) {
                      await deleteObject(ref(storage, fileObj.storagePath));
                    }
                  }
                }
                await deleteDoc(doc(db, 'requests', selectedReq.id));
                setShowWithdrawConfirm(false);
                await fetchRequests();
                setSelectedReq(null);
              }
            }}
            onCancel={() => setShowWithdrawConfirm(false)}
            destructive
          />
        )}
      </div>
    );
  }

  return (
    <div className="employee-dash-container">
      <button className="back-to-home-btn" onClick={onBackHome}>
        <FaChevronLeft className="left-chevron-icon" /> Home
      </button>
      <h2 className="page-subtitle">Your Resignation Requests</h2>
      {requests.length === 0 ? (
        <p>No resignation requests found.</p>
      ) : (
        <div className="apps-list">
          {requests.map((req) => {
            let dateStr = req.createdAt ? formatDateOnly(req.createdAt) : '';
            const subLine = `${dateStr} • ${req.approvalStatus?.HR?.status || 'N/A'}`;
            return (
              <button
                key={req.id}
                className="app-card"
                onClick={() => setSelectedReq(req)}
              >
                <div className="app-card-content">
                  <div className="app-card-primary">{req.reason}</div>
                  <div className="app-card-secondary">{subLine}</div>
                </div>
                <div className="app-card-chevron">
                  <FaChevronRight />
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="reapply-action">
        {canSubmitNew ? (
          <button
            className="light-gray-request-btn"
            onClick={() => setShowPopup(true)}
          >
            <span className="plus-icon">➕</span> Submit New Resignation Request
          </button>
        ) : (
          <p className="reapply-note">{infoMessage}</p>
        )}
      </div>
      {showPopup && (
        <ResignationRequestPopup
          onClose={() => setShowPopup(false)}
          onSuccess={async () => {
            setShowPopup(false);
            await fetchRequests();
          }}
        />
      )}
    </div>
  );
}

/** AcceptedHome: Home view for accepted job applications with extra cards */
function AcceptedHome({ app, onShowExceptions, onShowResignations }) {
  const [showDetailsPopup, setShowDetailsPopup] = useState(false);
  if (!app) return <div>No accepted application found.</div>;
  return (
    <div className="employee-dash-container">
      <div className="title-row-left">
        <div className="title-accent"></div>
        <h2 className="page-subtitle">Welcome, {app.fullName}</h2>
      </div>
      <div className="secondary-text phone-email" style={{ marginBottom: '16px' }}>
        {app.email}
      </div>
      <div className="home-single-card">
        <button className="home-card-button" onClick={() => setShowDetailsPopup(true)}>
          <div className="home-card-content">
            <div className="home-card-title">Show Application Details</div>
          </div>
          <div className="home-card-chevron"><FaChevronRight /></div>
        </button>
        <button className="home-card-button" onClick={onShowExceptions}>
          <div className="home-card-content">
            <div className="home-card-title">Exception Requests</div>
          </div>
          <div className="home-card-chevron"><FaChevronRight /></div>
        </button>
        <button className="home-card-button" onClick={onShowResignations}>
          <div className="home-card-content">
            <div className="home-card-title">Resignation</div>
          </div>
          <div className="home-card-chevron"><FaChevronRight /></div>
        </button>
      </div>
      {showDetailsPopup && (
        <AcceptedAppDetailsPopup app={app} onClose={() => setShowDetailsPopup(false)} />
      )}
    </div>
  );
}

/** Main EmployeeApplicationDashboard component */
const EmployeeApplicationDashboard = () => {
  const { currentUser } = useAuth();
  const [applications, setApplications] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [nextDate, setNextDate] = useState(null);
  const [showExceptionRequests, setShowExceptionRequests] = useState(false);
  const [exceptionRequests, setExceptionRequests] = useState([]);
  const [selectedExceptionRequest, setSelectedExceptionRequest] = useState(null);
  const [exceptionEligible, setExceptionEligible] = useState(false);
  const [nextExceptionEligibleDate, setNextExceptionEligibleDate] = useState(null);
  const [showNewExceptionPopup, setShowNewExceptionPopup] = useState(false);
  const [showResignations, setShowResignations] = useState(false);

  const refetchApps = async () => {
    if (!currentUser) {
      setApplications([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'requests'),
      where('type', '==', 'job_application'),
      where('userId', '==', currentUser.uid)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      setApplications([]);
      setLoading(false);
      return;
    }
    let apps = [];
    snap.forEach(docSnap => {
      apps.push({ id: docSnap.id, ...docSnap.data() });
    });
    apps.sort((a, b) => {
      const tA = a.createdAt?.toDate?.() || 0;
      const tB = b.createdAt?.toDate?.() || 0;
      return tB - tA;
    });
    setApplications(apps);
    const newest = apps[0];
    let newEligible = false;
    let newNextDate = null;
    if (newest && (newest.status === 'pending' || newest.status === 'rejected')) {
      const createdAt = newest.createdAt?.toDate?.();
      if (createdAt) {
        const now = new Date();
        const diffDays = (now - createdAt) / (1000 * 3600 * 24);
        if (diffDays >= 14) {
          newEligible = true;
        } else {
          newNextDate = new Date(createdAt.getTime() + 14 * 24 * 3600 * 1000);
        }
      }
    }
    setEligible(newEligible);
    setNextDate(newNextDate);
    setLoading(false);
  };

  const fetchExceptionRequests = async () => {
    if (!currentUser) {
      setExceptionRequests([]);
      return;
    }
    const q = query(
      collection(db, 'requests'),
      where('type', '==', 'exception_request'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      setExceptionRequests([]);
      setExceptionEligible(true);
      return;
    }
    let arr = [];
    snap.forEach(docSnap => {
      arr.push({ id: docSnap.id, ...docSnap.data() });
    });
    setExceptionRequests(arr);
    const newest = arr[0];
    if (newest && newest.createdAt) {
      const createdAt = newest.createdAt.toDate();
      const now = new Date();
      const diffHours = (now - createdAt) / (1000 * 3600);
      if (diffHours >= 24) {
        setExceptionEligible(true);
      } else {
        setExceptionEligible(false);
        setNextExceptionEligibleDate(new Date(createdAt.getTime() + 24 * 3600 * 1000));
      }
    } else {
      setExceptionEligible(true);
    }
  };

  let exceptionEligibilityMessage = '';
  if (nextExceptionEligibleDate) {
    const now = new Date();
    if (formatDate(now) === formatDate(nextExceptionEligibleDate)) {
      exceptionEligibilityMessage = "You can submit a new request today after 6:10 PM.";
    } else {
      exceptionEligibilityMessage = `You can submit a new request after ${formatDate(nextExceptionEligibleDate)} at 6:10 PM.`;
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await refetchApps();
      setLoading(false);
    };
    loadData();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="employee-dash-container">
        <div className="dash-loading">Loading...</div>
      </div>
    );
  }

  const acceptedApps = applications.filter(a => a.status === 'accepted');
  if (acceptedApps.length > 0) {
    if (showExceptionRequests) {
      return (
        <div className="employee-dash-container">
          {!selectedExceptionRequest ? (
            <button className="back-to-home-btn" onClick={() => {
              setShowExceptionRequests(false);
              setSelectedExceptionRequest(null);
            }}>
              <FaChevronLeft className="left-chevron-icon" /> Home
            </button>
          ) : (
            <button className="back-to-home-btn" onClick={() => setSelectedExceptionRequest(null)}>
              <FaChevronLeft className="left-chevron-icon" /> Requests
            </button>
          )}
          <h2 className="page-subtitle">Your Exception Requests</h2>
          {selectedExceptionRequest ? (
            <div className="dash-card detail-card" style={{ textAlign: 'left' }}>
              <h3>
                {selectedExceptionRequest.systemsNeeded
                  ? selectedExceptionRequest.systemsNeeded.join(', ')
                  : 'No Technologies Selected'}
              </h3>
              {selectedExceptionRequest.createdAt && (
                <div className="secondary-text submitted-text">
                  {`Submitted on ${formatDateOnly(selectedExceptionRequest.createdAt)}`}
                </div>
              )}
              <p className="details-text" style={{ marginTop: '16px' }}>
                <strong>Reason:</strong> {selectedExceptionRequest.reason}<br />
                <strong>Start Date:</strong>{' '}
                {selectedExceptionRequest.startDate
                  ? formatDateOnly(selectedExceptionRequest.startDate)
                  : 'N/A'}<br />
                <strong>End Date:</strong>{' '}
                {selectedExceptionRequest.endDate
                  ? formatDateOnly(selectedExceptionRequest.endDate)
                  : 'No End Date'}
              </p>
              {selectedExceptionRequest.additionalFiles &&
                selectedExceptionRequest.additionalFiles.length > 0 && (
                  <>
                    <div className="field-title" style={{ marginTop: '14px' }}>Attached Files</div>
                    {selectedExceptionRequest.additionalFiles.map((fileObj, idx) => (
                      <div key={idx}>
                        <div className="doc-card">
                          <div className="doc-icon">📄</div>
                          <div className="doc-info">
                            <div className="doc-name">{fileObj.name}</div>
                          </div>
                          <div className="doc-actions">
                            <button className="download-btn" onClick={() => viewFileInNewTab(fileObj.url)}>
                              Download
                            </button>
                          </div>
                        </div>
                        {idx < selectedExceptionRequest.additionalFiles.length - 1 && (
                          <div className="thin-divider"></div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              {selectedExceptionRequest.approvalStatus && (
                <div className="approval-status-section" style={{ marginTop: '14px' }}>
                  <div className="field-title">Department Status</div>
                  {Object.entries(selectedExceptionRequest.approvalStatus).map(([dept, details]) => {
                    if (!details.required) return null;
                    return (
                      <div key={dept}>
                        <strong>{dept}</strong>: {details.status}
                        {details.decisionBy ? ` - Decision by: ${details.decisionBy}` : ''}
                        {details.decisionBy && details.lastUpdated ? ` (Last updated: ${formatDateTime(details.lastUpdated)})` : ''}
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedExceptionRequest.approvalStatus &&
                !selectedExceptionRequest.approvalStatus.HR.decisionBy &&
                !selectedExceptionRequest.approvalStatus.IT?.decisionBy ? (
                  <WithdrawExceptionButton
                    request={selectedExceptionRequest}
                    onSuccess={async () => {
                      setSelectedExceptionRequest(null);
                      await fetchExceptionRequests();
                    }}
                  />
                ) : (
                  <p className="secondary-text" style={{ marginTop: '20px', color: '#888' }}>
                    Request cannot be withdrawn as it has been updated by department(s).
                  </p>
                )}
            </div>
          ) : (
            <>
              {exceptionRequests.length === 0 ? (
                <p>No exception requests yet.</p>
              ) : (
                <div className="apps-list">
                  {exceptionRequests.map(req => {
                    let dateLine = req.createdAt ? formatDateOnly(req.createdAt) : '';
                    let hrPortion = req.approvalStatus?.HR?.required ? `HR: ${req.approvalStatus.HR.status || 'N/A'}` : '';
                    let itPortion = req.approvalStatus?.IT?.required ? `IT: ${req.approvalStatus.IT.status || 'N/A'}` : '';
                    let subLine = hrPortion && itPortion
                      ? `${dateLine} • ${hrPortion} • ${itPortion}`
                      : hrPortion
                      ? `${dateLine} • ${hrPortion}`
                      : itPortion
                      ? `${dateLine} • ${itPortion}`
                      : dateLine;
                    let titleLine = req.systemsNeeded ? req.systemsNeeded.join(', ') : 'No Technologies Selected';
                    return (
                      <button
                        key={req.id}
                        className="app-card"
                        onClick={() => setSelectedExceptionRequest(req)}
                      >
                        <div className="app-card-content">
                          <div className="app-card-primary">{titleLine}</div>
                          <div className="app-card-secondary">{subLine}</div>
                        </div>
                        <div className="app-card-chevron">
                          <FaChevronRight />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="reapply-action">
                {exceptionEligible ? (
                  <button
                    className="light-gray-request-btn"
                    onClick={() => setShowNewExceptionPopup(true)}
                  >
                    <span className="plus-icon">➕</span> New Exception Request
                  </button>
                ) : (
                  nextExceptionEligibleDate && (
                    <p className="reapply-note">
                      {(() => {
                        if (formatDate(new Date()) === formatDate(nextExceptionEligibleDate)) {
                          return 'You can submit a new request today after 6:10 PM.';
                        } else {
                          return `You can submit a new request after ${formatDate(nextExceptionEligibleDate)} at 6:10 PM.`;
                        }
                      })()}
                    </p>
                  )
                )}
              </div>
              {showNewExceptionPopup && (
                <RequestExceptionPopup
                  onClose={() => setShowNewExceptionPopup(false)}
                  onSuccess={async () => {
                    setShowNewExceptionPopup(false);
                    await fetchExceptionRequests();
                  }}
                />
              )}
            </>
          )}
        </div>
      );
    }

    if (showResignations) {
      return (
        <ResignationRequestsDashboard onBackHome={() => setShowResignations(false)} />
      );
    }

    const newestAccepted = acceptedApps[0];
    return (
      <AcceptedHome
        app={newestAccepted}
        onShowExceptions={async () => {
          setShowExceptionRequests(true);
          await fetchExceptionRequests();
        }}
        onShowResignations={() => setShowResignations(true)}
      />
    );
  }

  // If no accepted application, follow job application flow.
  if (showForm) {
    return (
      <div className="employee-dash-container">
        <div className="title-row-left">
          <div className="title-accent"></div>
          <h2 className="page-subtitle">Submit New Job Application</h2>
        </div>
        <JobApplication
          onSubmissionSuccess={async () => {
            await refetchApps();
            setShowForm(false);
            setSelectedApp(null);
          }}
        />
      </div>
    );
  }
  if (applications.length === 0) {
    return (
      <div className="employee-dash-container">
        <div className="title-row-left">
          <div className="title-accent"></div>
          <h2 className="page-subtitle">Submit Job Application</h2>
        </div>
        <JobApplication onSubmissionSuccess={async () => { await refetchApps(); }} />
      </div>
    );
  }
  if (selectedApp) {
    const phoneEmailCombined = `${selectedApp.phone} • ${selectedApp.email}`;
    let submittedText = '';
    if (selectedApp.createdAt) {
      submittedText = `Submitted on ${formatDate(selectedApp.createdAt.toDate())} at ${formatTime(selectedApp.createdAt.toDate())} IST`;
    }
    return (
      <div className="employee-dash-container">
        <div className="title-row-left">
          <div className="title-accent"></div>
          <h2 className="page-subtitle">Application Detail</h2>
        </div>
        {selectedApp.status === 'pending' && (
          <div className="status-block" style={{ textAlign: 'center' }}>
            <PendingReviewAnimation />
            <p className="status-text">
              Thank you for applying! Your application is being carefully reviewed.
            </p>
          </div>
        )}
        {selectedApp.status === 'rejected' && (
          <div className="status-block">
            <p className="status-text rejected">
              Unfortunately, we are unable to offer you a position at this moment.
            </p>
          </div>
        )}
        {selectedApp.status === 'accepted' && (
          <div className="status-block">
            <p className="status-text accepted">Application Accepted</p>
          </div>
        )}
        <div className="dash-card detail-card" style={{ textAlign: 'left' }}>
          <div className="primary-text">{selectedApp.fullName}</div>
          <div className="secondary-text phone-email">{phoneEmailCombined}</div>
          {submittedText && <div className="secondary-text submitted-text">{submittedText}</div>}
          {selectedApp.details && (
            <>
              <div className="field-title" style={{ marginTop: '14px' }}>
                Additional Details
              </div>
              <p className="details-text">{selectedApp.details}</p>
            </>
          )}
          {selectedApp.resumeUrl && (
            <>
              <div className="field-title" style={{ marginTop: '14px' }}>Resume</div>
              <div className="doc-card">
                <div className="doc-icon">📄</div>
                <div className="doc-info">
                  <div className="doc-name">Resume</div>
                </div>
                <div className="doc-actions">
                  <button className="download-btn" onClick={() => viewFileInNewTab(selectedApp.resumeUrl)}>
                    Download
                  </button>
                </div>
              </div>
            </>
          )}
          {selectedApp.additionalFiles && selectedApp.additionalFiles.length > 0 && (
            <>
              <div className="field-title" style={{ marginTop: '14px' }}>Additional Documents</div>
              {selectedApp.additionalFiles.map((fileObj, idx) => (
                <div key={idx}>
                  <div className="doc-card">
                    <div className="doc-icon">📄</div>
                    <div className="doc-info">
                      <div className="doc-name">{fileObj.name}</div>
                    </div>
                    <div className="doc-actions">
                      <button className="download-btn" onClick={() => viewFileInNewTab(fileObj.url)}>
                        Download
                      </button>
                    </div>
                  </div>
                  {idx < selectedApp.additionalFiles.length - 1 && <div className="thin-divider"></div>}
                </div>
              ))}
            </>
          )}
        </div>
        <button className="back-button" onClick={() => setSelectedApp(null)}>
          Back to Applications
        </button>
      </div>
    );
  }
  return (
    <div className="employee-dash-container">
      <div className="title-row-left">
        <div className="title-accent"></div>
        <h2 className="page-subtitle">My Applications</h2>
      </div>
      <div className="apps-list">
        {applications.map(app => {
          const dt = app.createdAt?.toDate?.() || new Date();
          const dateStr = formatDate(dt);
          return (
            <button key={app.id} className="app-card" onClick={() => setSelectedApp(app)}>
              <div className="app-card-content">
                <div className="app-card-primary">{dateStr}</div>
                <div className="app-card-secondary">{app.uniqueId} • {app.status}</div>
              </div>
              <div className="app-card-chevron"><FaChevronRight /></div>
            </button>
          );
        })}
      </div>
      {eligible ? (
        <div className="reapply-action">
          <button onClick={() => { setShowForm(true); setSelectedApp(null); }}>
            Submit New Application
          </button>
        </div>
      ) : (
        nextDate && (
          <p className="reapply-note">
            You can submit a new application after {formatDate(nextDate)}
          </p>
        )
      )}
    </div>
  );
};

export default EmployeeApplicationDashboard;