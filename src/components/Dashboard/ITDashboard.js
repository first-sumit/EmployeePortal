// ITDashboard.js
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
import { FaSort, FaFilter, FaTimes, FaCheck, FaTimesCircle } from 'react-icons/fa';
import './HRDashboard.css'; // Reuse your existing CSS

// ===================
// HELPER FUNCTIONS
// ===================

const getTimestamp = (value) => {
  if (value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return new Date(value);
};

const formatDate = (value) => {
  const date = getTimestamp(value);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatDateTime = (value) => {
  const date = getTimestamp(value);
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dateStr} at ${timeStr}`;
};

const displayStatus = (status) =>
  status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

const getFileNameFromUrl = (url) => {
  try {
    return url.split('/').pop().split('?')[0];
  } catch (e) {
    return "Document";
  }
};

const getDisplayName = (app, currentSegment, userInfos) => {
  if (currentSegment === "job_applications") {
    return app.fullName || "";
  } else {
    return userInfos[app.userId]?.fullName || "";
  }
};

const getUserEmail = (userId, userInfos) => {
  return userInfos[userId]?.email || "";
};

// ===================
// CUSTOM COMPONENTS
// ===================

// Modal for confirming decision change
const DecisionConfirmationModal = ({ show, onClose, onConfirm, message }) => {
  if (!show) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{message}</h3>
        <div className="confirmation-actions">
          <button className="cancel-button" onClick={onClose}>Cancel</button>
          <button className="confirm-button" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
};

// (Optional) Already Deleted Modal – kept for completeness.
const AlreadyDeletedModal = ({ show, onClose, message }) => {
  if (!show) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{message}</h3>
        <div className="confirmation-actions">
          <button className="cancel-button" onClick={onClose}>Ok</button>
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

// Custom Filter Picker (Apple‑like) with "All" option.
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

// Segmented Control
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
          {index < segments.length - 1 && <div className="vertical-divider" />}
        </React.Fragment>
      ))}
    </div>
  );
};

// DETAILS MODAL (Delete removed; decision buttons adjusted)
// DETAILS MODAL (Delete removed; decision buttons adjusted)
const DetailsModal = ({
  show,
  onClose,
  application,
  onUpdateDecision,
  currentUserId,
  segment,
  userInfos
}) => {
  // Always call hooks unconditionally:
  const initialDecision =
    application
      ? (segment === "job_applications" ? application.status : (application.approvalStatus?.IT?.status || "pending"))
      : "pending";
  const [localDecision, setLocalDecision] = useState(initialDecision);
  const [decisionLocked, setDecisionLocked] = useState(initialDecision !== "pending");
  const [showDecisionConfirm, setShowDecisionConfirm] = useState(false);
  const [lastUpdatedByName, setLastUpdatedByName] = useState('');

  // Normalize IT approval data (for requests)
  const itApproval = application && application.approvalStatus && application.approvalStatus.IT
    ? application.approvalStatus.IT
    : {
        status: "pending",
        decisionBy: null,
        lastUpdated: null,
        required: false
      };

  // Use effect for fetching user info of the person who last updated the decision.
  useEffect(() => {
    if (application) {
      let dec = "";
      if (segment === "job_applications") {
        dec = application.status;
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
      } else {
        dec = application.approvalStatus?.IT?.status || "pending";
        if (application.approvalStatus?.IT?.decisionBy && application.approvalStatus.IT.decisionBy !== currentUserId) {
          const fetchUser = async () => {
            const userRef = doc(db, 'users', application.approvalStatus.IT.decisionBy);
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
      setLocalDecision(dec);
      setDecisionLocked(dec !== "pending");
    }
  }, [application, currentUserId, segment]);

  const onConfirmDecisionChange = () => {
    onUpdateDecision(application.id, localDecision);
    setDecisionLocked(true);
    setShowDecisionConfirm(false);
  };

  // Render decision section with two side-by-side buttons when pending.
  const renderDecisionSection = () => {
    const lastInfo = segment === "job_applications"
      ? (application.lastUpdate && (
          <p className="last-update-info" style={{ marginTop: '8px' }}>
            Last updated on {formatDateTime(application.lastUpdate)} by {application.lastUpdatedBy === currentUserId ? 'you' : (lastUpdatedByName || 'loading...')}
          </p>
        ))
      : (itApproval.lastUpdated && (
          <p className="last-update-info" style={{ marginTop: '8px' }}>
            Last updated on {formatDateTime(itApproval.lastUpdated)} by {itApproval.decisionBy === currentUserId ? 'you' : (lastUpdatedByName || 'loading...')}
          </p>
        ));
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

  const renderJobContent = () => (
    <>
      <div className="applicant-header">
        <h2>{application.fullName}</h2>
        <p className="email-info">{getUserEmail(application.userId, userInfos)}</p>
        <p className="submission-info">{formatDateTime(application.createdAt)}</p>
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
              <span className="file-name">{application.resumeOriginalName || getFileNameFromUrl(application.resumeUrl)}</span>
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

  const renderExceptionContent = () => (
    <>
      <div className="applicant-header">
        <h2>{userInfos[application.userId]?.fullName || application.userId}</h2>
        <p className="email-info">{getUserEmail(application.userId, userInfos)}</p>
        <p className="submission-info">{formatDateTime(application.createdAt)}</p>
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
      <div className="info-section">
        <strong>Approval Required From:</strong> {(() => {
          const hrRequired = application.approvalStatus?.HR?.required;
          const itRequired = application.approvalStatus?.IT?.required;
          if (hrRequired && itRequired) {
            return "HR & IT";
          } else if (itRequired) {
            return "IT only";
          } else if (hrRequired) {
            return "HR only";
          } else {
            return "None";
          }
        })()}
      </div>
      {renderDecisionSection()}
    </>
  );

  const renderContent = () => {
    if (segment === "job_applications") {
      return renderJobContent();
    } else if (segment === "exception_requests") {
      return renderExceptionContent();
    }
  };

  // Instead of early returning before calling hooks, conditionally render the UI.
  return (!show || !application) ? null : (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content details-modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>×</button>
          <div className="modal-body">
            {renderContent()}
          </div>
        </div>
      </div>
      <DecisionConfirmationModal
        show={showDecisionConfirm}
        onClose={() => setShowDecisionConfirm(false)}
        onConfirm={onConfirmDecisionChange}
        message="Once a decision is made, it can't be changed later. Are you sure you want to proceed?"
      />
      <AlreadyDeletedModal
        show={false}
        onClose={() => {}}
        message="This application was already deleted."
      />
    </>
  );
};


// ===================
// MAIN DASHBOARD COMPONENT
// ===================
const ITDashboard = () => {
  const [currentSegment, setCurrentSegment] = useState("job_applications");
  const [applications, setApplications] = useState([]);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const auth = getAuth();
  const [currentUserId, setCurrentUserId] = useState("");
  useEffect(() => {
    if (auth.currentUser) {
      setCurrentUserId(auth.currentUser.uid);
    }
  }, [auth.currentUser]);

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
    { value: "pending", label: "Pending" },
    { value: "accepted", label: "Accepted" },
    { value: "rejected", label: "Rejected" }
  ];
  const segments = [
    { value: "job_applications", label: "Job Applications" },
    { value: "exception_requests", label: "Exception Requests" }
  ];

  const [userInfos, setUserInfos] = useState({});
  useEffect(() => {
    const missingIds = new Set();
    applications.forEach(app => {
      if (!userInfos[app.userId]) {
        missingIds.add(app.userId);
      }
    });
    missingIds.forEach(async (userId) => {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        setUserInfos(prev => ({
          ...prev,
          [userId]: { fullName: userSnap.data().fullName, email: userSnap.data().email }
        }));
      }
    });
  }, [applications, userInfos]);

  useEffect(() => {
    let q;
    const collRef = collection(db, "requests");
    if (currentSegment === "job_applications") {
      q = query(collRef, where("type", "==", "job_application"));
    } else if (currentSegment === "exception_requests") {
      q = query(collRef, where("type", "==", "exception_request"));
    }
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const apps = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (currentSegment === "exception_requests" &&
              !(data.approvalStatus && data.approvalStatus.IT && data.approvalStatus.IT.required)) {
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

  const filteredApps = applications.filter(app => {
    if (currentSegment === "job_applications") {
      return filterOption === "all" ? true : app.status === filterOption;
    } else {
      return filterOption === "all" ? true : ((app.approvalStatus?.IT?.status || "pending") === filterOption);
    }
  });
  const sortedApps = [...filteredApps].sort((a, b) => {
    if (sortOption === "atoz") {
      return (getDisplayName(a, currentSegment, userInfos) || "").localeCompare(
        (getDisplayName(b, currentSegment, userInfos) || "")
      );
    } else if (sortOption === "ztoa") {
      return (getDisplayName(b, currentSegment, userInfos) || "").localeCompare(
        (getDisplayName(a, currentSegment, userInfos) || "")
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
          "approvalStatus.IT.status": newStatus,
          "approvalStatus.IT.decisionBy": currentUserId,
          "approvalStatus.IT.lastUpdated": new Date()
        });
      }
      setMessage("Decision updated successfully.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setError(handleError(err));
    }
  };

  return (
    <div className="hr-dashboard">
      <header className="hr-header">
        <h1>IT Dashboard</h1>
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
                    <h2>{userInfos[app.userId]?.fullName || app.userId}</h2>
                    <p className="email-info">{getUserEmail(app.userId, userInfos)}</p>
                    <p>
                      {app.systemsNeeded ? app.systemsNeeded.join(", ") : "None"} • {formatDate(app.createdAt)} • {displayStatus(app.approvalStatus?.IT?.status)}
                    </p>
                  </div>
                  <div className="card-chevron">›</div>
                </button>
              );
            } else {
              return (
                <button key={app.id} className="application-card" onClick={() => setSelectedApplication(app)}>
                  <div className="card-content">
                    <h2>{app.fullName}</h2>
                    <p className="email-info">{getUserEmail(app.userId, userInfos)}</p>
                    <p>
                      {formatDate(app.createdAt)} • {displayStatus(app.status)}
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
        userInfos={userInfos}
      />
    </div>
  );
};

export default ITDashboard;
