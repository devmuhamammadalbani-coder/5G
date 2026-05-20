import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { useAuth } from './AuthContext';
import { admissionService } from '../services/admissionService';

const DataContext = createContext(null);

// --- UTILITY FUNCTIONS TO PREVENT UI BREAKAGE ---
// Converts Supabase snake_case back to React camelCase
const toCamelCase = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(toCamelCase);
    return Object.keys(obj).reduce((acc, key) => {
        const camelKey = key.replace(/_([a-z])/g, g => g[1].toUpperCase());
        acc[camelKey] = toCamelCase(obj[key]);
        return acc;
    }, {});
};

// Converts React camelCase to Supabase snake_case
const toSnakeCase = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(toSnakeCase);
    return Object.keys(obj).reduce((acc, key) => {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        acc[snakeKey] = toSnakeCase(obj[key]);
        return acc;
    }, {});
};
// ------------------------------------------------

export const DataProvider = ({ children }) => {
    const [patients, setPatients] = useState([]);
    const [notes, setNotes] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [claims, setClaims] = useState([]);
    const [prescriptions, setPrescriptions] = useState([]);
    const [labOrders, setLabOrders] = useState([]);
    const [imagingOrders, setImagingOrders] = useState([]);
    const [pharmacyInventory, setPharmacyInventory] = useState([]);
    const [admissions, setAdmissions] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [tariffs, setTariffs] = useState([]);
    const [progressNotes, setProgressNotes] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [appointmentFee, setAppointmentFeeState] = useState(0);
    const [loading, setLoading] = useState(true);

    const { user } = useAuth();

    // ── Real-time Supabase listeners ──
    useEffect(() => {
        if (!isSupabaseConfigured) {
            setLoading(false);
            return;
        }
        if (!user) {
            setLoading(false);
            return;
        }

        let isMounted = true;
        setLoading(true);

        const role = user.role;
        const isStaff = ['Admin', 'Nurse', 'Doctor', 'Receptionist', 'Biller', 'Radiology'].includes(role);
        const canReadNotes = ['Admin', 'Doctor', 'Nurse', 'Radiology'].includes(role);
        const canReadLabs = ['Admin', 'Doctor', 'Laboratory', 'Radiology', 'Biller'].includes(role);
        const canReadBilling = ['Admin', 'Biller'].includes(role);
        const canReadPharmacy = ['Admin', 'Pharmacist', 'Biller'].includes(role);

        // Function to fetch data and setup channel
        const setupSync = async (tableName, setter, orderByCol = 'created_at', limitNum = 500) => {
            // 1. Fetch initial
            const { data } = await supabase
                .from(tableName)
                .select('*')
                .order(orderByCol, { ascending: false })
                .limit(limitNum);
                
            if (data && isMounted) {
                setter(toCamelCase(data));
            }

            // 2. Subscribe to changes
            return supabase
                .channel(`public:${tableName}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, payload => {
                    const camelPayload = toCamelCase(payload.new);
                    const oldCamel = toCamelCase(payload.old);
                    
                    if (payload.eventType === 'INSERT') {
                        setter(prev => [camelPayload, ...prev]);
                    } else if (payload.eventType === 'UPDATE') {
                        setter(prev => prev.map(item => item.id === camelPayload.id ? camelPayload : item));
                    } else if (payload.eventType === 'DELETE') {
                        setter(prev => prev.filter(item => item.id !== oldCamel.id));
                    }
                })
                .subscribe();
        };

        const channels = [];

        const initializeData = async () => {
            try {
                if (isStaff) {
                    channels.push(await setupSync('patients', setPatients, 'created_at', 1000));
                    channels.push(await setupSync('appointments', setAppointments, 'created_at', 1000));
                    channels.push(await setupSync('departments', setDepartments, 'created_at', 500));
                    channels.push(await setupSync('rooms', setRooms, 'created_at', 500));
                    channels.push(await setupSync('tariffs', setTariffs, 'created_at', 500));
                }

                if (canReadNotes) {
                    channels.push(await setupSync('clinical_notes', setNotes, 'created_at', 500));
                    channels.push(await setupSync('progress_notes', setProgressNotes, 'created_at', 500));
                }

                if (canReadBilling) {
                    channels.push(await setupSync('billing', setClaims, 'created_at', 1000));
                    channels.push(await setupSync('expenses', setExpenses, 'created_at', 500));
                }

                if (canReadLabs) {
                    channels.push(await setupSync('lab_orders', setLabOrders, 'created_at', 500));
                    channels.push(await setupSync('imaging_orders', setImagingOrders, 'created_at', 500));
                }

                if (canReadPharmacy) {
                    channels.push(await setupSync('pharmacy_inventory', setPharmacyInventory, 'created_at', 1000));
                    channels.push(await setupSync('prescriptions', setPrescriptions, 'created_at', 500));
                    channels.push(await setupSync('admissions', setAdmissions, 'created_at', 500));
                }

                // Fetch Appointment Fee Setting
                const { data: feeData } = await supabase.from('settings').select('*').eq('setting_key', 'appointmentFee').single();
                if (feeData && feeData.setting_value) {
                    setAppointmentFeeState(feeData.setting_value.amount || 0);
                }

            } catch (err) {
                console.error("Supabase sync error:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        initializeData();

        return () => {
            isMounted = false;
            channels.forEach(channel => supabase.removeChannel(channel));
        };
    }, [user]);

    // ── Helper to execute Insert ──
    const insertDoc = async (tableName, data) => {
        const { data: result, error } = await supabase
            .from(tableName)
            .insert([toSnakeCase(data)])
            .select()
            .single();
        if (error) console.error(`Error inserting into ${tableName}:`, error);
        return result ? toCamelCase(result) : null;
    };

    // ── Helper to execute Update ──
    const updateDoc = async (tableName, id, data) => {
        const { error } = await supabase
            .from(tableName)
            .update(toSnakeCase(data))
            .eq('id', id);
        if (error) console.error(`Error updating ${tableName}:`, error);
    };

    // ── PATIENTS ──
    const addPatient = async (patientData) => {
        const result = await insertDoc('patients', patientData);
        if (result && patientData.paymentType === 'HMO') {
            await insertDoc('billing', {
                patientId: result.id,
                patientName: patientData.name,
                type: 'HMO Pre-Authorization',
                amount: 0,
                status: 'Pending'
            });
        }
        return result?.id;
    };

    const updatePatient = async (patientId, fields) => updateDoc('patients', patientId, fields);

    // ── APPOINTMENTS ──
    const bookAppointment = async (apptData) => {
        await insertDoc('appointments', {
            ...apptData,
            status: 'PendingBilling',   
            billingStatus: 'Unpaid',
            appointmentFee: appointmentFee
        });
    };

    const sendToDoctor = async (apptId, vitals, doctorId, doctorName) => {
        await updateDoc('appointments', apptId, {
            status: 'AwaitingConsultation',
            vitals: vitals,
            doctorId: doctorId,
            doctorName: doctorName
        });
    };

    const authorizeAppointment = async (apptId, billerName, paymentMethod = 'Cash', authCode = '') => {
        await updateDoc('appointments', apptId, {
            status: 'AwaitingVitals', 
            billingStatus: 'Paid',
            authorizedBy: billerName,
            paymentMethod,
            authCode
        });
        
        const { data: appt } = await supabase.from('appointments').select('*').eq('id', apptId).single();
        if (appt) {
            const camelAppt = toCamelCase(appt);
            await insertDoc('billing', {
                patientId: camelAppt.patientId,
                patientName: camelAppt.patientName,
                appointmentId: apptId,
                type: 'Appointment Fee',
                description: `Consultation — ${camelAppt.ward} with ${camelAppt.doctorName}`,
                amount: camelAppt.appointmentFee || appointmentFee,
                status: 'Paid',
                source: 'Appointment',
                paymentMethod,
                authCode
            });
        }
    };

    const saveAppointmentFee = async (amount) => {
        // Upsert setting
        await supabase.from('settings').upsert({
            setting_key: 'appointmentFee',
            setting_value: { amount: Number(amount) }
        }, { onConflict: 'setting_key' });
        setAppointmentFeeState(Number(amount));
    };

    const completeAppointment = async (apptId) => updateDoc('appointments', apptId, { status: 'Seen' });
    const updateAppointmentCondition = async (apptId, condition) => updateDoc('appointments', apptId, { condition });

    // ── EXPENSES, NOTES, PRESCRIPTIONS, LABS ──
    const addExpense = async (expenseData) => insertDoc('expenses', { ...expenseData, status: 'Recorded' });
    const addNote = async (noteData) => insertDoc('clinical_notes', noteData);
    const addProgressNote = async (noteData) => insertDoc('progress_notes', noteData);
    
    const addPrescription = async (rxData) => insertDoc('prescriptions', rxData);
    const updatePrescription = async (id, fields) => updateDoc('prescriptions', id, fields);

    const addLabOrder = async (orderData) => insertDoc('lab_orders', { ...orderData, status: 'PendingBilling', billingStatus: 'Unpaid', reviewed: false });
    const updateLabOrder = async (orderId, fields) => updateDoc('lab_orders', orderId, fields);
    const markLabResultAsReviewed = async (orderId) => updateDoc('lab_orders', orderId, { reviewed: true });

    const addImagingOrder = async (orderData) => insertDoc('imaging_orders', { ...orderData, status: 'PendingBilling', billingStatus: 'Unpaid', reviewed: false });
    const updateImagingOrder = async (orderId, fields) => updateDoc('imaging_orders', orderId, fields);

    const authorizeImagingOrder = async (imagingId, billerName, fee, paymentMethod = 'Cash', authCode = '') => {
        await updateDoc('imaging_orders', imagingId, { status: 'Pending', billingStatus: 'Paid', authorizedBy: billerName, paymentMethod, authCode });
        const { data: snap } = await supabase.from('imaging_orders').select('*').eq('id', imagingId).single();
        if (snap) {
            const order = toCamelCase(snap);
            await insertDoc('billing', { patientId: order.patientId, patientName: order.patientName, imagingOrderId: imagingId, type: 'Radiology/Imaging Fee', description: `Imaging: ${order.imagingTests}`, amount: fee || 0, status: 'Paid', source: 'Radiology', paymentMethod, authCode });
        }
    };

    const authorizeLabOrder = async (labOrderId, billerName, fee, paymentMethod = 'Cash', authCode = '') => {
        await updateDoc('lab_orders', labOrderId, { status: 'Pending', billingStatus: 'Paid', authorizedBy: billerName, paymentMethod, authCode });
        const { data: snap } = await supabase.from('lab_orders').select('*').eq('id', labOrderId).single();
        if (snap) {
            const order = toCamelCase(snap);
            await insertDoc('billing', { patientId: order.patientId, patientName: order.patientName, labOrderId: labOrderId, type: 'Laboratory Fee', description: `Lab Tests: ${order.labTests}`, amount: fee || 0, status: 'Paid', source: 'Laboratory', paymentMethod, authCode });
        }
    };

    // ── BILLING / CLAIMS ──
    const addClaim = async (claimData) => insertDoc('billing', { ...claimData, status: 'Pending' });
    const rejectClaim = async (claimId, reason) => updateDoc('billing', claimId, { status: 'Rejected', rejectionReason: reason || 'No reason provided' });
    const processClaim = async (claimId) => updateDoc('billing', claimId, { status: 'Processing' });

    const approveClaim = async (claimId, paymentMethod = 'Cash', authCode = '') => {
        const { data: claimSnap } = await supabase.from('billing').select('*').eq('id', claimId).single();
        if (claimSnap) {
            const claimData = toCamelCase(claimSnap);
            await updateDoc('billing', claimId, { status: 'Paid', paymentMethod, authCode });
            if (claimData.prescriptionId) {
                await updateDoc('prescriptions', claimData.prescriptionId, { status: 'Paid', paymentMethod, authCode });
            }
        }
    };

    const bulkAuthorize = async (items, billerName, paymentDetails) => {
        const { paymentMethod, authCode } = paymentDetails;
        const promises = items.map(item => {
            if (item.type === 'Appointment') return authorizeAppointment(item.id, billerName, paymentMethod, authCode);
            if (item.type === 'Laboratory') return authorizeLabOrder(item.id, billerName, item.amount, paymentMethod, authCode);
            if (item.type === 'Radiology') return authorizeImagingOrder(item.id, billerName, item.amount, paymentMethod, authCode);
            if (item.type === 'Pharmacy' || item.type === 'Manual') return approveClaim(item.id, paymentMethod, authCode);
            if (item.type === 'Admission') return authorizeAdmission(item.id, billerName, item.amount, paymentMethod, authCode);
            if (item.type === 'AdmissionRenewal') return renewAdmissionCycle(item.id, billerName, item.amount, paymentMethod, authCode);
            return Promise.resolve();
        });
        await Promise.all(promises);
    };

    // ── PHARMACY INVENTORY ──
    const addPharmacyItem = async (item) => insertDoc('pharmacy_inventory', item);
    const updatePharmacyItem = async (itemId, fields) => updateDoc('pharmacy_inventory', itemId, fields);

    // ── NOTIFICATIONS (Skipped RTDB for now, assuming notifications table exists) ──
    const addNotification = async (notif) => insertDoc('notifications', notif);
    const markNotificationAsRead = async (notifIds, userId, userName) => { /* Requires complex JSONB updates in Supabase */ };

    // ── ADMISSIONS ──
    const recommendAdmission = (data) => admissionService.recommendAdmission(data);
    const authorizeAdmission = (id, biller, deposit) => admissionService.authorizeAdmission(id, biller, deposit);
    const renewAdmissionCycle = (id, biller, amount) => admissionService.renewAdmissionCycle(id, biller, amount);
    const dischargePatient = (id, summaryData) => admissionService.dischargePatient(id, summaryData);
    const finalizeDischarge = (id) => admissionService.finalizeDischarge(id);

    const value = {
        patients, addPatient, updatePatient,
        notes, addNote,
        progressNotes, addProgressNote,
        appointments, bookAppointment, authorizeAppointment, saveAppointmentFee, completeAppointment, updateAppointmentCondition,
        appointmentFee,
        claims, processClaim, addClaim, approveClaim, rejectClaim, bulkAuthorize,
        expenses, addExpense,
        prescriptions, addPrescription, updatePrescription,
        labOrders, addLabOrder, updateLabOrder, markLabResultAsReviewed, authorizeLabOrder,
        imagingOrders, addImagingOrder, updateImagingOrder, authorizeImagingOrder,
        pharmacyInventory,
        admissions, recommendAdmission, authorizeAdmission, renewAdmissionCycle, dischargePatient, finalizeDischarge,
        notifications,
        departments, setDepartments,
        rooms, setRooms,
        tariffs, setTariffs,
        loading,
        addNotification, markNotificationAsRead,
        toggleReaction: async () => {} // Removed RTDB logic
    };

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => useContext(DataContext);
