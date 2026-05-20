import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { UserPlus, X, Save, Camera, RotateCcw, Image as ImageIcon, CheckCircle, Smartphone, QrCode, RefreshCw } from 'lucide-react';
import './PatientRegistration.css';

import { nigeriaData } from '../../utils/nigeriaData';

// HMO Providers
const hmoProviders = ["NHIS", "Hygeia", "Reliance", "AXA Mansard", "Total Health", "Avon"];

const PatientRegistration = ({ onComplete, onCancel }) => {
    const { user } = useAuth();
    const { addPatient, patients } = useData();
    const [loading, setLoading] = useState(false);
    const [verifyingHMO, setVerifyingHMO] = useState(false);
    const [step, setStep] = useState(1);
    const videoRef = useRef(null);
    const fileInputRef = useRef(null);
    const [photo, setPhoto] = useState(null);
    const [showCamera, setShowCamera] = useState(false);

    const [formData, setFormData] = useState({
        surname: '', firstName: '', otherNames: '',
        dob: '', age: '', gender: '',
        maritalStatus: '', occupation: '',
        phonePrimary: '', phoneSecondary: '', email: '',
        address: '', state: '', lga: '',
        nokFullName: '', nokRelationship: '', nokPhone: '', nokAddress: '',
        paymentType: 'Cash', hmoProvider: '', hmoID: '', authCode: '', coverageDetails: '',
        emergencyContactSameAsNok: true, emergencyName: '', emergencyPhone: '', emergencyAddress: ''
    });

    const [stateSearch, setStateSearch] = useState('');
    const [showStateList, setShowStateList] = useState(false);
    const dropdownRef = useRef(null);

    // Filtered States based on search
    const filteredStates = nigeriaData.filter(s => 
        s.state.toLowerCase().includes(stateSearch.toLowerCase())
    );

    // LGAs for currently selected state
    const currentStateLgas = nigeriaData.find(s => s.state === formData.state)?.lgas || [];

    const [errors, setErrors] = useState({});

    // Close state dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowStateList(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Age calculation
    useEffect(() => {
        if (formData.dob) {
            const birth = new Date(formData.dob);
            const now = new Date();
            let age = now.getFullYear() - birth.getFullYear();
            if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
                age--;
            }
            setFormData(prev => ({ ...prev, age: age >= 0 ? age : 0 }));
        }
    }, [formData.dob]);

    const generateID = async () => {
        const year = new Date().getFullYear();
        // Increment based on local patients list for demo
        const count = (patients?.length || 0) + 1;
        return `KGT-${year}-${String(count).padStart(5, '0')}`;
    };

    const handleWebcam = async () => {
        if (!showCamera) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) videoRef.current.srcObject = stream;
                setShowCamera(true);
            } catch (err) { alert("Webcam access denied"); }
        } else {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
            setPhoto(canvas.toDataURL('image/jpeg'));
            stopCamera();
        }
    };

    const stopCamera = () => {
        if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        setShowCamera(false);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => setPhoto(reader.result);
        reader.readAsDataURL(file);
    };

    const validatePrimary = async () => {
        let errs = {};
        if (!formData.surname) errs.surname = "Required";
        if (!formData.firstName) errs.firstName = "Required";
        if (!formData.dob) errs.dob = "Required";
        if (!formData.state) errs.state = "Required";
        if (!formData.lga) errs.lga = "Required";
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const validateContact = async () => {
        let errs = {};
        if (!formData.phonePrimary) errs.phonePrimary = "Required";
        if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) errs.email = "Invalid email";
        // Duplicate Check locally
        if (formData.phonePrimary && patients) {
            if (patients.some(p => p.phonePrimary === formData.phonePrimary)) {
                errs.phonePrimary = "Phone already registered";
            }
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const verifyHMOMock = async () => {
        if (formData.paymentType !== 'Insurance') return true;
        setVerifyingHMO(true);
        // await new Promise(r => setTimeout(r, 1500)); // REMOVED FOR MILLISECOND SPEED
        setVerifyingHMO(false);
        return true;
    };

    const handleSave = async (another = false) => {
        if (step === 1) {
            // Validate Basic Info (Primary fields + Phone)
            const okPrimary = await validatePrimary();
            const okContact = await validateContact();
            if (!okPrimary || !okContact) return;
            setStep(2);
            return;
        }

        setLoading(true);
        try {
            await verifyHMOMock();
            const patientID = await generateID();
            const finalData = {
                ...formData,
                patientID,
                name: `${formData.surname}, ${formData.firstName} ${formData.otherNames}`.trim(),
                photo,
                registeredBy: user?.name || user?.email || 'Receptionist',
                status: 'Active',
                registeredAt: new Date().toISOString()
            };

            addPatient(finalData);

            // Success Feedback
            alert(`Registration Successful!\nID: ${patientID}\n- QR Code Generated for Wristband\n- Confirmation SMS sent to ${formData.phonePrimary}`);

            if (another) {
                setFormData({ surname: '', firstName: '', otherNames: '', dob: '', age: '', gender: '', maritalStatus: '', occupation: '', phonePrimary: '', phoneSecondary: '', email: '', address: '', state: '', lga: '', nokFullName: '', nokRelationship: '', nokPhone: '', nokAddress: '', paymentType: 'Cash', hmoProvider: '', hmoID: '', authCode: '', coverageDetails: '', emergencyContactSameAsNok: true, emergencyName: '', emergencyPhone: '', emergencyAddress: '' });
                setPhoto(null); setStep(1);
            } else {
                onComplete?.(finalData);
            }
        } catch (e) {
            alert(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="registration-v2">
            <div className="reg-header">
                <div className="title-area">
                    <h2><UserPlus size={24} /> New Patient Enrollment</h2>
                    <p className="subtitle">Fill all mandatory fields (*) to generate Patient ID</p>
                </div>
                <div className="stepper">
                    <div className={`step ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}>1. Personal Info</div>
                    <div className={`step ${step === 2 ? 'active' : ''}`}>2. Billing & Insurance</div>
                </div>
                <button className="close-btn-round" onClick={onCancel}><X size={20} /></button>
            </div>

            <div className="reg-content">
                {step === 1 && (
                    <div className="form-section-v2 fade-in">
                        <div className="photo-panel">
                            <div className="preview-sq">
                                {showCamera ? <video ref={videoRef} autoPlay playsInline /> :
                                    photo ? <img src={photo} alt="Patient" /> : <div className="p-icon"><ImageIcon size={48} /></div>}
                                {photo && !showCamera && <div className="snap-badge">Photo Captured</div>}
                            </div>
                            <div className="photo-btns">
                                <button className={`cam-action ${showCamera ? 'snapping' : ''}`} onClick={handleWebcam} type="button">
                                    <Camera size={16} /> {showCamera ? 'Capture Photograph' : 'Webcam'}
                                </button>
                                <button className="cam-action upload" onClick={() => fileInputRef.current?.click()} type="button">
                                    <ImageIcon size={16} /> Upload Photo
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={handleFileUpload}
                                />
                            </div>
                        </div>
                        <div className="form-grid-v2">
                            <div className={`input-field ${errors.surname ? 'error' : ''}`}>
                                <label>Surname *</label>
                                <input placeholder="Enter surname" value={formData.surname} onChange={u => setFormData({ ...formData, surname: u.target.value })} />
                            </div>
                            <div className={`input-field ${errors.firstName ? 'error' : ''}`}>
                                <label>First Name *</label>
                                <input placeholder="Enter first name" value={formData.firstName} onChange={u => setFormData({ ...formData, firstName: u.target.value })} />
                            </div>
                            <div className={`input-field ${errors.dob ? 'error' : ''}`}>
                                <label>Date of Birth *</label>
                                <input type="date" value={formData.dob} onChange={u => setFormData({ ...formData, dob: u.target.value })} />
                            </div>
                            <div className="input-field">
                                <label>Gender</label>
                                <select value={formData.gender} onChange={u => setFormData({ ...formData, gender: u.target.value })}>
                                    <option value="">Select Gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div className={`input-field ${errors.phonePrimary ? 'error' : ''}`}>
                                <label>Primary Phone *</label>
                                <input type="tel" placeholder="080XXXXXXXX" value={formData.phonePrimary} onChange={u => setFormData({ ...formData, phonePrimary: u.target.value })} />
                            </div>
                            <div className={`input-field searchable-select ${errors.state ? 'error' : ''}`} ref={dropdownRef}>
                                <label>State of Residence *</label>
                                <div className="custom-select-wrapper">
                                    <input 
                                        type="text" 
                                        placeholder="Type to search state..." 
                                        value={stateSearch} 
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setStateSearch(val);
                                            // If they are typing something different, deselect the official state
                                            if (val !== formData.state) {
                                                setFormData(prev => ({ ...prev, state: '', lga: '' }));
                                            }
                                            setShowStateList(true);
                                        }}
                                        onFocus={() => setShowStateList(true)}
                                    />
                                    {stateSearch && (
                                        <button className="clear-select-btn" type="button" onClick={() => {
                                            setStateSearch('');
                                            setFormData(prev => ({ ...prev, state: '', lga: '' }));
                                            setShowStateList(true);
                                        }}>
                                            <X size={14} />
                                        </button>
                                    )}
                                    {showStateList && (
                                        <div className="select-dropdown-list">
                                            {filteredStates.length > 0 ? (
                                                filteredStates.map(s => (
                                                    <div 
                                                        key={s.state} 
                                                        className={`dropdown-item ${formData.state === s.state ? 'selected' : ''}`} 
                                                        onClick={() => {
                                                            setFormData({ ...formData, state: s.state, lga: '' });
                                                            setStateSearch(s.state);
                                                            setShowStateList(false);
                                                        }}
                                                    >
                                                        {s.state}
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="dropdown-item disabled">No matching state found</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className={`input-field ${errors.lga ? 'error' : ''}`}>
                                <label>Local Government Area *</label>
                                <select 
                                    value={formData.lga} 
                                    onChange={u => setFormData({ ...formData, lga: u.target.value })}
                                    disabled={!formData.state}
                                >
                                    <option value="">{formData.state ? "-- Select LGA --" : "Select State First"}</option>
                                    {currentStateLgas.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                            <div className="input-field full">
                                <label>Residential Address (Optional)</label>
                                <input placeholder="Street name / Address" value={formData.address} onChange={u => setFormData({ ...formData, address: u.target.value })} />
                            </div>
                            <div className="input-field full">
                                <h4 style={{ fontSize: '0.8rem', marginTop: '10px' }}>Next of Kin</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <input placeholder="NOK Full Name" value={formData.nokFullName} onChange={u => setFormData({ ...formData, nokFullName: u.target.value })} />
                                    <input placeholder="NOK Phone" value={formData.nokPhone} onChange={u => setFormData({ ...formData, nokPhone: u.target.value })} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}



                {step === 2 && (
                    <div className="form-section-v2 fade-in">
                        <h4 className="section-title">Insurance & Billing Details</h4>
                        <div className="form-grid-v2">
                            <div className="input-field full">
                                <label>Payment Type</label>
                                <div className="radio-group">
                                    <label className={formData.paymentType === 'Cash' ? 'active' : ''}>
                                        <input type="radio" value="Cash" checked={formData.paymentType === 'Cash'} onChange={e => setFormData({ ...formData, paymentType: e.target.value })} />
                                        Cash / Private
                                    </label>
                                    <label className={formData.paymentType === 'Insurance' ? 'active' : ''}>
                                        <input type="radio" value="Insurance" checked={formData.paymentType === 'Insurance'} onChange={e => setFormData({ ...formData, paymentType: e.target.value })} />
                                        HMO / National Insurance
                                    </label>
                                </div>
                            </div>

                            {formData.paymentType === 'Insurance' && (
                                <div className="hmo-panel fade-in">
                                    <div className="form-grid-v2">
                                        <div className="input-field">
                                            <label>HMO Provider</label>
                                            <select value={formData.hmoProvider} onChange={u => setFormData({ ...formData, hmoProvider: u.target.value })}>
                                                <option value="">Select Provider</option>{hmoProviders.map(h => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                        </div>
                                        <div className="input-field">
                                            <label>HMO / Policy Number</label>
                                            <input placeholder="HMO-XXXXX" value={formData.hmoID} onChange={u => setFormData({ ...formData, hmoID: u.target.value })} />
                                        </div>
                                        <div className="input-field">
                                            <label>Authorization Code</label>
                                            <input placeholder="If applicable" value={formData.authCode} onChange={u => setFormData({ ...formData, authCode: u.target.value })} />
                                        </div>
                                        <div className="input-field full">
                                            <label>Coverage Plan Details</label>
                                            <textarea rows="2" placeholder="e.g. Bronze Plan, Family Cover, etc." value={formData.coverageDetails} onChange={u => setFormData({ ...formData, coverageDetails: u.target.value })} />
                                        </div>
                                    </div>
                                    {verifyingHMO && (
                                        <div className="verification-status pulse">
                                            <RefreshCw className="spin" size={14} /> Contacting HMO Gateway for eligibility...
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="system-hints margin-top-lg">
                            <div className="hint-item">
                                <QrCode size={16} /> Patient QR Wristband will be generated automatically.
                            </div>
                            <div className="hint-item">
                                <Smartphone size={16} /> Confirmation SMS will be sent to primary number on save.
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="reg-footer">
                <div className="btn-left">{step > 1 && <button onClick={() => setStep(step - 1)} className="dim-btn">Back to Previous Step</button>}</div>
                <div className="btn-right">
                    {step < 2 ? (
                        <button onClick={() => handleSave()} className="solid-btn">Save & Continue to Next Section</button>
                    ) : (
                        <div className="save-group">
                            <button onClick={() => handleSave(true)} className="outline-btn" disabled={loading}>
                                <RotateCcw size={16} /> Save & Register Another
                            </button>
                            <button onClick={() => handleSave(false)} className="solid-btn" disabled={loading}>
                                {loading ? <><RefreshCw size={16} className="spin" /> Processing...</> : <><CheckCircle size={16} /> Complete Registration</>}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PatientRegistration;
