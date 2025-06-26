import React, { useState } from 'react';
import { db, storage } from '../../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../../services/authService';
import { generateUniqueId } from '../../utils/generateId';
import { handleError } from '../../utils/errorHandler';
import { useNavigate } from 'react-router-dom';
import './JobApplication.css';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ADDITIONAL_FILES = 3;
const MAX_FULLNAME = 200;
const MAX_PHONE = 15;
const MAX_DETAILS = 1000;

const FloatingLabelInput = ({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
  required = true,
  id,
  name,
  placeholder,
  autoComplete,
  maxLength,
  minLength,
  pattern,
  inputMode,
  readOnly,
  step,
  min,
  max,
  className,
  onBlur,
  onFocus,
  error
}) => {
  const [focused, setFocused] = useState(false);
  const hasValue = Boolean(value && value.trim().length > 0);
  const handleFocus = (e) => {
    setFocused(true);
    onFocus && onFocus(e);
  };
  const handleBlur = (e) => {
    setFocused(false);
    onBlur && onBlur(e);
  };
  return (
    <div className={`floating-label-group ${hasValue ? 'has-value' : ''} ${focused ? 'focused' : ''} ${disabled ? 'disabled-check' : ''} ${error ? 'field-error' : ''}`}>
      <input
        type={type}
        value={value}
        onChange={onChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        required={required}
        id={id}
        name={name}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        minLength={minLength}
        pattern={pattern}
        inputMode={inputMode}
        readOnly={readOnly}
        step={step}
        min={min}
        max={max}
        className={className}
      />
      <label htmlFor={id}>{label}</label>
      {error && <div className="field-error-message">{error}</div>}
    </div>
  );
};

const FloatingLabelTextArea = ({
  label,
  value,
  onChange,
  required = false,
  error,
  maxLength,
  disabled = false
}) => {
  const [focused, setFocused] = useState(false);
  const hasValue = Boolean(value && value.trim().length > 0);
  const handleFocus = () => setFocused(true);
  const handleBlur = () => setFocused(false);
  return (
    <div className={`floating-label-group textarea-group ${hasValue ? 'has-value' : ''} ${focused ? 'focused' : ''} ${error ? 'field-error' : ''}`}>
      <textarea
        onFocus={handleFocus}
        onBlur={handleBlur}
        value={value}
        onChange={onChange}
        required={required}
        maxLength={maxLength}
        disabled={disabled}
      />
      <label>{label}</label>
      {error && <div className="field-error-message">{error}</div>}
    </div>
  );
};

function isFileAllowed(file, acceptStr) {
  const ext = file.name.split('.').pop().toLowerCase();
  const acceptedTypes = acceptStr.split(',').map(s => s.trim());
  const extensionSet = new Set();
  acceptedTypes.forEach((mime) => {
    switch (mime) {
      case 'application/pdf':
        extensionSet.add('pdf');
        break;
      case 'application/msword':
        extensionSet.add('doc');
        break;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        extensionSet.add('docx');
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

const FileDropzone = ({
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
  onError,
  error,
  disabled = false
}) => {
  const [dragActive, setDragActive] = useState(false);

  const validateFiles = (fileList) => {
    const validFiles = [];
    for (const file of fileList) {
      if (!isFileAllowed(file, accept)) {
        onError && onError(`Unsupported file type: ${file.name}`);
      } else if (file.size > MAX_FILE_SIZE) {
        onError && onError(`File too large: ${file.name} (Max 10 MB)`);
      } else {
        validFiles.push(file);
      }
    }
    return validFiles;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (disabled) return;
    if (files.length < maxFiles) setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (disabled) return;
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (disabled) return;
    setDragActive(false);
    if (files.length >= maxFiles) return;
    const dropped = Array.from(e.dataTransfer.files);
    const filtered = validateFiles(dropped);
    let newFiles = multiple ? [...files, ...filtered] : filtered.slice(0, 1);
    if (maxFiles && newFiles.length > maxFiles) {
      newFiles = newFiles.slice(0, maxFiles);
    }
    onFilesChange(newFiles);
    if (newFiles.length > 0) onError && onError('');
  };

  const handleFileSelect = (e) => {
    if (disabled) return;
    const selected = Array.from(e.target.files);
    const filtered = validateFiles(selected);
    let newFiles = multiple ? [...files, ...filtered] : filtered.slice(0, 1);
    if (maxFiles && newFiles.length > maxFiles) {
      newFiles = newFiles.slice(0, maxFiles);
    }
    onFilesChange(newFiles);
    if (newFiles.length > 0) onError && onError('');
  };

  const removeFile = (index) => {
    if (disabled) return;
    const updated = files.filter((_, i) => i !== index);
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
          onClick={() => { if (!disabled && files.length < maxFiles) { document.getElementById(`fileInput-${fieldType}`).click(); } }}
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
            onClick={() => { if (!disabled && fieldType === 'resume' && files.length < maxFiles) { document.getElementById(`fileInput-${fieldType}`).click(); } }}
          >
            <div className="file-cards">
              {files.map((file, index) => (
                <div key={index} className="file-card">
                  <div className="file-icon">📄</div>
                  <div className="file-info">
                    <div className="file-name">{file.name}</div>
                    <div className="file-size">{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <button type="button" className="remove-file-button" onClick={() => removeFile(index)}>×</button>
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
        onChange={handleFileSelect}
        accept={accept}
        multiple={multiple}
      />
      {error && <div className="field-error-message">{error}</div>}
    </div>
  );
};

const JobApplication = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(currentUser ? currentUser.email : '');
  const [details, setDetails] = useState('');
  const [resumeFiles, setResumeFiles] = useState([]);
  const [additionalFiles, setAdditionalFiles] = useState([]);
  const [errors, setErrors] = useState({
    fullName: '',
    phone: '',
    email: '',
    details: '',
    resume: '',
    additionalFiles: '',
    submit: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const validateField = (field, value) => {
    let errorMsg = '';
    if (field === 'fullName') {
      if (!value.trim()) {
        errorMsg = 'Full Name is required.';
      } else if (value.length > MAX_FULLNAME) {
        errorMsg = `Full Name cannot exceed ${MAX_FULLNAME} characters.`;
      }
    }
    if (field === 'phone') {
      if (!value.trim() || !/^\+?\d+$/.test(value.trim())) {
        errorMsg = 'Enter a valid phone number with country code.';
      } else if (value.length > MAX_PHONE) {
        errorMsg = `Phone number cannot exceed ${MAX_PHONE} characters.`;
      }
    }
    if (field === 'email' && !value.trim()) {
      errorMsg = 'Email is required.';
    }
    if (field === 'details' && value.length > MAX_DETAILS) {
      errorMsg = `Additional Details cannot exceed ${MAX_DETAILS} characters.`;
    }
    setErrors(prev => ({ ...prev, [field]: errorMsg }));
    return errorMsg;
  };

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    if (/^\+?\d*$/.test(val)) {
      setPhone(val);
    }
  };

  const checkEligibility = async () => {
    if (!currentUser) return true;
    const q = query(
      collection(db, 'requests'),
      where('type', '==', 'job_application'),
      where('userId', '==', currentUser.uid)
    );
    const snap = await getDocs(q);
    if (snap.empty) return true;
    let apps = [];
    snap.forEach(doc => {
      apps.push({ id: doc.id, ...doc.data() });
    });
    apps.sort((a, b) => {
      const tA = a.createdAt?.toDate?.() || 0;
      const tB = b.createdAt?.toDate?.() || 0;
      return tB - tA;
    });
    const newest = apps[0];
    if (newest.status === 'pending' || newest.status === 'rejected') {
      const createdAt = newest.createdAt?.toDate?.();
      if (createdAt) {
        const now = new Date();
        const diffDays = (now - createdAt) / (1000 * 3600 * 24);
        if (diffDays < 14) return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({
      fullName: '',
      phone: '',
      email: '',
      details: '',
      resume: '',
      additionalFiles: '',
      submit: ''
    });
    let hasError = false;
    if (!fullName.trim() || validateField('fullName', fullName)) hasError = true;
    if (!phone.trim() || validateField('phone', phone)) hasError = true;
    if (!email.trim() || validateField('email', email)) hasError = true;
    if (resumeFiles.length === 0) {
      setErrors(prev => ({ ...prev, resume: 'Please select a resume file.' }));
      hasError = true;
    }
    if (hasError) return;
    try {
      const isEligible = await checkEligibility();
      if (!isEligible) {
        setErrors(prev => ({ ...prev, submit: 'You are not eligible to submit a new application yet.' }));
        return;
      }
      setSubmitting(true);
      const resumeFile = resumeFiles[0];
      if (resumeFile.size > MAX_FILE_SIZE) {
        setErrors(prev => ({ ...prev, resume: 'Resume file must be less than 10MB.' }));
        setSubmitting(false);
        return;
      }
      const resumeRef = ref(storage, 'resumes/' + Date.now() + '-' + resumeFile.name);
      const resumeSnap = await uploadBytes(resumeRef, resumeFile);
      const resumeUrl = await getDownloadURL(resumeSnap.ref);
      const additionalUrls = [];
      if (additionalFiles.length > 0) {
        for (let file of additionalFiles) {
          if (file.size > MAX_FILE_SIZE) {
            setErrors(prev => ({ ...prev, additionalFiles: 'Each document must be less than 10MB.' }));
            setSubmitting(false);
            return;
          }
          const fileRef = ref(storage, 'additional_documents/' + Date.now() + '-' + file.name);
          const fileSnap = await uploadBytes(fileRef, file);
          const fileUrl = await getDownloadURL(fileSnap.ref);
          additionalUrls.push({ name: file.name, url: fileUrl });
        }
      }
      const newId = generateUniqueId();
      await addDoc(collection(db, 'requests'), {
        title: `Job Application: ${fullName}`,
        fullName,
        phone,
        email,
        details,
        resumeUrl,
        resumeOriginalName: resumeFile.name,
        additionalFiles: additionalUrls,
        type: 'job_application',
        status: 'pending',
        uniqueId: newId,
        userId: currentUser ? currentUser.uid : null,
        createdAt: serverTimestamp()
      });
      navigate('/dashboard/EmployeeApplicationDashboard', { replace: true });
    } catch (err) {
      setErrors(prev => ({ ...prev, submit: handleError(err) }));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="job-application-form">
      <FloatingLabelInput
        label="Full Name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        id="fullName"
        name="fullName"
        maxLength={MAX_FULLNAME}
        error={errors.fullName}
        disabled={submitting}
      />
      <FloatingLabelInput
        label="Email Address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        disabled={!!currentUser || submitting}
        id="email"
        name="email"
        error={errors.email}
      />
      <FloatingLabelInput
        label="Phone"
        value={phone}
        onChange={handlePhoneChange}
        type="tel"
        inputMode="numeric"
        pattern={`^\\+?\\d+$`}
        id="phone"
        name="phone"
        maxLength={MAX_PHONE}
        error={errors.phone}
        disabled={submitting}
      />
      <FloatingLabelTextArea
        label="Additional Details (optional)"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        required={false}
        maxLength={MAX_DETAILS}
        error={errors.details}
        disabled={submitting}
      />
      <FileDropzone
        label="Resume"
        multiple={false}
        maxFiles={1}
        accept="application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain"
        files={resumeFiles}
        onFilesChange={setResumeFiles}
        required={true}
        fieldType="resume"
        displayAccept="PDF, DOC, DOCX, TXT"
        displayLimit="Max 10 MB."
        onError={(msg) => setErrors(prev => ({ ...prev, resume: msg }))}
        error={errors.resume}
        disabled={submitting}
      />
      <FileDropzone
        label="Additional Documents"
        multiple={true}
        maxFiles={MAX_ADDITIONAL_FILES}
        accept="application/pdf, image/png, image/jpeg"
        files={additionalFiles}
        onFilesChange={setAdditionalFiles}
        required={false}
        fieldType="additional"
        displayAccept="PDF, PNG, JPEG, JPG"
        displayLimit="Up to 3 files, Max 10 MB each."
        usageNote="Attach any certificates, awards or supporting documents you would like to share"
        onError={(msg) => setErrors(prev => ({ ...prev, additionalFiles: msg }))}
        error={errors.additionalFiles}
        disabled={submitting}
      />
      {errors.submit && <div className="field-error-message">{errors.submit}</div>}
      <button type="submit" className="submit-button" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit Application'}
      </button>
    </form>
  );
};

export default JobApplication;