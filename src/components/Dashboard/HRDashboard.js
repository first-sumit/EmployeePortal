import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  getDoc
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../../services/firebase';
import { handleError } from '../../utils/errorHandler';
import { FaSort, FaFilter, FaTimes, FaCheck } from 'react-icons/fa';
import './HRDashboard.css';

// ===================
// HELPER FUNCTIONS
// ===================

// Convert Firestore timestamp (or value) to JS Date
const getTimestamp = (value) => {
  if (value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return new Date(value);
};

// Format a date (only date)
const formatDate = (value) => {
  const date = getTimestamp(value);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

// Format a date and time (for submission time & last update)
const formatDateTime = (value) => {
  const date = getTimestamp(value);
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dateStr} at ${timeStr}`;
};

// Display status with first letter capitalized
const displayStatus = (status) => (status ? status.charAt(0).toUpperCase() + status.slice(1) : '');

// Fallback: extract file name from URL
const getFileNameFromUrl = (url) => {
  try {
    return url.split('/').pop().split('?')[0];
  } catch (e) {
    return "Document";
  }
};

// For sorting by name – for job applications, use app.fullName; for others, try cached user name.
const getDisplayName = (app, currentSegment, userNames) => {
  if (currentSegment === "job_applications") {
    return app.fullName || "";
  } else {
    return userNames[app.userId] || "";
  }
};

// ===================
// CUSTOM COMPONENTS
// ===================

// Confirmation Modal
const ConfirmationModal = ({ show, onClose, onConfirm, message }) => {
  if (!show) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{message}</h3>
        <div className="confirmation-actions">
          <button className="cancel-button" onClick={onClose}>Cancel</button>
          <button className="delete-button" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
};

// Custom Sort Picker (Apple‑like)
const SortPicker = ({ sortOption, setSortOption, options, defaultValue }) => {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const isDefault = sortOption === defaultValue;
  return (
    <div className="custom-picker" ref={pickerRef}>
      <button
        className={`custom-picker-button ${isDefault ? 'default' : 'active'}`}
        onClick={() => setOpen(!open)}
      >
        <FaSort className="icon" /> {options.find(o => o.value === sortOption)?.label || 'Sort'}
        {!isDefault && (
          <FaTimes className="reset-icon" onClick={(e) => { e.stopPropagation(); setSortOption(defaultValue); }} />
        )}
      </button>
      {open && (
        <div className="custom-picker-dropdown">
          {options.map(opt => (
            <div key={opt.value}
              className="custom-picker-option"
              onClick={() => { setSortOption(opt.value); setOpen(false); }}>
              <span className="checkmark">
                {sortOption === opt.value ? "✓" : ""}
              </span> 
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Custom Filter Picker (Apple‑like)
const FilterPicker = ({ filterOption, setFilterOption, options, defaultValue }) => {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const isDefault = filterOption === defaultValue;
  return (
    <div className="custom-picker" ref={pickerRef}>
      <button
        className={`custom-picker-button ${isDefault ? 'default' : 'active'}`}
        onClick={() => setOpen(!open)}
      >
        <FaFilter className="icon" /> {options.find(o => o.value === filterOption)?.label || 'Filter'}
        {!isDefault && (
          <FaTimes className="reset-icon" onClick={(e) => { e.stopPropagation(); setFilterOption(defaultValue); }} />
        )}
      </button>
      {open && (
        <div className="custom-picker-dropdown">
          {options.map(opt => (
            <div key={opt.value}
              className="custom-picker-option"
              onClick={() => { setFilterOption(opt.value); setOpen(false); }}>
              <span className="checkmark">
                {filterOption === opt.value ? "✓" : ""}
              </span>
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Segmented Control for switching views
const SegmentedControl = ({ segments, currentSegment, setCurrentSegment }) => {
  return (
    <div className="segmented-control">
      {segments.map((seg, index) => (
        <React.Fragment key={seg.value}>
          <button
            className={`segmented-button ${currentSegment === seg.value ? 'active' : ''}`}
            onClick={() => setCurrentSegment(seg.value)}
          >
            {seg.label}
          </button>
          {index < segments.length - 1 && <div className="segmented-divider"></div>}
        </React.Fragment>
      ))}
    </div>
  );
};

// Details Modal – renders different content based on segment.
const DetailsModal = ({
  show,
  onClose,
  application,
  onUpdateDecision,
  currentUserId,
  segment,
  userNames,
  userEmails
}) => {
  // Remove delete functionality and replace decision update with two action buttons.
  const [localDecision, setLocalDecision] = useState('');
  const [showDecisionConfirm, setShowDecisionConfirm] = useState(false);
  const [lastUpdatedByName, setLastUpdatedByName] = useState('');

  useEffect(() => {
    if (application) {
      const currentDecision = segment === "job_applications" ? application.status : application.approvalStatus?.HR?.status;
      setLocalDecision(currentDecision);
      if (application.lastUpdatedBy && application.lastUpdatedBy !== currentUserId) {
        const fetchUser = async () => {
          const userRef = doc(db, 'users', application.lastUpdatedBy);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            setLastUpdatedByName(userSnap.data().fullName);
          }
        };
        fetchUser();
      } else {
        setLastUpdatedByName('');
      }
    }
  }, [application, currentUserId, segment]);

  if (!show || !application) return null;

  const renderDecisionSection = () => {
    const hrApproval = application.approvalStatus?.HR;
    const lastInfo = segment === "job_applications"
      ? (application.lastUpdate && (
          <p className="last-update-info" style={{ marginTop: '8px' }}>
            Last updated on {formatDateTime(application.lastUpdate)} by {application.lastUpdatedBy === currentUserId ? 'you' : (lastUpdatedByName || 'loading...')}
          </p>
        ))
      : (hrApproval?.lastUpdated && (
          <p className="last-update-info" style={{ marginTop: '8px' }}>
            Last updated on {formatDateTime(hrApproval.lastUpdated)} by {hrApproval.decisionBy === currentUserId ? 'you' : (lastUpdatedByName || 'loading...')}
          </p>
        ));
    const decisionLocked = segment === "job_applications" ? application.status !== "pending" : hrApproval?.status !== "pending";
    return (
      <div className="decision-update">
        <label style={{ fontWeight: 'bold', display: 'block' }}>Decision:</label>
        {lastInfo}
        {(!decisionLocked) ? (
          <div className="decision-button-group" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              style={{
                flex: 1,
                backgroundColor: 'rgba(0, 128, 0, 0.1)',
                color: 'green',
                border: '1px solid green',
                borderRadius: '5px',
                padding: '10px'
              }}
              onClick={() => { setLocalDecision('accepted'); setShowDecisionConfirm(true); }}
            >
              {segment === "job_applications" ? "Accept Application" : "Accept Request"}
            </button>
            <button
              style={{
                flex: 1,
                backgroundColor: 'rgba(255, 0, 0, 0.1)',
                color: 'red',
                border: '1px solid red',
                borderRadius: '5px',
                padding: '10px'
              }}
              onClick={() => { setLocalDecision('rejected'); setShowDecisionConfirm(true); }}
            >
              {segment === "job_applications" ? "Reject Application" : "Reject Request"}
            </button>
          </div>
        ) : (
          <div style={{ marginTop: '10px', width: '100%', boxSizing: 'border-box' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f5f5f5',
                borderRadius: '5px',
                padding: '10px'
              }}
            >
              {localDecision === 'accepted' ? (
                <>
                  <FaCheck style={{ color: 'green', marginRight: '8px' }} />
                  <span style={{ color: 'green', fontWeight: 'bold' }}>Accepted</span>
                </>
              ) : (
                <>
                  <FaTimes style={{ color: 'red', marginRight: '8px' }} />
                  <span style={{ color: 'red', fontWeight: 'bold' }}>Rejected</span>
                </>
              )}
            </div>
            <div
              style={{
                textAlign: 'center',
                color: '#777',
                fontSize: '14px',
                marginTop: '6px'
              }}
            >
              Once a decision is made, it can't be changed.
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderExceptionContent = () => {
    const hrRequired = application.approvalStatus?.HR?.required;
    const itRequired = application.approvalStatus?.IT?.required;
    let approvalRequiredText = "";
    if (hrRequired && itRequired) approvalRequiredText = "HR and IT";
    else if (hrRequired) approvalRequiredText = "HR only";
    else if (itRequired) approvalRequiredText = "IT only";

    return (
      <>
        <div className="applicant-header">
          <h2>{userNames[application.userId] || application.userId}</h2>
          <p>{userEmails[application.userId] || "No Email"}</p>
          <p>{formatDateTime(application.createdAt)}</p>
        </div>
        <div className="info-section">
          <strong>Start Date:</strong> {application.startDate ? formatDate(application.startDate) : 'N/A'}
        </div>
        <div className="info-section">
          <strong>End Date:</strong> {application.endDate ? formatDate(application.endDate) : 'No End Date'}
        </div>
        <div className="info-section">
          <strong>Reason:</strong> {application.reason || 'N/A'}
        </div>
        <div className="info-section">
          <strong>Systems Needed:</strong> {application.systemsNeeded ? application.systemsNeeded.join(", ") : 'None'}
        </div>
        <div className="info-section">
          <strong>Approval Required From:</strong> {approvalRequiredText}
        </div>
        {itRequired && (
          <div className="info-section">
            <strong>IT Approval:</strong> {application.approvalStatus?.IT?.status ? displayStatus(application.approvalStatus.IT.status) : 'Pending'}
          </div>
        )}
        {application.additionalFiles && application.additionalFiles.length > 0 && (
          <div className="files-section">
            <h3>Additional Documents</h3>
            <div className="files-list">
              {application.additionalFiles.map((file, index) => (
                <div key={index} className="file-card">
                  <span className="file-name">{file.name}</span>
                  <a className="file-view-button" href={file.url} target="_blank" rel="noreferrer">
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
        {renderDecisionSection()}
      </>
    );
  };

  const renderResignationContent = () => (
    <>
      <div className="applicant-header">
        <h2>{userNames[application.userId] || application.userId}</h2>
        <p>{userEmails[application.userId] || "No Email"}</p>
        <p>{formatDateTime(application.createdAt)}</p>
      </div>
      <div className="info-section">
        <strong>Last Working Day:</strong> {application.lastWorkingDay ? formatDate(application.lastWorkingDay) : 'N/A'}
      </div>
      <div className="info-section">
        <strong>Notice Acknowledged:</strong> {application.noticeAcknowledged ? 'Yes' : 'No'}
      </div>
      <div className="info-section">
        <strong>Reason:</strong> {application.reason || 'N/A'}
      </div>
      <div className="info-section">
        <strong>Resignation Type:</strong> {application.resignationType || 'N/A'}
      </div>
      <div className="info-section">
        <strong>Comments:</strong> {application.comments || 'N/A'}
      </div>
      <div className="info-section">
        <strong>HR Approval:</strong> {application.approvalStatus?.HR?.status ? displayStatus(application.approvalStatus.HR.status) : 'Pending'}
      </div>
      {application.additionalFiles && application.additionalFiles.length > 0 && (
        <div className="files-section">
          <h3>Additional Documents</h3>
          <div className="files-list">
            {application.additionalFiles.map((file, index) => (
              <div key={index} className="file-card">
                <span className="file-name">{file.name}</span>
                <a className="file-view-button" href={file.url} target="_blank" rel="noreferrer">
                  Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
      {renderDecisionSection()}
    </>
  );

  const renderJobApplicationContent = () => (
    <>
      <div className="applicant-header">
        <h2>{application.fullName}</h2>
        <p>{application.email}</p>
        <p>{formatDateTime(application.createdAt)}</p>
      </div>
      {application.details && application.details.trim() !== '' && (
        <div className="applicant-details">
          <h3>Additional Details</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{application.details}</p>
        </div>
      )}
      {application.resumeUrl && (
        <div className="files-section">
          <h3>Resume</h3>
          <div className="files-list">
            <div className="file-card">
              <span className="file-name">
                {application.resumeOriginalName || getFileNameFromUrl(application.resumeUrl)}
              </span>
              <a className="file-view-button" href={application.resumeUrl} target="_blank" rel="noreferrer">
                Download
              </a>
            </div>
          </div>
        </div>
      )}
      {application.additionalFiles && application.additionalFiles.length > 0 && (
        <div className="files-section">
          <h3>Additional Documents</h3>
          <div className="files-list">
            {application.additionalFiles.map((file, index) => (
              <div key={index} className="file-card">
                <span className="file-name">{file.name}</span>
                <a className="file-view-button" href={file.url} target="_blank" rel="noreferrer">
                  Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
      {renderDecisionSection()}
    </>
  );

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content details-modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>×</button>
          <div className="modal-body">
            {segment === "job_applications" && renderJobApplicationContent()}
            {segment === "exception_requests" && renderExceptionContent()}
            {segment === "resignations" && renderResignationContent()}
          </div>
        </div>
      </div>
      {showDecisionConfirm && (
        <ConfirmationModal
          show={showDecisionConfirm}
          onClose={() => setShowDecisionConfirm(false)}
          onConfirm={() => {
            onUpdateDecision(application.id, localDecision);
            setShowDecisionConfirm(false);
            onClose();
          }}
          message={`Are you sure you want to ${localDecision === 'accepted' ? 'accept' : 'reject'} this ${segment === 'job_applications' ? 'application' : 'request'}?`}
        />
      )}
    </>
  );
};

// ===================
// MAIN DASHBOARD COMPONENT
// ===================

const HRDashboard = () => {
  // Segmented control: "job_applications", "exception_requests", "resignations"
  const [currentSegment, setCurrentSegment] = useState("job_applications");
  const [applications, setApplications] = useState([]);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Get current user ID using Firebase Auth
  const auth = getAuth();
  const [currentUserId, setCurrentUserId] = useState("");
  useEffect(() => {
    if (auth.currentUser) {
      setCurrentUserId(auth.currentUser.uid);
    }
  }, [auth.currentUser]);

  // Sort and Filter state; default sort is "oldest" and filter is "pending"
  const [sortOption, setSortOption] = useState("oldest");
  const [filterOption, setFilterOption] = useState("pending");
  const sortOptions = [
    { value: "atoz", label: "A to Z" },
    { value: "ztoa", label: "Z to A" },
    { value: "oldest", label: "Oldest First" },
    { value: "newest", label: "Newest First" }
  ];
  const filterOptions = [
    { value: "all", label: "All" },
    { value: "accepted", label: "Accepted" },
    { value: "rejected", label: "Rejected" },
    { value: "pending", label: "Pending" }
  ];
  const segments = [
    { value: "job_applications", label: "Job Applications" },
    { value: "exception_requests", label: "Exception Requests" },
    { value: "resignations", label: "Resignations" }
  ];

  // Cache user names and emails: map userId -> fullName/email
  const [userNames, setUserNames] = useState({});
  const [userEmails, setUserEmails] = useState({});

  // Build Firestore query based on current segment.
  useEffect(() => {
    let q;
    const collRef = collection(db, "requests");
    if (currentSegment === "job_applications") {
      q = query(collRef, where("type", "==", "job_application"));
    } else if (currentSegment === "exception_requests") {
      q = query(collRef, where("type", "==", "exception_request"));
    } else if (currentSegment === "resignations") {
      q = query(collRef, where("type", "==", "resignation"));
    }
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const apps = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if ((currentSegment === "exception_requests" || currentSegment === "resignations") &&
              !(data.approvalStatus &&
                data.approvalStatus.HR &&
                data.approvalStatus.HR.required)) {
            return;
          }
          apps.push({ id: docSnap.id, ...data });
        });
        setApplications(apps);
      },
      (err) => setError(handleError(err))
    );
    return () => unsubscribe();
  }, [currentSegment]);

  // Update userNames and userEmails cache by fetching missing user info.
  useEffect(() => {
    const missingIds = new Set();
    applications.forEach(app => {
      if (!userNames[app.userId] || !userEmails[app.userId]) missingIds.add(app.userId);
    });
    missingIds.forEach(async (userId) => {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        setUserNames(prev => ({ ...prev, [userId]: userSnap.data().fullName }));
        setUserEmails(prev => ({ ...prev, [userId]: userSnap.data().email }));
      }
    });
  }, [applications, userNames, userEmails]);

  // Filtering and sorting:
  const filteredApps = filterOption === "all"
    ? applications
    : applications.filter(app => {
        if (currentSegment === "job_applications") return app.status === filterOption;
        else return (app.approvalStatus?.HR?.status || "pending") === filterOption;
      });
  const sortedApps = [...filteredApps].sort((a, b) => {
    if (sortOption === "atoz") {
      return (getDisplayName(a, currentSegment, userNames) || "").localeCompare(
        (getDisplayName(b, currentSegment, userNames) || "")
      );
    } else if (sortOption === "ztoa") {
      return (getDisplayName(b, currentSegment, userNames) || "").localeCompare(
        (getDisplayName(a, currentSegment, userNames) || "")
      );
    } else if (sortOption === "oldest") {
      return getTimestamp(a.createdAt).getTime() - getTimestamp(b.createdAt).getTime();
    } else if (sortOption === "newest") {
      return getTimestamp(b.createdAt).getTime() - getTimestamp(a.createdAt).getTime();
    } else return 0;
  });

  const updateDecision = async (reqId, newStatus) => {
    try {
      if (currentSegment === "job_applications") {
        await updateDoc(doc(db, "requests", reqId), {
          status: newStatus,
          reviewedAt: new Date().toISOString(),
          lastUpdate: new Date(),
          lastUpdatedBy: currentUserId
        });
      } else {
        await updateDoc(doc(db, "requests", reqId), {
          "approvalStatus.HR.status": newStatus,
          "approvalStatus.HR.decisionBy": currentUserId,
          "approvalStatus.HR.lastUpdated": new Date()
        });
      }
      setMessage("Decision updated successfully.");
      setTimeout(() => setMessage(""), 3000);
      setSelectedApplication(null);
    } catch (err) {
      setError(handleError(err));
    }
  };

  return (
    <div className="hr-dashboard">
      <header className="hr-header">
        <h1>HR Dashboard</h1>
      </header>
      <SegmentedControl segments={segments} currentSegment={currentSegment} setCurrentSegment={setCurrentSegment} />
      {message && <div className="notification success">{message}</div>}
      {error && <div className="notification error">{error}</div>}
      {applications.length > 0 && (
        <div className="sort-filter-bar">
          {applications.length > 1 && (
            <SortPicker
              sortOption={sortOption}
              setSortOption={setSortOption}
              options={sortOptions}
              defaultValue="oldest"
            />
          )}
          <FilterPicker
            filterOption={filterOption}
            setFilterOption={setFilterOption}
            options={filterOptions}
            defaultValue="pending"
          />
        </div>
      )}
      {applications.length === 0 ? (
        <div className="empty-message">
          No {segments.find(s => s.value === currentSegment)?.label.toLowerCase()} submitted yet.
        </div>
      ) : sortedApps.length === 0 ? (
        <div className="empty-message">No match found. Try changing filters.</div>
      ) : (
        <div className="cards-container">
          {sortedApps.map(app => {
            if (currentSegment === "exception_requests") {
              return (
                <button key={app.id} className="application-card" onClick={() => setSelectedApplication(app)}>
                  <div className="card-content">
                    <h2>{userNames[app.userId] || app.userId}</h2>
                    <p>
                      {app.systemsNeeded ? app.systemsNeeded.join(", ") : "None"} • {formatDate(app.createdAt)} • {displayStatus(app.approvalStatus?.HR?.status)}
                    </p>
                  </div>
                  <div className="card-chevron">›</div>
                </button>
              );
            } else {
              return (
                <button key={app.id} className="application-card" onClick={() => setSelectedApplication(app)}>
                  <div className="card-content">
                    <h2>{currentSegment === "job_applications" ? app.fullName : (userNames[app.userId] || app.userId)}</h2>
                    <p>
                      {formatDate(app.createdAt)} • {currentSegment === "job_applications" ? displayStatus(app.status) : displayStatus(app.approvalStatus?.HR?.status)}
                    </p>
                  </div>
                  <div className="card-chevron">›</div>
                </button>
              );
            }
          })}
        </div>
      )}
      <DetailsModal
        show={selectedApplication !== null}
        onClose={() => setSelectedApplication(null)}
        application={selectedApplication}
        onUpdateDecision={updateDecision}
        currentUserId={currentUserId}
        segment={currentSegment}
        userNames={userNames}
        userEmails={userEmails}
      />
    </div>
  );
};

export default HRDashboard;