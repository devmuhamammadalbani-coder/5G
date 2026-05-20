import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
    Calendar, Clock, User, Folder, AlertTriangle, AlertCircle,
    Circle, CheckCircle2, FileText, Stethoscope, Pill, ClipboardList,
    Activity, MapPin, X, ChevronRight, PenLine, Heart, Thermometer,
    Plus, ShieldCheck, FlaskConical, DoorOpen, Eye, Building2, Pin,
    BedDouble, Moon, Package, LogOut
} from 'lucide-react';
import auditLogger from '../utils/auditLogger';
import Preloader from '../components/common/Preloader';
import '../components/common/ProgressSheet.css';
import { medicineData } from '../utils/medicineData';

const WARDS = [
    { id: 'GOPD', label: 'General Outpatient (GOPD)' },
    { id: 'Pediatrics', label: 'Pediatrics Ward' },
    { id: 'OBG', label: 'Obstetrics & Gynecology' },
    { id: 'Surgical', label: 'Surgical Ward' },
    { id: 'ICU', label: 'Intensive Care Unit (ICU)' },
    { id: 'Orthopedic', label: 'Orthopedic Ward' },
    { id: 'Cardiology', label: 'Cardiology Unit' },
    { id: 'ENT', label: 'ENT Clinic' },
];

const CONDITION_COLORS = {
    Normal: { bg: '#f0fdf4', border: '#86efac', text: '#166534', icon: <CheckCircle2 size={14} /> },
    Urgent: { bg: '#fefce8', border: '#fde047', text: '#854d0e', icon: <AlertCircle size={14} /> },
    Emergency: { bg: '#fff1f2', border: '#fda4af', text: '#be123c', icon: <AlertTriangle size={14} /> },
};

