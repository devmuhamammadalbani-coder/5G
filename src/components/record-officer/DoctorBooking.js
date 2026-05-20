import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import auditLogger from '../../utils/auditLogger';
import { Calendar, Stethoscope, MapPin, Clock } from 'lucide-react';
import { toCamelCase, toSnakeCase } from '../../utils/caseConverter';
import './DoctorBooking.css';

const DoctorBooking = ({ patient, onComplete, onCancel }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [patientData, setPatientData] = useState(null);
    const [wards] = useState(['General Medicine', 'Paediatrics', 'Obstetrics & Gynaecology', 'Surgical', 'Orthopaedic', 'Ophthalmology']);
    const [doctors, setDoctors] = useState([]);

    const [booking, setBooking] = useState({
        ward: '',
        doctorId: '',
        doctorName: '',
        date: new Date().toISOString().split('T')[0],
        timeSlot: 'Morning',
        priority: 'Normal',
        notes: ''
    });

    useEffect(() => {
        if (patient) fetchPatient();
    }, [patient]);

    const fetchPatient = async () => {
        const { data, error } = await supabase
            .from('patients')
            .select('*')
            .eq('id', patient)
            .single();
            
        if (data) setPatientData(toCamelCase(data));
        if (error) console.error(error);
    };

    useEffect(() => {
        if (booking.ward) fetchDoctorsByWard();
    }, [booking.ward]);

    const fetchDoctorsByWard = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('role', 'Doctor')
                .eq('specialty', booking.ward);
                
            if (error) throw error;
            
            const docs = toCamelCase(data || []);

            if (docs.length === 0) {
                setDoctors([{ id: 'fallback-doc', name: `Dr. Demo (${booking.ward})`, specialty: booking.ward }]);
            } else {
                setDoctors(docs);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleBooking = async (e) => {
        e.preventDefault();
        if (!booking.doctorId) { alert("Please select a doctor"); return; }

        setLoading(true);
        try {
            const appointmentData = {
                ...booking,
                patientId: patient,
                patientName: `${patientData.surname}, ${patientData.firstName}`,
                bookedBy: user.id || user.uid,
                bookedByName: user.name || user.email,
                status: 'Scheduled'
            };

            const { data, error } = await supabase
                .from('appointments')
                .insert([toSnakeCase(appointmentData)])
                .select()
                .single();

            if (error) throw error;

            auditLogger.log(user, 'WRITE', 'APPOINTMENT_BOOKING', data.id, `Booked appointment for ${patientData.surname}`);

            alert("Appointment Booked Successfully");
            onComplete?.();
        } catch (error) {
            alert("Error booking appointment: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!patientData && patient) return <div>Loading patient data...</div>;

    return (
        <div className="booking-v2 fade-in">
            <div className="booking-header">
                <h3><Calendar size={20} /> Schedule Appointment</h3>
                <div className="patient-summary">
                    <strong>Patient:</strong> {patientData?.surname}, {patientData?.firstName} ({patientData?.patientID})
                </div>
            </div>

            <form onSubmit={handleBooking} className="booking-form">
                <div className="booking-grid">
                    <div className="booking-field">
                        <label><MapPin size={16} /> Select Ward / Specialty</label>
                        <select
                            required
                            value={booking.ward}
                            onChange={e => setBooking({ ...booking, ward: e.target.value, doctorId: '', doctorName: '' })}
                        >
                            <option value="">-- Choose Ward --</option>
                            {wards.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                    </div>

                    <div className="booking-field">
                        <label><Stethoscope size={16} /> Available Doctor</label>
                        <select
                            required
                            disabled={!booking.ward}
                            value={booking.doctorId}
                            onChange={e => {
                                const doc = doctors.find(d => d.id === e.target.value);
                                setBooking({ ...booking, doctorId: e.target.value, doctorName: doc?.name || '' });
                            }}
                        >
                            <option value="">-- Select Doctor --</option>
                            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>

                    <div className="booking-field">
                        <label><Calendar size={16} /> Preferred Date</label>
                        <input
                            type="date"
                            required
                            min={new Date().toISOString().split('T')[0]}
                            value={booking.date}
                            onChange={e => setBooking({ ...booking, date: e.target.value })}
                        />
                    </div>

                    <div className="booking-field">
                        <label><Clock size={16} /> Time Slot</label>
                        <select value={booking.timeSlot} onChange={e => setBooking({ ...booking, timeSlot: e.target.value })}>
                            <option value="Morning">Morning (8am - 12pm)</option>
                            <option value="Afternoon">Afternoon (12pm - 4pm)</option>
                            <option value="Evening">Evening (4pm - 8pm)</option>
                        </select>
                    </div>

                    <div className="booking-field full">
                        <label>Reason for Visit / Clinical Notes</label>
                        <textarea
                            placeholder="Briefly describe the reason for appointment..."
                            value={booking.notes}
                            onChange={e => setBooking({ ...booking, notes: e.target.value })}
                        />
                    </div>
                </div>

                <div className="booking-footer">
                    <button type="button" className="cancel-btn" onClick={onCancel}>Cancel</button>
                    <button type="submit" className="confirm-btn" disabled={loading || !booking.doctorId}>
                        {loading ? 'Processing...' : 'Confirm Appointment'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default DoctorBooking;