const DoctorPortal = () => {
    const { user, users } = useAuth();
    const {
        patients, appointments, notes, addNote, addProgressNote, progressNotes,
        bookAppointment, completeAppointment, updateAppointmentCondition, addPrescription,
        addLabOrder, labOrders, markLabResultAsReviewed, loading,
        imagingOrders, addImagingOrder,
        rooms, departments, recommendAdmission, admissions,
        dischargePatient, addNotification, addClaim
    } = useData();

    const [view, setView] = useState('queue'); // 'queue' | 'consult'
    const [activeSection, setActiveSection] = useState('queue'); // 'queue' | 'inpatient'
    const [activeAppt, setActiveAppt] = useState(null);
    const [activePatient, setActivePatient] = useState(null);
    const [folderTab, setFolderTab] = useState('newNote'); // 'newNote' | 'history' | 'continuous'
    const [consultStartTime, setConsultStartTime] = useState(null);
    const [consultTimer, setConsultTimer] = useState(0);

    // Clinical note form — 7 HIM fields
    const [clinicalForm, setClinicalForm] = useState({
        chiefComplaint: '',
        vitalSigns: { bp: '', temp: '', pulse: '', resp: '', spo2: '', weight: '' },
        diagnosis: '',
        prescription: '',
        treatmentPlan: '',
        labOrders: '',
        imagingOrders: '',
        notes: '',
    });
    const [noteSubmitted, setNoteSubmitted] = useState(false);
    const [quickNote, setQuickNote] = useState('');
    const [submittingQuickNote, setSubmittingQuickNote] = useState(false);
    const [submittingAdmission, setSubmittingAdmission] = useState(false);

    // Drug Autocomplete States
    const [drugSearch, setDrugSearch] = useState('');
    const [showDrugList, setShowDrugList] = useState(false);
    const drugDropdownRef = useRef(null);

    // Filtered drugs based on search
    const filteredDrugs = useMemo(() => {
        if (!drugSearch) return [];
        return medicineData.filter(d =>
            d.toLowerCase().includes(drugSearch.toLowerCase())
        ).slice(0, 15); // Show top 15 matches
    }, [drugSearch]);

    // Close drug dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (drugDropdownRef.current && !drugDropdownRef.current.contains(event.target)) {
                setShowDrugList(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Follow-up booking state
    const [showFollowUp, setShowFollowUp] = useState(false);
    const [followUp, setFollowUp] = useState({ ward: '', doctorId: '', date: '', time: '', reason: '', priority: 'Normal' });
    const [showHistory, setShowHistory] = useState(false);

    const todayStr = new Date().toISOString().split('T')[0];
    const doctorWard = user.specialty || null;

    // Admission Recommendation State
    const [showAdmission, setShowAdmission] = useState(false);
    const [admissionForm, setAdmissionForm] = useState({
        wardId: '',
        roomId: '',
        bedNumber: '1',
        dailyRate: '5000',
        reason: ''
    });

    // ── Discharge Modal States ──────────────────────────────────────
    const [showDischargeModal, setShowDischargeModal] = useState(false);
    const [dischargingAdm, setDischargingAdm] = useState(null);
    const [submittingDischarge, setSubmittingDischarge] = useState(false);
    const [dischargeForm, setDischargeForm] = useState({
        finalDiagnosis: '',
        clinicalSummary: '',
        conditionOnDischarge: 'Stable',
        dischargeMedications: '',
        followUpPlan: '',
    });

    // All appointments assigned to this doctor (by ID — most reliable — OR by name for legacy records)
    const myAppts = useMemo(() =>
        appointments.filter(a => {
            const uid = user.id || user.uid;
            const isMyId = a.doctorId && a.doctorId === uid;
            const isMyName = a.doctorName && a.doctorName.toLowerCase().includes((user.name || '').toLowerCase());

            // Fix: Check both ward ID and ward Name for general queue routing
            const isMyWardId = a.wardId && a.wardId === doctorWard;
            const isMyWardName = a.ward && a.ward.toLowerCase().includes((doctorWard || '').toLowerCase());
            const isMyWardQueue = a.isGeneralQueue && (isMyWardId || isMyWardName);

            return isMyId || isMyName || isMyWardQueue;
        })
            .sort((a, b) => {
                // Emergency → Urgent → Normal at top, then by date
                const priority = { Emergency: 0, Urgent: 1, Normal: 2 };
                const pa = priority[a.condition || a.priority] ?? 2;
                const pb = priority[b.condition || b.priority] ?? 2;
                if (pa !== pb) return pa - pb;
                return new Date(a.date) - new Date(b.date);
            }),
        [appointments, user.name, user.id, user.uid, doctorWard]);

    const isOlderThan24Hours = (dateStr, timeStr) => {
        if (!dateStr) return false;
        let apptDateStr = `${dateStr}T${timeStr || '00:00'}`;
        let apptDate = new Date(apptDateStr);
        if (isNaN(apptDate.getTime())) {
            apptDate = new Date(dateStr);
        }
        if (isNaN(apptDate.getTime())) return false;
        const now = new Date();
        return (now - apptDate) > 24 * 60 * 60 * 1000;
    };

    const activeAppts = useMemo(() => myAppts.filter(a => a.date === todayStr), [myAppts, todayStr]);
    const historyAppts = useMemo(() => myAppts.filter(a => a.date < todayStr || a.status === 'Seen'), [myAppts, todayStr]);

    const pending = activeAppts.filter(a => a.status === 'AwaitingConsultation');
    const seen = activeAppts.filter(a => a.status === 'Seen');

    // Today's urgent/emergency count
    const urgentCount = pending.filter(a => a.condition === 'Emergency' || a.condition === 'Urgent' || a.priority === 'Urgent' || a.priority === 'Emergency').length;

    // Lab results sent back to this doctor (completed, not yet reviewed)
    const myLabResultsAll = useMemo(() =>
        labOrders.filter(o =>
            o.status === 'Completed' &&
            (o.doctorId === (user.id || user.uid) || (o.doctorName && o.doctorName.toLowerCase().includes(user.name.toLowerCase())))
        ).sort((a, b) => {
            const dA = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(a.completedAt || 0);
            const dB = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(b.completedAt || 0);
            return dB - dA;
        }),
        [labOrders, user]);

    const myLabRequestsAll = useMemo(() =>
        labOrders.filter(o =>
            (o.status === 'Pending' || o.status === 'Processing') &&
            (o.doctorId === (user.id || user.uid) || (o.doctorName && o.doctorName.toLowerCase().includes(user.name.toLowerCase())))
        ).sort((a, b) => {
            const dA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
            const dB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
            return dB - dA;
        }),
        [labOrders, user]);

    const historicLabRequests = useMemo(() =>
        myLabRequestsAll.filter(o => {
            if (o.date && o.date < todayStr) return true;
            if (o.createdAt) {
                const d = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
                if (!isNaN(d.getTime())) return d.toISOString().split('T')[0] < todayStr;
            }
            return false;
        }),
        [myLabRequestsAll, todayStr]);

    const isLabOlderThan24Hours = (completedAt) => {
        if (!completedAt) return false;
        const labDate = new Date(completedAt);
        if (isNaN(labDate.getTime())) return false;
        const now = new Date();
        return (now - labDate) > 24 * 60 * 60 * 1000;
    };

    const myLabResults = useMemo(() => myLabResultsAll.filter(o => !o.reviewed && !isLabOlderThan24Hours(o.completedAt)), [myLabResultsAll]);
    const historicLabResults = useMemo(() => myLabResultsAll.filter(o => o.reviewed || isLabOlderThan24Hours(o.completedAt)), [myLabResultsAll]);

    // ── INPATIENT WARD ROUNDS DATA ─────────────────────────────────────────────
    // All active admissions in the doctor's ward
    const myInpatients = useMemo(() => {
        const ward = doctorWard;
        return admissions.filter(a => {
            if (!['Active', 'Recommended', 'PendingRenewal'].includes(a.status)) return false;
            if (!ward) return true; // If no ward set, show all
            const matchesWardId = a.wardId && a.wardId.toLowerCase() === ward.toLowerCase();
            const matchesWardName = a.wardName && a.wardName.toLowerCase().includes(ward.toLowerCase());
            return matchesWardId || matchesWardName;
        }).sort((a, b) => {
            // Sort by admission date (oldest first — longest stay at top)
            const dA = a.admittedAt?.toDate ? a.admittedAt.toDate() : new Date(a.admittedAt || a.createdAt || 0);
            const dB = b.admittedAt?.toDate ? b.admittedAt.toDate() : new Date(b.admittedAt || b.createdAt || 0);
            return dA - dB;
        });
    }, [admissions, doctorWard]);

    // Days on ward calculator
    const getDaysOnWard = (admission) => {
        const admitted = admission.admittedAt?.toDate
            ? admission.admittedAt.toDate()
            : new Date(admission.admittedAt || admission.createdAt || Date.now());
        const diff = Date.now() - admitted.getTime();
        return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    };

    // Per-patient pending items
    const getInpatientStatus = (patientId) => {
        const hasUnreviewedLab = labOrders.some(o => o.patientId === patientId && o.status === 'Completed' && !o.reviewed);
        const hasUnreviewedRad = imagingOrders.some(o => o.patientId === patientId && o.status === 'Completed' && !o.reviewed);
        const hasPendingPharmacy = false; // Future: check prescriptions collection
        return { hasUnreviewedLab, hasUnreviewedRad, hasPendingPharmacy };
    };

    // Results back logic for queue cards
    const getPatientResultsStatus = (patientId) => {
        const pid = patientId;
        const hasPendingLabs = labOrders.some(o => (o.patientId === pid) && o.status === 'Completed' && !o.reviewed);
        const hasPendingRads = imagingOrders.some(o => (o.patientId === pid) && o.status === 'Completed' && !o.reviewed);
        return hasPendingLabs || hasPendingRads;
    };

    const formatLabResults = (resultString) => {
        if (!resultString) return null;

        const templateMatch = resultString.match(/^\[(.*?) Report\]\s*(.*)/);
        let title = null;
        let content = resultString;

        if (templateMatch) {
            title = templateMatch[1];
            content = templateMatch[2];
        }

        if (content.includes(';') && content.includes(':')) {
            const pairs = content.split(';').map(s => s.trim()).filter(Boolean);
            return (
                <div className="structured-lab-report" style={{ background: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                    {title && <div style={{ background: '#eff6ff', padding: '10px 15px', color: '#1d4ed8', fontWeight: 600, borderBottom: '1px solid #bfdbfe' }}>{title} Panel</div>}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <tbody>
                            {pairs.map((pair, idx) => {
                                const [key, ...valParts] = pair.split(':');
                                const value = valParts.join(':').trim();
                                return (
                                    <tr key={idx} style={{ borderBottom: idx === pairs.length - 1 ? 'none' : '1px solid #e2e8f0', background: idx % 2 === 0 ? '#f8fafc' : '#ffffff' }}>
                                        <td style={{ padding: '8px 15px', fontWeight: 600, color: '#475569', width: '40%', borderRight: '1px solid #e2e8f0' }}>{key.trim()}</td>
                                        <td style={{ padding: '8px 15px', color: '#0f172a' }}>{value || '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            );
        }

        return (
            <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.95rem', lineHeight: '1.6' }}>
                {title && <h5 style={{ color: '#0369a1', marginBottom: '8px' }}>{title} Report</h5>}
                {content}
            </div>
        );
    };

    // Authorized doctors in each ward for follow-up booking
    const authDoctors = useMemo(() => users.filter(u => u.role === 'Doctor' && u.isActive), [users]);
    const followUpDoctors = useMemo(() => {
        if (!followUp.ward) return [];
        return authDoctors.filter(d => d.specialty === followUp.ward);
    }, [authDoctors, followUp.ward]);

    const availableBeds = useMemo(() => {
        if (!admissionForm.roomId) return [];
        const room = rooms.find(r => r.id === admissionForm.roomId);
        if (!room) return [];

        // Count any bed that is Recommended, Active, or PendingRenewal as "Occupied"
        const occupied = admissions
            .filter(a => a.roomId === room.id && ['Active', 'Recommended', 'PendingRenewal'].includes(a.status))
            .map(a => String(a.bedNumber));

        const beds = [];
        const capacity = parseInt(room.capacity) || 0;
        // Loop through the entire room capacity to ensure all beds are available
        for (let i = 1; i <= capacity; i++) {
            if (!occupied.includes(String(i))) {
                beds.push(String(i));
            }
        }
        return beds;
    }, [admissions, rooms, admissionForm.roomId]);

    React.useEffect(() => {
        let interval;
        if (view === 'consult' && consultStartTime) {
            interval = setInterval(() => {
                setConsultTimer(Math.round((Date.now() - consultStartTime) / 1000));
            }, 1000);
        } else {
            setConsultTimer(0);
        }
        return () => clearInterval(interval);
    }, [view, consultStartTime]);

    // Handle bed number auto-selection when room changes
    React.useEffect(() => {
        if (availableBeds.length > 0) {
            if (!admissionForm.bedNumber || !availableBeds.includes(admissionForm.bedNumber)) {
                setAdmissionForm(prev => ({ ...prev, bedNumber: availableBeds[0] }));
            }
        } else {
            setAdmissionForm(prev => ({ ...prev, bedNumber: '' }));
        }
    }, [availableBeds, admissionForm.roomId]);


    // ── DISCHARGE HANDLER ───────────────────────────────────────────
    const handleSignDischarge = async (e) => {
        e.preventDefault();
        if (!dischargingAdm) return;
        setSubmittingDischarge(true);
        try {
            const summaryData = {
                ...dischargeForm,
                dischargedBy: `Dr. ${user.name}`,
            };

            // 1. Write discharge summary to admissions — status becomes 'ReadyForRelease'
            await dischargePatient(dischargingAdm.id, summaryData);

            // 2. If discharge medications — create a prescription (goes to Pharmacy → Billing)
            if (dischargeForm.dischargeMedications.trim()) {
                await addPrescription({
                    patientId: dischargingAdm.patientId,
                    patientName: dischargingAdm.patientName,
                    admissionId: dischargingAdm.id,
                    doctorId: user.id || user.uid,
                    doctorName: user.name,
                    ward: dischargingAdm.wardName || '',
                    drugs: dischargeForm.dischargeMedications,
                    notes: `Discharge medications — ${dischargeForm.followUpPlan}`,
                    type: 'DischargeMedication',
                    status: 'Pending',
                    billingStatus: 'Unpaid',
                });
            }

            // 3. Notify Nursing Station via RTDB
            await addNotification({
                type: 'DISCHARGE_READY',
                title: '🟢 Patient Ready for Release',
                message: `Dr. ${user.name} has signed the discharge summary for ${dischargingAdm.patientName}. Bed ${dischargingAdm.bedNumber} — ${dischargingAdm.wardName}. Condition: ${dischargeForm.conditionOnDischarge}.`,
                patientId: dischargingAdm.patientId,
                patientName: dischargingAdm.patientName,
                admissionId: dischargingAdm.id,
                bedNumber: dischargingAdm.bedNumber,
                wardName: dischargingAdm.wardName,
                targetRole: 'Nurse',
                priority: 'high',
                isRead: false,
            });

            // 4. Print Discharge Summary document
            const printWindow = window.open('', '_blank', 'width=800,height=900');
            if (printWindow) {
                printWindow.document.write(`
                    <!DOCTYPE html><html><head>
                    <title>Discharge Summary — ${dischargingAdm.patientName}</title>
                    <style>
                        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #0f172a; }
                        .header { text-align: center; border-bottom: 3px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px; }
                        .hospital-name { font-size: 22px; font-weight: 900; color: #1e293b; letter-spacing: 1px; }
                        .doc-title { font-size: 16px; color: #475569; margin-top: 6px; font-weight: 600; }
                        .section { margin-bottom: 22px; }
                        .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
                        .section-value { font-size: 14px; color: #0f172a; line-height: 1.7; white-space: pre-wrap; }
                        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e2e8f0; }
                        .meta-item label { display: block; font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
                        .meta-item span { font-size: 14px; font-weight: 600; color: #0f172a; }
                        .condition-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: 700; font-size: 13px; background: #dcfce7; color: #166534; }
                        .signature-block { margin-top: 50px; border-top: 1px dashed #cbd5e1; padding-top: 16px; display: flex; justify-content: space-between; }
                        .sig-line { font-size: 13px; color: #475569; }
                        @media print { body { margin: 20px; } }
                    </style>
                    </head><body>
                    <div class='header'>
                        <div class='hospital-name'>SAHARA HOSPITAL</div>
                        <div class='doc-title'>CLINICAL DISCHARGE SUMMARY</div>
                    </div>
                    <div class='meta-grid'>
                        <div class='meta-item'><label>Patient Name</label><span>${dischargingAdm.patientName}</span></div>
                        <div class='meta-item'><label>Bed / Ward</label><span>Bed ${dischargingAdm.bedNumber} &bull; ${dischargingAdm.wardName}</span></div>
                        <div class='meta-item'><label>Condition on Discharge</label><span class='condition-badge'>${dischargeForm.conditionOnDischarge}</span></div>
                        <div class='meta-item'><label>Discharge Date</label><span>${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span></div>
                    </div>
                    <div class='section'><div class='section-label'>Final Diagnosis</div><div class='section-value'>${dischargeForm.finalDiagnosis}</div></div>
                    <div class='section'><div class='section-label'>Clinical Summary (Treatment Provided)</div><div class='section-value'>${dischargeForm.clinicalSummary}</div></div>
                    <div class='section'><div class='section-label'>Discharge Medications (Take Home)</div><div class='section-value'>${dischargeForm.dischargeMedications || 'None prescribed'}</div></div>
                    <div class='section'><div class='section-label'>Follow-Up Plan</div><div class='section-value'>${dischargeForm.followUpPlan || 'No follow-up required'}</div></div>
                    <div class='section'><div class='section-label'>Admission Reason</div><div class='section-value'>${dischargingAdm.reason || 'Not recorded'}</div></div>
                    <div class='signature-block'>
                        <div class='sig-line'>Signed by: <strong>Dr. ${user.name}</strong><br/>Date: ${new Date().toLocaleString()}</div>
                        <div class='sig-line' style='text-align:right'>Patient / Guardian Signature:<br/><br/>_______________________</div>
                    </div>
                    <script>window.onload = () => { window.print(); }</script>
                    </body></html>
                `);
                printWindow.document.close();
            }

            auditLogger.log(user, 'WRITE', 'DISCHARGE', dischargingAdm.id, `Signed discharge for ${dischargingAdm.patientName} — ${dischargeForm.conditionOnDischarge}`);

            setShowDischargeModal(false);
            setDischargingAdm(null);
            setDischargeForm({ finalDiagnosis: '', clinicalSummary: '', conditionOnDischarge: 'Stable', dischargeMedications: '', followUpPlan: '' });
        } catch (err) {
            alert(`Discharge Error: ${err.message}`);
        } finally {
            setSubmittingDischarge(false);
        }
    };

    const formatTimer = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const openConsult = (appt) => {
        // Robust find: check both Firestore doc ID and custom patientID field
        const patient = patients.find(p => p.id === appt.patientId || (p.patientID && p.patientID === appt.patientId));
        setActiveAppt(appt);
        setActivePatient(patient);
        setFolderTab('newNote');
        setClinicalForm({
            chiefComplaint: appt.reason || '',
            vitalSigns: appt.vitals || { bp: '', temp: '', pulse: '', resp: '', spo2: '', weight: '' },
            diagnosis: '',
            prescription: '',
            treatmentPlan: '',
            labOrders: '',
            imagingOrders: '',
            notes: ''
        });
        setNoteSubmitted(false);
        setShowFollowUp(false);
        setConsultStartTime(Date.now());
        setConsultTimer(0);
        auditLogger.log(user, 'READ', 'PATIENT_FOLDER', appt.patientId, `Opened consultation for ${patient?.name}`);
        setView('consult');
    };

    const patientNotes = useMemo(() => {
        if (!activePatient) return [];
        return notes.filter(n => n.patientId === activePatient.id || (activePatient.patientID && n.patientId === activePatient.patientID))
            .sort((a, b) => {
                const getD = (x) => (x?.toDate ? x.toDate() : (x ? new Date(x) : new Date(0)));
                const dA = getD(a.createdAt || a.signedAt || a.timestamp);
                const dB = getD(b.createdAt || b.signedAt || b.timestamp);
                return dB - dA;
            });
    }, [notes, activePatient]);

    const appointmentsWithData = useMemo(() => {
        if (!activePatient) return [];
        const pid = activePatient.id || activePatient.patientID;
        const patientAppts = appointments.filter(a => a.patientId === pid);

        return patientAppts.map(appt => {
            const note = notes.find(n => n.appointmentId === appt.id);
            const labs = labOrders.filter(l => l.appointmentId === appt.id);
            const rads = imagingOrders.filter(i => i.appointmentId === appt.id);
            return { ...appt, note, labs, rads };
        }).sort((a, b) => {
            const dateA = new Date(a.date + (a.time ? 'T' + a.time : ''));
            const dateB = new Date(b.date + (b.time ? 'T' + b.time : ''));
            return dateB - dateA;
        });
    }, [activePatient, appointments, notes, labOrders, imagingOrders]);

    const patientContinuousSheet = useMemo(() => {
        if (!activePatient) return [];
        return progressNotes.filter(n => n.patientId === activePatient.id || (activePatient.patientID && n.patientId === activePatient.patientID))
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)); // Chronological "Continuous" order
    }, [progressNotes, activePatient]);

    const handleVitalBlur = (field, unit) => {
        setClinicalForm(p => {
            let val = p.vitalSigns[field].trim();
            if (val && !val.includes(unit)) {
                val = `${val} ${unit}`;
            }
            return { ...p, vitalSigns: { ...p.vitalSigns, [field]: val } };
        });
    };

    const handleSubmitNote = (e) => {
        e.preventDefault();
        const durationMinutes = consultStartTime ? Math.max(1, Math.round((Date.now() - consultStartTime) / 60000)) : 1;
        const noteRecord = {
            patientId: activePatient.id,
            appointmentId: activeAppt.id,
            provider: user.name,
            role: 'Doctor',
            ward: doctorWard || activeAppt.ward,
            type: 'Clinical Encounter',
            chiefComplaint: clinicalForm.chiefComplaint,
            vitalSigns: clinicalForm.vitalSigns,
            diagnosis: clinicalForm.diagnosis,
            prescription: clinicalForm.prescription,
            treatmentPlan: clinicalForm.treatmentPlan,
            labOrders: clinicalForm.labOrders,
            imagingOrders: clinicalForm.imagingOrders,
            notes: clinicalForm.notes,
            duration: durationMinutes,
            signature: `Dr. ${user.name}`,
            signedAt: new Date().toISOString(),
        };
        addNote(noteRecord);

        // Also add to the Continuous Progress Sheet
        addProgressNote({
            patientId: activePatient.id,
            patientName: activePatient.name,
            appointmentId: activeAppt.id,
            provider: user.name,
            role: 'Doctor',
            type: 'CONSULTATION',
            duration: durationMinutes,
            text: `CONSULTATION NOTE:\nDx: ${clinicalForm.diagnosis}\nPlan: ${clinicalForm.treatmentPlan}\nPrescribed: ${clinicalForm.prescription}\nLabs: ${clinicalForm.labOrders}`,
            vitals: clinicalForm.vitalSigns,
            timestamp: Date.now()
        });

        // Send to pharmacy if there is a prescription written
        if (clinicalForm.prescription.trim()) {
            addPrescription({
                patientId: activePatient.id,
                patientName: activePatient.name,
                appointmentId: activeAppt.id, // Linked to visit
                doctorId: user.id || user.uid,
                doctorName: user.name,
                ward: doctorWard || activeAppt.ward,
                drugs: clinicalForm.prescription,
                notes: clinicalForm.notes,
                status: 'Pending',
                billingStatus: 'Unpaid'
            });
            auditLogger.log(user, 'WRITE', 'PRESCRIPTION', activePatient.id, `Sent prescription for ${activePatient.name}`);
        }

        completeAppointment(activeAppt.id);

        // Send to Laboratory if there are lab orders written
        if (clinicalForm.labOrders.trim()) {
            addLabOrder({
                patientId: activePatient.id,
                patientName: activePatient.name,
                appointmentId: activeAppt.id, // Linked to visit
                doctorId: user.id || user.uid,
                doctorName: user.name,
                ward: doctorWard || activeAppt.ward,
                labTests: clinicalForm.labOrders,
                chiefComplaint: clinicalForm.chiefComplaint,
                diagnosis: clinicalForm.diagnosis,
                priority: activeAppt.condition || activeAppt.priority || 'Normal'
            });
            auditLogger.log(user, 'WRITE', 'LAB_ORDER', activePatient.id, `Sent lab order for ${activePatient.name}`);
        }

        // Send to Radiology if there are imaging orders written
        if (clinicalForm.imagingOrders.trim()) {
            addImagingOrder({
                patientId: activePatient.id,
                patientName: activePatient.name,
                appointmentId: activeAppt.id,
                doctorId: user.id || user.uid,
                doctorName: user.name,
                ward: doctorWard || activeAppt.ward,
                imagingTests: clinicalForm.imagingOrders,
                chiefComplaint: clinicalForm.chiefComplaint,
                diagnosis: clinicalForm.diagnosis,
                priority: activeAppt.condition || activeAppt.priority || 'Normal'
            });
            auditLogger.log(user, 'WRITE', 'IMAGING_ORDER', activePatient.id, `Sent imaging order for ${activePatient.name}`);
        }

        auditLogger.log(user, 'WRITE', 'CLINICAL_NOTE', activePatient.id, `Clinical note filed for ${activePatient.name} — Dx: ${clinicalForm.diagnosis}`);
        setNoteSubmitted(true);
        setFolderTab('history');
    };

    const handleAddQuickNote = async (e) => {
        e.preventDefault();
        if (!quickNote.trim()) return;

        setSubmittingQuickNote(true);
        const duration = consultStartTime ? Math.max(1, Math.round((Date.now() - consultStartTime) / 60000)) : 1;

        try {
            await addProgressNote({
                patientId: activePatient.id,
                patientName: activePatient.name,
                appointmentId: activeAppt.id,
                provider: user.name,
                role: user.role || 'Doctor',
                type: 'PROGRESS NOTE',
                duration: duration,
                text: quickNote,
                timestamp: Date.now()
            });

            auditLogger.log(user, 'WRITE', 'PROGRESS_NOTE', activePatient.id, `Added quick progress note for ${activePatient.name}`);
            setQuickNote('');
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setSubmittingQuickNote(false);
        }
    };

    const handleRecommendAdmission = async (e) => {
        e.preventDefault();
        const room = rooms.find(r => r.id === admissionForm.roomId);
        const dept = departments.find(d => d.id === admissionForm.wardId);

        setSubmittingAdmission(true);
        try {
            await recommendAdmission({
                patientId: activePatient.id,
                patientName: activePatient.name,
                wardId: dept.id,
                wardName: dept.name,
                roomId: room.id,
                roomName: room.name,
                bedNumber: admissionForm.bedNumber,
                dailyRate: parseFloat(room.dailyRate || 0),
                doctorId: user.id || user.uid,
                doctorName: user.name,
                reason: admissionForm.reason || clinicalForm.diagnosis,
            });

            auditLogger.log(user, 'WRITE', 'ADMISSION_RECOMMENDED', activePatient.id, `Recommended admission to ${room.name} (${dept.name})`);
            setShowAdmission(false);
            alert(`Admission recommendation for ${activePatient.name} sent to the Billing Office.`);
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setSubmittingAdmission(false);
        }
    };

    const handleFollowUpBook = async (e) => {
        e.preventDefault();
        const docRecord = users.find(u => u.id === followUp.doctorId);
        const wardLabel = WARDS.find(w => w.id === followUp.ward)?.label || followUp.ward;

        try {
            await bookAppointment({
                ...followUp,
                ward: wardLabel,
                wardId: followUp.ward,
                doctorId: followUp.doctorId,
                patientId: activePatient.id,
                patientName: activePatient.name,
                doctorName: docRecord ? `Dr. ${docRecord.name}` : 'Unassigned',
                status: 'PendingBilling', // Logic: Always goes to Biller first
            });

            auditLogger.log(user, 'WRITE', 'APPOINTMENT', activePatient.id, `Follow-up booked at ${wardLabel} with ${docRecord?.name}. Awaiting billing on ${followUp.date}.`);
            setShowFollowUp(false);
            alert(`Follow-up appointment scheduled for ${followUp.date}. It will appear on the Biller's dashboard on that day.`);
        } catch (err) {
            console.error('Follow-up error:', err);
            alert(`Error: ${err.message}`);
        }
    };

    const conditionStyle = (appt) => {
        const flag = appt.condition || appt.priority || 'Normal';
        return CONDITION_COLORS[flag] || CONDITION_COLORS.Normal;
    };

    // ── CONSULT VIEW ──────────────────────────────────────────────────────────
    if (view === 'consult' && activeAppt && activePatient) {
        return (
            <div className="doctor-portal-page">
                {/* Consult Header */}
                <div className="consult-header">
                    <div className="consult-breadcrumb">
                        <button className="back-btn" onClick={() => { setView('queue'); setActiveAppt(null); setActivePatient(null); }}>
                            ← My Queue
                        </button>
                        <ChevronRight size={14} style={{ color: '#94a3b8' }} />
                        <span>Consultation</span>
                    </div>
                    <div className="consult-patient-banner">
                        <div className="consult-patient-avatar">{activePatient.name?.charAt(0)}</div>
                        <div>
                            <h3>{activePatient.name}</h3>
                            <span className="consult-meta">{activePatient.age}yrs &bull; {activePatient.gender}</span>
                        </div>
                        <div className={`consult-priority-flag ${(activeAppt.condition || activeAppt.priority || 'Normal').toLowerCase()}`}>
                            {(activeAppt.condition || activeAppt.priority || 'Normal')}
                        </div>
                        <div className="consult-appt-info">
                            <span><Clock size={12} /> {activeAppt.time}</span>
                            <span><MapPin size={12} /> {activeAppt.ward}</span>
                        </div>
                    </div>
                </div>

                <div className="consult-body">
                    {/* ── Left: Folder Tabs ── */}
                    <div className="consult-folder">
                        <div className="folder-tabs">
                            <button className={`folder-tab ${folderTab === 'newNote' ? 'active' : ''}`} onClick={() => setFolderTab('newNote')}>
                                <PenLine size={15} /> New Clinical File
                            </button>
                            <button className={`folder-tab ${folderTab === 'continuous' ? 'active' : ''}`} onClick={() => setFolderTab('continuous')}>
                                <ClipboardList size={15} /> Continuous Progress Sheet
                            </button>
                            <button className={`folder-tab ${folderTab === 'history' ? 'active' : ''}`} onClick={() => setFolderTab('history')}>
                                <Folder size={15} /> Visit History ({patientNotes.length})
                            </button>
                            <button className={`folder-tab ${folderTab === 'accommodation' ? 'active' : ''}`} onClick={() => setFolderTab('accommodation')}>
                                <Building2 size={15} /> Accommodation Center
                            </button>
                        </div>

                        {/* ── New Clinical Note Form ── */}
                        {folderTab === 'newNote' && (
                            noteSubmitted ? (
                                <div className="note-success">
                                    <CheckCircle2 size={48} className="success-green" />
                                    <h3>Clinical File Saved &amp; Signed</h3>
                                    <p>The encounter has been recorded under <strong>{activePatient.name}'s</strong> folder and marked as <span className="badge paid">Seen</span>.</p>
                                    <button className="primary-btn" onClick={() => setFolderTab('history')}>View History</button>
                                </div>
                            ) : (
                                <form className="clinical-form" onSubmit={handleSubmitNote}>
                                    <div className="clinical-form-title">
                                        <FileText size={18} /> Clinical Encounter Record
                                        <span className="lab-badge">Lab Standard</span>
                                    </div>

                                    {/* 1. Chief Complaint */}
                                    <div className="cf-section">
                                        <div className="cf-label"><span className="cf-num">1</span> Chief Complaint <span className="cf-req">*</span></div>
                                        <textarea required rows={2} placeholder="Patient's primary complaint in their own words..."
                                            value={clinicalForm.chiefComplaint}
                                            onChange={e => setClinicalForm(p => ({ ...p, chiefComplaint: e.target.value }))} />
                                    </div>

                                    {/* 2. Vital Signs */}
                                    <div className="cf-section">
                                        <div className="cf-label"><span className="cf-num">2</span> Vital Signs</div>
                                        <div className="vitals-grid">
                                            <div className="vital-field">
                                                <label><Heart size={12} /> Blood Pressure</label>
                                                <input type="text" placeholder="e.g. 120/80 mmHg"
                                                    value={clinicalForm.vitalSigns.bp}
                                                    onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, bp: e.target.value } }))}
                                                    onBlur={() => handleVitalBlur('bp', 'mmHg')} />
                                            </div>
                                            <div className="vital-field">
                                                <label><Thermometer size={12} /> Temperature</label>
                                                <input type="text" placeholder="e.g. 37.0°C"
                                                    value={clinicalForm.vitalSigns.temp}
                                                    onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, temp: e.target.value } }))}
                                                    onBlur={() => handleVitalBlur('temp', '°C')} />
                                            </div>
                                            <div className="vital-field">
                                                <label><Activity size={12} /> Pulse Rate</label>
                                                <input type="text" placeholder="bpm"
                                                    value={clinicalForm.vitalSigns.pulse}
                                                    onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, pulse: e.target.value } }))}
                                                    onBlur={() => handleVitalBlur('pulse', 'bpm')} />
                                            </div>
                                            <div className="vital-field">
                                                <label><Activity size={12} /> Respiratory Rate</label>
                                                <input type="text" placeholder="breaths/min"
                                                    value={clinicalForm.vitalSigns.resp}
                                                    onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, resp: e.target.value } }))}
                                                    onBlur={() => handleVitalBlur('resp', 'breaths/min')} />
                                            </div>
                                            <div className="vital-field">
                                                <label>SpO₂</label>
                                                <input type="text" placeholder="%"
                                                    value={clinicalForm.vitalSigns.spo2}
                                                    onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, spo2: e.target.value } }))}
                                                    onBlur={() => handleVitalBlur('spo2', '%')} />
                                            </div>
                                            <div className="vital-field">
                                                <label>Weight</label>
                                                <input type="text" placeholder="kg"
                                                    value={clinicalForm.vitalSigns.weight}
                                                    onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, weight: e.target.value } }))}
                                                    onBlur={() => handleVitalBlur('weight', 'kg')} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. Diagnosis */}
                                    <div className="cf-section">
                                        <div className="cf-label"><span className="cf-num">3</span> Diagnosis / Assessment <span className="cf-req">*</span></div>
                                        <textarea required rows={2} placeholder="ICD-10 code or clinical diagnosis..."
                                            value={clinicalForm.diagnosis}
                                            onChange={e => setClinicalForm(p => ({ ...p, diagnosis: e.target.value }))} />
                                    </div>

                                    {/* 4. Prescription */}
                                    <div className="cf-section">
                                        <div className="cf-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span><span className="cf-num">4</span> Prescription / Medications</span>
                                            <span className="helper-text" style={{ fontSize: '0.75rem', fontWeight: 400 }}>Select generic drug to avoid typing error</span>
                                        </div>

                                        {/* Searchable Medicine Selector */}
                                        <div className="searchable-select" ref={drugDropdownRef} style={{ marginBottom: '10px' }}>
                                            <div className="custom-select-wrapper">
                                                <input
                                                    type="text"
                                                    placeholder="Search medicine library (e.g. Paracetamol)..."
                                                    value={drugSearch}
                                                    onChange={(e) => {
                                                        setDrugSearch(e.target.value);
                                                        setShowDrugList(true);
                                                    }}
                                                    onFocus={() => setShowDrugList(true)}
                                                    style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', width: '100%' }}
                                                />
                                                {showDrugList && drugSearch && (
                                                    <div className="select-dropdown-list" style={{ top: '100%', left: 0, width: '100%', maxHeight: '200px', overflowY: 'auto', zIndex: 100, border: '1px solid #e2e8f0', borderTop: 'none' }}>
                                                        {filteredDrugs.length > 0 ? (
                                                            filteredDrugs.map(d => (
                                                                <div
                                                                    key={d}
                                                                    className="dropdown-item"
                                                                    onClick={() => {
                                                                        const current = clinicalForm.prescription;
                                                                        const prefix = current && !current.endsWith('\n') ? '\n' : '';
                                                                        setClinicalForm({ ...clinicalForm, prescription: current + prefix + d + ' ' });
                                                                        setDrugSearch('');
                                                                        setShowDrugList(false);
                                                                    }}
                                                                >
                                                                    <Pill size={14} style={{ marginRight: '8px', color: '#3b82f6' }} />
                                                                    {d}
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="dropdown-item disabled">No matching drug found</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <textarea rows={4} placeholder="Selected drugs will appear here. Add dosage (e.g. 500mg TDS 3/7)..."
                                            value={clinicalForm.prescription}
                                            onChange={e => setClinicalForm(p => ({ ...p, prescription: e.target.value }))} />
                                    </div>

                                    {/* 5. Treatment Plan */}
                                    <div className="cf-section">
                                        <div className="cf-label"><span className="cf-num">5</span> Treatment Plan</div>
                                        <textarea rows={2} placeholder="Management plan, referrals, lifestyle advice..."
                                            value={clinicalForm.treatmentPlan}
                                            onChange={e => setClinicalForm(p => ({ ...p, treatmentPlan: e.target.value }))} />
                                    </div>

                                    {/* Lab Orders */}
                                    <div className="cf-section">
                                        <div className="cf-label"><span className="cf-num">6</span> Lab Orders</div>
                                        <textarea rows={2} placeholder="E.g. FBC, LFT, Malaria RDT..."
                                            value={clinicalForm.labOrders}
                                            onChange={e => setClinicalForm(p => ({ ...p, labOrders: e.target.value }))} />
                                    </div>

                                    {/* Radiology Orders */}
                                    <div className="cf-section">
                                        <div className="cf-label"><span className="cf-num">7</span> Radiology / Imaging Orders</div>
                                        <textarea rows={2} placeholder="E.g. Chest X-Ray, Abdominal Scan..."
                                            value={clinicalForm.imagingOrders}
                                            onChange={e => setClinicalForm(p => ({ ...p, imagingOrders: e.target.value }))} />
                                    </div>

                                    {/* Additional Notes */}
                                    <div className="cf-section">
                                        <div className="cf-label"><span className="cf-num">8</span> Additional Clinical Notes</div>
                                        <textarea rows={2} placeholder="Any additional observations, complications or progress..."
                                            value={clinicalForm.notes}
                                            onChange={e => setClinicalForm(p => ({ ...p, notes: e.target.value }))} />
                                    </div>

                                    {/* Digital Signature */}
                                    <div className="digital-signature-block">
                                        <PenLine size={16} />
                                        <div className="sig-content">
                                            <span className="sig-label">Digital Signature</span>
                                            <span className="sig-name">Dr. {user.name}</span>
                                            <span className="sig-time">{new Date().toLocaleString()}</span>
                                        </div>
                                        <ShieldCheck size={18} className="sig-shield" />
                                    </div>

                                    {/* Condition display (Doctors can no longer edit - only Nurses/Receptionists) */}
                                    <div className="condition-display-only">
                                        <label>Patient Condition:</label>
                                        <span className={`condition-pill ${(activeAppt.condition || 'Normal').toLowerCase()}`}>
                                            {activeAppt.condition || 'Normal'}
                                        </span>
                                    </div>

                                    <button type="submit" className="submit-note-btn">
                                        <CheckCircle2 size={18} /> Save &amp; Sign Clinical File
                                    </button>
                                </form>
                            )
                        )}

                        {/* ── Continuous Progress Sheet (Big Paper Sheet) ── */}
                        {folderTab === 'continuous' && (
                            <div className="continuous-sheet-container">
                                <div className="sheet-paper">
                                    <div className="sheet-header">
                                        <div className="hospital-brand">
                                            <h4>5G E-GURU CLINIC</h4>
                                            <p>CONTINUOUS MEDICAL PROGRESS RECORD</p>
                                        </div>
                                        <div className="patient-identifier">
                                            <span>NAME: {activePatient.name}</span>
                                            <span>ID: {activePatient.id?.substring(0, 8)}</span>
                                        </div>
                                    </div>

                                    <div className="sheet-timeline">
                                        {/* Quick Writing Section */}
                                        <div className="quick-write-section">
                                            <textarea
                                                placeholder="Write a quick progress note or observation here..."
                                                value={quickNote}
                                                onChange={e => setQuickNote(e.target.value)}
                                            />
                                            <button
                                                className="pin-note-btn"
                                                onClick={handleAddQuickNote}
                                                disabled={!quickNote.trim() || submittingQuickNote}
                                            >
                                                <Pin size={14} /> Pin to Sheet
                                            </button>
                                        </div>

                                        {patientContinuousSheet.length === 0 ? (
                                            <div className="sheet-empty">No entries in the continuous sheet yet. Begin consultation to add notes.</div>
                                        ) : (
                                            patientContinuousSheet.map((entry, idx) => (
                                                <div key={entry.id || idx} className="sheet-entry">
                                                    <div className="entry-left">
                                                        <span className="entry-date">{new Date(entry.timestamp).toLocaleDateString()}</span>
                                                        <span className="entry-time">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        {entry.duration && <span className="entry-duration">{entry.duration} mins</span>}
                                                    </div>
                                                    <div className="entry-right">
                                                        <div className="entry-role">
                                                            <span className={`role-badge ${entry.role?.toLowerCase()}`}>{entry.role}</span>
                                                            <strong>{entry.provider}</strong>
                                                            <span className="entry-type">{entry.type}</span>
                                                        </div>
                                                        <div className="entry-content">
                                                            {entry.vitals && (
                                                                <div className="entry-vitals-mini">
                                                                    BP: {entry.vitals.bp || '—'} | T: {entry.vitals.temp || '—'} | P: {entry.vitals.pulse || '—'}
                                                                </div>
                                                            )}
                                                            <p style={{ whiteSpace: 'pre-wrap' }}>{entry.text || entry.content || entry.notes}</p>
                                                            {entry.imageUrl && (
                                                                <div className="sheet-scan-preview" onClick={() => window.open(entry.imageUrl)}>
                                                                    <img src={entry.imageUrl} alt="Clinical Scan" />
                                                                    <div className="scan-label"><Eye size={12} /> Digital Scan Attached</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="entry-footer">
                                                            <div className="entry-sig">Digitally Signed: {entry.provider}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}

                                        {/* Auto-saving Indicator for live note taking (Future addition) */}
                                        <div className="sheet-bottom-spacer"></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Visit History (Grouped by Appointment) ── */}
                        {folderTab === 'history' && (
                            <div className="visit-history">
                                {appointmentsWithData.length === 0 ? (
                                    <div className="empty-history">
                                        <Folder size={40} />
                                        <p>No previous clinical records or appointments for this patient.</p>
                                    </div>
                                ) : appointmentsWithData.map((appt, i) => (
                                    <div key={appt.id || i} className="history-note-card appointment-nested-card">
                                        <div className="hn-header" style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', margin: '-1rem -1rem 1rem -1rem', padding: '0.75rem 1rem' }}>
                                            <div className="hn-meta" style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                                                <div>
                                                    <Calendar size={14} /> <strong>Visit: {appt.date}</strong> <span className="small-text">at {appt.time}</span>
                                                </div>
                                                <span className={`badge ${appt.status.toLowerCase()}`}>{appt.status}</span>
                                            </div>
                                        </div>

                                        {appt.note ? (
                                            <div className="nested-clinical-note">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#1e293b' }}>
                                                    <Stethoscope size={16} /> <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Clinical Consultation</h4>
                                                </div>
                                                {appt.note.diagnosis && <div className="hn-row"><span className="hn-key">Diagnosis</span><span style={{ fontWeight: 600 }}>{appt.note.diagnosis}</span></div>}
                                                {appt.note.chiefComplaint && <div className="hn-row"><span className="hn-key">Complaint</span><span>{appt.note.chiefComplaint}</span></div>}
                                                {appt.note.prescription && <div className="hn-row"><span className="hn-key">Prescription</span><span style={{ whiteSpace: 'pre-line' }}>{appt.note.prescription}</span></div>}
                                                {appt.note.treatmentPlan && <div className="hn-row"><span className="hn-key">Plan</span><span>{appt.note.treatmentPlan}</span></div>}
                                                <div className="hn-sig" style={{ marginTop: '10px', borderTop: '1px dashed #cbd5e1', paddingTop: '5px' }}>✒ Signed: {appt.note.signature}</div>
                                            </div>
                                        ) : (
                                            <div className="small-text" style={{ fontStyle: 'italic', marginBottom: '1rem' }}>No clinical consultation note recorded for this visit.</div>
                                        )}

                                        {/* Nested Lab Results */}
                                        {appt.labs && appt.labs.length > 0 && (
                                            <div className="nested-results-section" style={{ marginTop: '1.5rem', borderLeft: '3px solid #3b82f6', paddingLeft: '1rem' }}>
                                                <h5 style={{ fontSize: '0.85rem', color: '#3b82f6', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <FlaskConical size={14} /> Laboratory Investigations ({appt.labs.length})
                                                </h5>
                                                {appt.labs.map(lab => (
                                                    <div key={lab.id} className="nested-result-item" style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                            <strong style={{ fontSize: '0.85rem' }}>{lab.labTests}</strong>
                                                            <span className={`badge ${lab.status === 'Completed' ? 'paid' : 'rejected'}`} style={{ fontSize: '0.65rem' }}>{lab.status}</span>
                                                        </div>
                                                        {lab.status === 'Completed' ? (
                                                            <div className="processed-result-content">
                                                                <div className="result-display-box mini" style={{ background: '#fff', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '4px', marginTop: '5px' }}>
                                                                    {formatLabResults(lab.results)}
                                                                </div>
                                                                <div className="small-text" style={{ marginTop: '5px' }}>Scientist: {lab.completedBy} &bull; {new Date(lab.completedAt).toLocaleDateString()}</div>
                                                            </div>
                                                        ) : (
                                                            <div className="small-text" style={{ color: '#64748b' }}>Request pending processing...</div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Nested Radiology Results */}
                                        {appt.rads && appt.rads.length > 0 && (
                                            <div className="nested-results-section" style={{ marginTop: '1.5rem', borderLeft: '3px solid #ef4444', paddingLeft: '1rem' }}>
                                                <h5 style={{ fontSize: '0.85rem', color: '#ef4444', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <Eye size={14} /> Radiology / Imaging ({appt.rads.length})
                                                </h5>
                                                {appt.rads.map(rad => (
                                                    <div key={rad.id} className="nested-result-item" style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #fee2e2' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                            <strong style={{ fontSize: '0.85rem' }}>{rad.imagingTests}</strong>
                                                            <span className={`badge ${rad.status === 'Completed' ? 'paid' : 'rejected'}`} style={{ fontSize: '0.65rem', background: '#991b1b' }}>{rad.status}</span>
                                                        </div>
                                                        {rad.status === 'Completed' ? (
                                                            <div className="processed-result-content">
                                                                {rad.imageUrl && (
                                                                    <div className="hn-scan-box mini" onClick={() => window.open(rad.imageUrl)} style={{ cursor: 'pointer', margin: '8px 0' }}>
                                                                        <img src={rad.imageUrl} alt="Scan" style={{ maxHeight: '100px', borderRadius: '4px' }} />
                                                                        <div className="small-text" style={{ color: '#b91c1c' }}><Eye size={10} /> View Full Scan</div>
                                                                    </div>
                                                                )}
                                                                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', background: '#fff', padding: '10px', borderRadius: '4px', border: '1px solid #fecaca' }}>{rad.results}</div>
                                                                <div className="small-text" style={{ marginTop: '5px' }}>Specialist: {rad.completedBy} &bull; {new Date(rad.completedAt).toLocaleDateString()}</div>
                                                            </div>
                                                        ) : (
                                                            <div className="small-text" style={{ color: '#991b1b' }}>Scan pending capture/reporting...</div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── Accommodation Center ── */}
                        {folderTab === 'accommodation' && (
                            <div className="accommodation-center">
                                <div className="ac-header">
                                    <Building2 size={24} />
                                    <div>
                                        <h3>Clinical Accommodation Control</h3>
                                        <p>Admit patients from your attended clinical history to hospital wards.</p>
                                    </div>
                                </div>

                                <div className="attended-list">
                                    {historyAppts.length === 0 ? (
                                        <div className="empty-state">No attended patients in your recent history to accommodate.</div>
                                    ) : (
                                        historyAppts.map(a => (
                                            <div key={a.id} className="attended-patient-card">
                                                <div className="ap-info">
                                                    <strong>{a.patientName}</strong>
                                                    <span>Seen on: {new Date(a.seenAt?.toDate ? a.seenAt.toDate() : a.seenAt).toLocaleDateString()}</span>
                                                    <span className="dx-preview">Dx: {a.condition || 'No Dx recorded'}</span>
                                                </div>
                                                <button
                                                    className="primary-btn btn-sm"
                                                    style={{ background: '#10b981' }}
                                                    onClick={() => {
                                                        setActivePatient({ id: a.patientId, name: a.patientName });
                                                        setActiveAppt(a);
                                                        setShowAdmission(true);
                                                    }}
                                                >
                                                    <DoorOpen size={14} /> Admit Patient
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {showAdmission && (
                                    <div className="admission-overlay fade-in">
                                        <form className="admission-form compact" onSubmit={handleRecommendAdmission}>
                                            <div className="ac-title">Admit: {activePatient?.name}</div>
                                            <div className="ac-body">
                                                <label>Ward / Department</label>
                                                <select value={admissionForm.wardId} required onChange={e => setAdmissionForm(p => ({ ...p, wardId: e.target.value, roomId: '' }))}>
                                                    <option value="">-- Select Ward --</option>
                                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                </select>

                                                {admissionForm.wardId && (
                                                    <>
                                                        <label>Room / Block</label>
                                                        <select value={admissionForm.roomId} required onChange={e => {
                                                            const r = rooms.find(rx => rx.id === e.target.value);
                                                            setAdmissionForm(p => ({ ...p, roomId: e.target.value, dailyRate: r ? String(r.dailyRate || 5000) : p.dailyRate }));
                                                        }}>
                                                            <option value="">-- Select Room --</option>
                                                            {rooms.filter(r => r.departmentId === admissionForm.wardId).map(r => {
                                                                const taken = admissions.filter(ad => ad.roomId === r.id && ['Active', 'Recommended', 'PendingRenewal'].includes(ad.status)).length;
                                                                const free = (parseInt(r.capacity) || 0) - taken;
                                                                return (
                                                                    <option key={r.id} value={r.id} disabled={free <= 0}>
                                                                        {r.name} ({free > 0 ? `${free} beds free` : 'FULL'})
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>

                                                        {admissionForm.roomId && (
                                                            <>
                                                                <label>Bed Number</label>
                                                                <select value={admissionForm.bedNumber} required onChange={e => setAdmissionForm(p => ({ ...p, bedNumber: e.target.value }))}>
                                                                    <option value="">-- Select Bed --</option>
                                                                    {availableBeds.map(b => <option key={b} value={b}>Bed {b}</option>)}
                                                                </select>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                                <label>Admission Reason</label>
                                                <textarea value={admissionForm.reason} onChange={e => setAdmissionForm(p => ({ ...p, reason: e.target.value }))} placeholder="Clinical reason for admission..." />

                                                <div className="ac-actions">
                                                    <button type="button" className="secondary-btn" onClick={() => setShowAdmission(false)} disabled={submittingAdmission}>Cancel</button>
                                                    <button type="submit" className="primary-btn" style={{ background: '#10b981' }} disabled={submittingAdmission}>
                                                        {submittingAdmission ? 'Processing...' : 'Confirm Admission'}
                                                    </button>
                                                </div>
                                            </div>
                                        </form>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Right: Patient Summary + Follow-Up ── */}
                    <div className="consult-sidebar">
                        <div className="consult-info-card">
                            <h4><User size={14} /> Patient Summary</h4>
                            <div className="ci-row"><label>Age / Gender</label><span>{activePatient.age}yrs / {activePatient.gender}</span></div>
                            <div className="ci-row"><label>DOB</label><span>{activePatient.dob}</span></div>
                            <div className="ci-row"><label>Phone</label><span>{activePatient.phonePrimary}</span></div>
                            <div className="ci-row"><label>Payment</label><span>{activePatient.paymentType === 'Insurance' ? `HMO: ${activePatient.hmoProvider}` : 'Cash'}</span></div>
                            {activePatient.nokFullName && <div className="ci-row"><label>Next of Kin</label><span>{activePatient.nokFullName} ({activePatient.nokRelationship})</span></div>}
                        </div>

                        {/* Follow-up appointment */}

                        {!showFollowUp ? (
                            <button className="followup-trigger" onClick={() => setShowFollowUp(true)} style={{ marginTop: '10px' }}>
                                <Plus size={16} /> Book Follow-Up Appointment
                            </button>
                        ) : (
                            <form className="followup-form" onSubmit={handleFollowUpBook}>
                                <div className="followup-header"><Calendar size={15} /> Follow-Up Booking
                                    <button type="button" className="close-btn" onClick={() => setShowFollowUp(false)}><X size={15} /></button>
                                </div>
                                <div className="booking-field">
                                    <label className="booking-label"><MapPin size={12} /> Ward / Department</label>
                                    <select value={followUp.ward} required onChange={e => setFollowUp(p => ({ ...p, ward: e.target.value, doctorId: '' }))} className="full-select">
                                        <option value="">-- Select Ward --</option>
                                        {WARDS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                                    </select>
                                </div>
                                {followUp.ward && (
                                    <div className="booking-field">
                                        <label className="booking-label"><Stethoscope size={12} /> Doctor</label>
                                        <select value={followUp.doctorId} required onChange={e => setFollowUp(p => ({ ...p, doctorId: e.target.value }))} className="full-select">
                                            <option value="">{followUpDoctors.length === 0 ? '-- No Doctor Currently in Ward --' : '-- Select Doctor --'}</option>
                                            {followUpDoctors.map(d => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
                                        </select>
                                    </div>
                                )}
                                <div className="booking-dt-row">
                                    <div className="booking-field">
                                        <label className="booking-label">Date</label>
                                        <input type="date" required min={todayStr} value={followUp.date} onChange={e => setFollowUp(p => ({ ...p, date: e.target.value }))} />
                                    </div>
                                    <div className="booking-field">
                                        <label className="booking-label">Time</label>
                                        <input type="time" required value={followUp.time} onChange={e => setFollowUp(p => ({ ...p, time: e.target.value }))} />
                                    </div>
                                </div>
                                <div className="booking-field">
                                    <label className="booking-label">Reason</label>
                                    <input type="text" placeholder="Follow-up reason..." value={followUp.reason} onChange={e => setFollowUp(p => ({ ...p, reason: e.target.value }))} />
                                </div>
                                <button type="submit" className="primary-btn full-btn" disabled={!followUp.doctorId}>
                                    <CheckCircle2 size={15} /> Confirm Follow-Up
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── QUEUE VIEW ────────────────────────────────────────────────────────────
    if (loading) {
        return <Preloader message="Fetching Consultation Queue..." />;
    }

    return (
        <div className="doctor-portal-page">
            {/* Header */}
            <div className="dp-header">
                <div>
                    <h2>Dr. {user.name}</h2>
                    <div className="dp-ward-badge">
                        <Stethoscope size={14} />
                        {doctorWard ? WARDS.find(w => w.id === doctorWard)?.label || doctorWard : 'No ward assigned'}
                    </div>
                </div>
                <div className="dp-stats">
                    <div className="dp-stat"><span>{pending.length}</span><label>Pending</label></div>
                    <div className="dp-stat seen"><span>{seen.length}</span><label>Seen</label></div>
                    <div className="dp-stat" style={{ cursor: 'pointer', background: activeSection === 'inpatient' ? '#eff6ff' : 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={() => setActiveSection(activeSection === 'inpatient' ? 'queue' : 'inpatient')}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 700, color: activeSection === 'inpatient' ? '#2563eb' : 'var(--text-primary)' }}>{myInpatients.length}</span>
                        <label style={{ fontSize: '0.75rem', color: activeSection === 'inpatient' ? '#2563eb' : 'var(--text-secondary)' }}>Inpatients</label>
                    </div>
                    <div className="dp-stat history-badge" style={{ cursor: 'pointer', background: showHistory ? '#e2e8f0' : 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={() => setShowHistory(!showHistory)}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>{historyAppts.length}</span>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>History</label>
                    </div>
                </div>
            </div>

            {/* Section Toggle Tabs */}
            <div className="dp-section-tabs">
                <button
                    className={`dp-tab-btn ${activeSection === 'queue' ? 'active' : ''}`}
                    onClick={() => setActiveSection('queue')}
                >
                    <Clock size={15} /> Clinical Queue
                    {pending.length > 0 && <span className="tab-badge">{pending.length}</span>}
                </button>
                <button
                    className={`dp-tab-btn ${activeSection === 'inpatient' ? 'active' : ''}`}
                    onClick={() => setActiveSection('inpatient')}
                >
                    <BedDouble size={15} /> Inpatient Ward Rounds
                    {myInpatients.length > 0 && <span className="tab-badge inpatient">{myInpatients.length}</span>}
                </button>
            </div>

            {/* Urgent Banner */}
            {urgentCount > 0 && (
                <div className="urgent-banner">
                    <AlertTriangle size={18} />
                    <strong>{urgentCount} PRIORITY patient{urgentCount > 1 ? 's' : ''} require immediate attention!</strong>
                    <span>Emergency / Urgent cases are listed first below.</span>
                </div>
            )}
            {/* Removed standalone banners for a patient-centric workflow */}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* INPATIENT WARD ROUNDS SECTION                               */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {activeSection === 'inpatient' && (
                <div className="inpatient-ward-section">
                    <div className="iw-header">
                        <div className="iw-title">
                            <BedDouble size={22} />
                            <div>
                                <h3>Ward Rounds</h3>
                                <p>{myInpatients.length} admitted patient{myInpatients.length !== 1 ? 's' : ''} in {doctorWard ? (WARDS.find(w => w.id === doctorWard)?.label || doctorWard) : 'your ward'}</p>
                            </div>
                        </div>
                    </div>

                    {myInpatients.length === 0 ? (
                        <div className="iw-empty">
                            <BedDouble size={48} color="#e2e8f0" />
                            <p>No active admissions in your ward.</p>
                            <span>Patients admitted to your department will appear here.</span>
                        </div>
                    ) : (
                        <div className="iw-patient-grid">
                            {myInpatients.map(adm => {
                                const patient = patients.find(p => p.id === adm.patientId);
                                const daysOnWard = getDaysOnWard(adm);
                                const { hasUnreviewedLab, hasUnreviewedRad } = getInpatientStatus(adm.patientId);
                                const hasAlerts = hasUnreviewedLab || hasUnreviewedRad;

                                // Status colors
                                const statusStyle = {
                                    Active: { bg: '#f0fdf4', border: '#86efac', badge: '#16a34a', label: 'Active' },
                                    Recommended: { bg: '#fffbeb', border: '#fde68a', badge: '#d97706', label: 'Awaiting Billing' },
                                    PendingRenewal: { bg: '#fef3c7', border: '#fbbf24', badge: '#b45309', label: 'Renewal Due' },
                                }[adm.status] || { bg: '#f8fafc', border: '#e2e8f0', badge: '#64748b', label: adm.status };

                                return (
                                    <div
                                        key={adm.id}
                                        className="iw-patient-card"
                                        style={{ background: statusStyle.bg, borderColor: statusStyle.border }}
                                    >
                                        {/* Alert Dot */}
                                        {hasAlerts && (
                                            <div className="iw-alert-dot" title="Unreviewed results available">
                                                <span className="iw-dot-pulse" />
                                            </div>
                                        )}

                                        {/* Card Top: Avatar + Name + Bed */}
                                        <div className="iw-card-top">
                                            <div className="iw-avatar">
                                                {patient?.name?.charAt(0) || adm.patientName?.charAt(0) || '?'}
                                            </div>
                                            <div className="iw-patient-meta">
                                                <strong>{adm.patientName || patient?.name}</strong>
                                                <span>{patient?.age ? `${patient.age}yrs` : ''} {patient?.gender ? `• ${patient.gender}` : ''}</span>
                                            </div>
                                            <div className="iw-status-badge" style={{ background: statusStyle.badge }}>
                                                {statusStyle.label}
                                            </div>
                                        </div>

                                        {/* Ward Details Row */}
                                        <div className="iw-details-row">
                                            <div className="iw-detail-chip">
                                                <BedDouble size={12} />
                                                <span>Bed {adm.bedNumber} &bull; {adm.roomName || 'Room'}</span>
                                            </div>
                                            <div className="iw-detail-chip">
                                                <Moon size={12} />
                                                <span>{daysOnWard === 0 ? 'Admitted Today' : `Day ${daysOnWard}`}</span>
                                            </div>
                                            <div className="iw-detail-chip">
                                                <MapPin size={12} />
                                                <span>{adm.wardName || doctorWard}</span>
                                            </div>
                                        </div>

                                        {/* Live Status Indicators */}
                                        <div className="iw-live-status">
                                            <div className={`iw-status-pill ${hasUnreviewedLab ? 'alert' : 'clear'}`}>
                                                <FlaskConical size={11} />
                                                {hasUnreviewedLab ? 'Lab Results Ready' : 'No Pending Labs'}
                                            </div>
                                            <div className={`iw-status-pill ${hasUnreviewedRad ? 'alert' : 'clear'}`}>
                                                <Eye size={11} />
                                                {hasUnreviewedRad ? 'Radiology Ready' : 'No Pending Scans'}
                                            </div>
                                        </div>

                                        {/* Admission Reason */}
                                        {adm.reason && (
                                            <div className="iw-reason">
                                                <ClipboardList size={12} />
                                                <span>{adm.reason}</span>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="iw-card-actions">
                                            <button
                                                className="iw-view-btn"
                                                onClick={() => {
                                                    // Find the most recent appointment for this patient and open it
                                                    const patientAppt = appointments
                                                        .filter(a => a.patientId === adm.patientId)
                                                        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                                                    if (patientAppt) openConsult(patientAppt);
                                                }}
                                            >
                                                <FileText size={13} /> View Chart
                                            </button>
                                            <button
                                                className="iw-discharge-btn"
                                                onClick={() => {
                                                    setDischargingAdm(adm);
                                                    setShowDischargeModal(true);
                                                }}
                                            >
                                                <LogOut size={13} /> Discharge Evaluation
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeSection === 'queue' && (
                <div className="dp-grid">
                    {/* Removed standalone lab result section */}
                    {/* ── Pending Queue ── */}
                    <div className="dp-section">
                        <div className="dp-section-title upcoming">
                            <Clock size={16} /> Pending Queue
                            <span className="appt-count">{pending.length}</span>
                        </div>

                        {pending.length === 0 ? (
                            <div className="appt-empty">No pending patients in your queue.</div>
                        ) : pending.map(appt => {
                            const patient = patients.find(p => p.id === appt.patientId || (p.patientID && p.patientID === appt.patientId));
                            const flag = appt.condition || appt.priority || 'Normal';
                            const cs = CONDITION_COLORS[flag] || CONDITION_COLORS.Normal;
                            return (
                                <div
                                    key={appt.id}
                                    className={`queue-card ${flag.toLowerCase()}`}
                                    style={{ borderLeft: `4px solid ${cs.border}`, background: cs.bg }}
                                >
                                    <div className="queue-card-top">
                                        <div className="queue-avatar">{patient?.name?.charAt(0) || '?'}</div>
                                        <div className="queue-info">
                                            <strong>{patient?.name || 'Unknown Patient'}</strong>
                                            <span className="small-text">{patient?.age}yrs &bull; {appt.reason}</span>
                                        </div>
                                        <div className="queue-right">
                                            {getPatientResultsStatus(appt.patientId) && (
                                                <span className="badge urgent fade-in" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <FlaskConical size={12} /> PROFILE READY
                                                </span>
                                            )}
                                            <span className="condition-pill" style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}` }}>
                                                {cs.icon} {flag}
                                            </span>
                                            <span className="small-text"><Clock size={11} /> {appt.time} | {appt.date}</span>
                                        </div>
                                    </div>
                                    <div className="queue-actions">
                                        <button className="open-consult-btn" onClick={() => openConsult(appt)} style={{ width: '100%', justifyContent: 'center' }}>
                                            Open Consultation <ChevronRight size={15} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Seen / History ── */}
                    <div className="dp-section">
                        <div className="dp-section-title history">
                            <CheckCircle2 size={16} /> Completed Today
                            <span className="appt-count">{seen.length}</span>
                        </div>

                        {seen.length === 0 ? (
                            <div className="appt-empty">No completed consultations yet.</div>
                        ) : seen.map(appt => {
                            const patient = patients.find(p => p.id === appt.patientId || (p.patientID && p.patientID === appt.patientId));
                            const patNote = notes.filter(n => (n.patientId === appt.patientId || (patient?.patientID && n.patientId === patient.patientID)) && n.appointmentId === appt.id)[0];
                            return (
                                <div key={appt.id} className="queue-card seen">
                                    <div className="queue-card-top">
                                        <div className="queue-avatar seen">{patient?.name?.charAt(0) || '?'}</div>
                                        <div className="queue-info">
                                            <strong>{patient?.name}</strong>
                                            <span className="small-text">{appt.date} at {appt.time}</span>
                                            {patNote && <span className="small-text"><strong>Dx:</strong> {patNote.diagnosis}</span>}
                                        </div>
                                        <div className="queue-right">
                                            <span className="appt-status-pill seen">Seen</span>
                                            <button className="text-action-link" onClick={() => openConsult(appt)}>
                                                View / Add Note
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Historic Work Done ── */}
                    {showHistory && (
                        <div className="dp-section" style={{ gridColumn: '1 / -1' }}>
                            <div className="dp-section-title history" style={{ color: '#475569' }}>
                                <Folder size={16} /> Work History (&gt;24 hrs)
                                <span className="appt-count" style={{ background: '#cbd5e1', color: '#475569' }}>{historyAppts.length} Appointments &bull; {historicLabResults.length} Labs</span>
                            </div>

                            {historyAppts.length === 0 && historicLabResults.length === 0 ? (
                                <div className="appt-empty">No historic work found.</div>
                            ) : (
                                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
                                    <div>
                                        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Historic Appointments</h4>
                                        {historyAppts.length === 0 && <p className="small-text">None</p>}
                                        {historyAppts.map(appt => {
                                            const patient = patients.find(p => p.id === appt.patientId || (p.patientID && p.patientID === appt.patientId));
                                            const patNote = notes.filter(n => (n.patientId === appt.patientId || (patient?.patientID && n.patientId === patient.patientID)) && n.appointmentId === appt.id)[0];
                                            const isMissed = appt.status === 'Scheduled' && appt.date < todayStr;
                                            return (
                                                <div key={appt.id} className="queue-card" style={{ opacity: 0.9, background: 'var(--input-bg)' }}>
                                                    <div className="queue-card-top" style={{ alignItems: 'center' }}>
                                                        <div className={`queue-avatar ${appt.status === 'Seen' ? 'seen' : ''}`} style={{ opacity: 0.7, background: isMissed ? '#fee2e2' : '' }}>{patient?.name?.charAt(0) || '?'}</div>
                                                        <div className="queue-info">
                                                            <strong>{patient?.name || 'Unknown Patient'}</strong>
                                                            <span className="small-text">{appt.date} at {appt.time}</span>
                                                            {patNote && <span className="small-text"><strong>Dx:</strong> {patNote.diagnosis}</span>}
                                                        </div>
                                                        <div className="queue-right">
                                                            <span className="appt-status-pill" style={{
                                                                background: isMissed ? '#ef4444' : (appt.status === 'Seen' ? '#22c55e' : '#e2e8f0'),
                                                                color: isMissed || appt.status === 'Seen' ? 'white' : '#475569'
                                                            }}>
                                                                {isMissed ? 'Missed' : appt.status}
                                                            </span>
                                                            {patient && (
                                                                <button className="text-action-link" onClick={() => openConsult(appt)}>
                                                                    View Folder
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div>
                                        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Historic Lab Results</h4>
                                        {historicLabResults.map(order => (
                                            <div key={order.id} className="queue-card" style={{ opacity: 0.9, background: 'var(--input-bg)' }}>
                                                <div className="queue-card-top" style={{ alignItems: 'center' }}>
                                                    <div className="queue-avatar" style={{ background: '#dcf8c6', color: '#166534' }}><FlaskConical size={14} /></div>
                                                    <div className="queue-info">
                                                        <strong>{order.patientName}</strong>
                                                        <span className="small-text">{order.labTests}</span>
                                                        <span className="small-text" style={{ fontSize: '0.7rem' }}>
                                                            Results ready: {order.completedAt ? (order.completedAt.toDate ? order.completedAt.toDate().toLocaleDateString() : new Date(order.completedAt).toLocaleDateString()) : 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="queue-right">
                                                        {order.reviewed && <span className="reviewed-check" title="Reviewed by you">✓ Reviewed</span>}
                                                        <button className="text-action-link" onClick={() => openConsult({ patientId: order.patientId })}>View Results</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {historicLabRequests.length > 0 && (
                                            <div style={{ marginTop: '1.5rem' }}>
                                                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Historic Lab Requests</h4>
                                                {historicLabRequests.map(order => (
                                                    <div key={order.id} className="queue-card" style={{ opacity: 0.8, background: 'var(--input-bg)' }}>
                                                        <div className="queue-card-top" style={{ alignItems: 'center' }}>
                                                            <div className="queue-avatar" style={{ background: '#fee2e2', color: '#991b1b' }}><FlaskConical size={14} /></div>
                                                            <div className="queue-info">
                                                                <strong>{order.patientName}</strong>
                                                                <span className="small-text">{order.labTests}</span>
                                                                <span className="small-text">Status: <strong>{order.status}</strong></span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {/* ═══════════════════════════════════════════════════════ */}
            {/* DISCHARGE EVALUATION MODAL                                    */}
            {/* ═══════════════════════════════════════════════════════ */}
            {showDischargeModal && dischargingAdm && (
                <div className="modal-backdrop" style={{ zIndex: 3000 }}>
                    <div className="discharge-modal-content">
                        {/* Modal Header */}
                        <div className="discharge-modal-header">
                            <div className="dh-left">
                                <div className="dh-icon"><LogOut size={20} /></div>
                                <div>
                                    <h3>Discharge Evaluation</h3>
                                    <p>Signing this form will notify Nursing &amp; Billing</p>
                                </div>
                            </div>
                            <button className="close-btn" onClick={() => { setShowDischargeModal(false); setDischargingAdm(null); }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Patient Info Strip */}
                        <div className="discharge-patient-strip">
                            <div className="dps-avatar">{dischargingAdm.patientName?.charAt(0)}</div>
                            <div className="dps-meta">
                                <strong>{dischargingAdm.patientName}</strong>
                                <span>Bed {dischargingAdm.bedNumber} &bull; {dischargingAdm.wardName} &bull; {getDaysOnWard(dischargingAdm)} days on ward</span>
                            </div>
                            <div className="dps-reason">{dischargingAdm.reason}</div>
                        </div>

                        {/* Discharge Form */}
                        <form className="discharge-form-body" onSubmit={handleSignDischarge}>
                            {/* 1. Final Diagnosis */}
                            <div className="df-field">
                                <label className="df-label"><span className="df-num">1</span> Final Diagnosis <span className="df-req">*</span></label>
                                <textarea
                                    required
                                    rows={2}
                                    placeholder="Confirmed diagnosis after the hospital stay (ICD-10 if applicable)..."
                                    value={dischargeForm.finalDiagnosis}
                                    onChange={e => setDischargeForm(p => ({ ...p, finalDiagnosis: e.target.value }))}
                                />
                            </div>

                            {/* 2. Clinical Summary */}
                            <div className="df-field">
                                <label className="df-label"><span className="df-num">2</span> Clinical Summary <span className="df-req">*</span></label>
                                <textarea
                                    required
                                    rows={3}
                                    placeholder="Brief summary of treatment provided during admission (e.g. 7-day IV Ceftriaxone, monitored for fever spikes)..."
                                    value={dischargeForm.clinicalSummary}
                                    onChange={e => setDischargeForm(p => ({ ...p, clinicalSummary: e.target.value }))}
                                />
                            </div>

                            {/* 3. Condition on Discharge */}
                            <div className="df-field">
                                <label className="df-label"><span className="df-num">3</span> Condition on Discharge <span className="df-req">*</span></label>
                                <div className="condition-select-grid">
                                    {['Stable', 'Recovered', 'Referred', 'DAMA'].map(cond => (
                                        <button
                                            key={cond}
                                            type="button"
                                            className={`condition-select-btn ${dischargeForm.conditionOnDischarge === cond ? 'active' : ''} ${cond.toLowerCase()}`}
                                            onClick={() => setDischargeForm(p => ({ ...p, conditionOnDischarge: cond }))}
                                        >
                                            {cond === 'Stable' && <CheckCircle2 size={14} />}
                                            {cond === 'Recovered' && <CheckCircle2 size={14} />}
                                            {cond === 'Referred' && <ChevronRight size={14} />}
                                            {cond === 'DAMA' && <AlertTriangle size={14} />}
                                            {cond}
                                        </button>
                                    ))}
                                </div>
                                {dischargeForm.conditionOnDischarge === 'DAMA' && (
                                    <div className="dama-warning fade-in">
                                        <AlertTriangle size={14} /> DAMA: Patient is leaving against medical advice. Ensure AMA form is signed.
                                    </div>
                                )}
                            </div>

                            {/* 4. Discharge Medications */}
                            <div className="df-field">
                                <label className="df-label">
                                    <span className="df-num">4</span> Discharge Medications (Take Home)
                                    <span className="df-hint">Will be sent to Pharmacy &amp; Billing for payment</span>
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="List medications to take home (e.g. Amoxicillin 500mg TDS 5/7, Paracetamol 1g PRN). Leave blank if none."
                                    value={dischargeForm.dischargeMedications}
                                    onChange={e => setDischargeForm(p => ({ ...p, dischargeMedications: e.target.value }))}
                                />
                            </div>

                            {/* 5. Follow-Up Plan */}
                            <div className="df-field">
                                <label className="df-label"><span className="df-num">5</span> Follow-Up Plan</label>
                                <textarea
                                    rows={2}
                                    placeholder="When should the patient return? (e.g. Review in 2 weeks at GOPD, RBS monitoring weekly)..."
                                    value={dischargeForm.followUpPlan}
                                    onChange={e => setDischargeForm(p => ({ ...p, followUpPlan: e.target.value }))}
                                />
                            </div>

                            {/* Notification Preview */}
                            <div className="discharge-notification-preview">
                                <div className="dnp-row"><CheckCircle2 size={13} color="#16a34a" /> Nursing Station will be notified to prepare for physical release</div>
                                <div className="dnp-row"><CheckCircle2 size={13} color="#16a34a" /> Billing Office will see discharge medications for payment collection</div>
                                <div className="dnp-row"><CheckCircle2 size={13} color="#16a34a" /> Clinical Discharge Summary will be printed automatically</div>
                            </div>

                            {/* Digital Signature + Submit */}
                            <div className="discharge-sig-block">
                                <div className="digital-signature-block" style={{ flex: 1 }}>
                                    <PenLine size={16} />
                                    <div className="sig-content">
                                        <span className="sig-label">Digital Signature</span>
                                        <span className="sig-name">Dr. {user.name}</span>
                                        <span className="sig-time">{new Date().toLocaleString()}</span>
                                    </div>
                                    <ShieldCheck size={18} className="sig-shield" />
                                </div>
                                <div className="discharge-modal-actions">
                                    <button
                                        type="button"
                                        className="secondary-btn"
                                        onClick={() => { setShowDischargeModal(false); setDischargingAdm(null); }}
                                        disabled={submittingDischarge}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="discharge-submit-btn"
                                        disabled={submittingDischarge}
                                    >
                                        {submittingDischarge ? 'Processing...' : (
                                            <><LogOut size={16} /> Sign &amp; Discharge Patient</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DoctorPortal;
