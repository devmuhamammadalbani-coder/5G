import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
    Download, CreditCard, Filter, Send, PlusCircle, X,
    CheckCircle2, Clock, AlertCircle, Printer, FlaskConical, Scan,
    Package, Calendar, User, DollarSign, ChevronDown, ChevronUp,
    DoorOpen, RefreshCw, Info, BarChart3, TrendingDown, ClipboardList,
    Search, Wallet, ShieldCheck, ArrowRight, Receipt
} from 'lucide-react';
import auditLogger from '../utils/auditLogger';
import Preloader from '../components/common/Preloader';
import { generateReceipt } from '../utils/receiptGenerator';

const Billing = () => {
    const { user } = useAuth();
    const {
        claims, processClaim, addClaim, approveClaim, rejectClaim, bulkAuthorize,
        patients, appointments, labOrders, imagingOrders, loading,
        admissions, tariffs, expenses, addExpense, appointmentFee
    } = useData();

    // UI States
    const [filterStatus, setFilterStatus] = useState('All');
    const [showNewClaimModal, setShowNewClaimModal] = useState(false);
    const [viewingClaim, setViewingClaim] = useState(null);
    const [newClaim, setNewClaim] = useState({ patientId: '', amount: '', description: '' });
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [newExpense, setNewExpense] = useState({ description: '', amount: '', category: 'General' });
    const [searchQuery, setSearchQuery] = useState('');

    // Unified Checkout States
    const [activePatientFolder, setActivePatientFolder] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [authCode, setAuthCode] = useState('');
    const [submittingAction, setSubmittingAction] = useState(null);

    // --- DATA AGGREGATION FOR UNIFIED CHECKOUT ---
    const todayStr = new Date().toISOString().split('T')[0];

    const patientsWithPending = useMemo(() => {
        const pendingMap = {};

        // Helper to add item to map
        const addItem = (pid, name, item) => {
            if (!pendingMap[pid]) pendingMap[pid] = { id: pid, name, items: [] };
            pendingMap[pid].items.push(item);
        };

        // 1. Appointments (All pending billing)
        appointments.filter(a => a.status === 'PendingBilling')
            .forEach(a => addItem(a.patientId, a.patientName, { ...a, type: 'Appointment', amount: a.appointmentFee || appointmentFee, label: 'Consultation Fee' }));

        // 2. Lab Orders
        labOrders.filter(o => o.status === 'PendingBilling')
            .forEach(o => addItem(o.patientId, o.patientName, { ...o, type: 'Laboratory', label: `Lab: ${o.labTests}` }));

        // 3. Radiology
        imagingOrders.filter(o => o.status === 'PendingBilling')
            .forEach(o => addItem(o.patientId, o.patientName, { ...o, type: 'Radiology', label: `Imaging: ${o.imagingTests}` }));

        // 4. Pharmacy & Manual Claims
        claims.filter(c => c.status === 'Pending')
            .forEach(c => addItem(c.patientId, c.patientName, { ...c, type: c.source === 'Pharmacy' ? 'Pharmacy' : 'Manual', label: c.description || 'General Service' }));

        // 5. Admissions
        admissions.filter(a => a.status === 'Recommended')
            .forEach(a => addItem(a.patientId, a.patientName, { ...a, type: 'Admission', amount: a.dailyRate, label: `Admission Deposit (Bed ${a.bedNumber})` }));

        admissions.filter(a => {
            if (a.status !== 'Active' || !a.nextBillingDate) return false;
            const nextDate = a.nextBillingDate.toDate ? a.nextBillingDate.toDate() : new Date(a.nextBillingDate);
            return nextDate <= new Date();
        }).forEach(a => addItem(a.patientId, a.patientName, { ...a, type: 'AdmissionRenewal', amount: a.dailyRate * 7, label: `Weekly Renewal (Bed ${a.bedNumber})` }));

        return Object.values(pendingMap).filter(p =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.id.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [appointments, labOrders, imagingOrders, claims, admissions, searchQuery, todayStr, appointmentFee]);

    // --- FINANCIAL STATS ---
    const dailyIncome = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const paidToday = claims.filter(c => {
            const date = c.paidAt?.toDate ? c.paidAt.toDate() : (c.createdAt?.toDate ? c.createdAt.toDate() : new Date());
            date.setHours(0, 0, 0, 0);
            return c.status === 'Paid' && date.getTime() === today.getTime();
        });
        return {
            total: paidToday.reduce((acc, c) => acc + parseFloat(c.amount || 0), 0),
            consultation: paidToday.filter(c => c.source === 'Appointment').reduce((acc, c) => acc + parseFloat(c.amount || 0), 0),
            laboratory: paidToday.filter(c => c.source === 'Laboratory').reduce((acc, c) => acc + parseFloat(c.amount || 0), 0),
            radiology: paidToday.filter(c => c.source === 'Radiology').reduce((acc, c) => acc + parseFloat(c.amount || 0), 0),
            pharmacy: paidToday.filter(c => c.source === 'Pharmacy').reduce((acc, c) => acc + parseFloat(c.amount || 0), 0),
        };
    }, [claims]);

    const dailyExpense = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return expenses.filter(e => {
            const date = e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
            date.setHours(0, 0, 0, 0);
            return date.getTime() === today.getTime();
        }).reduce((acc, e) => acc + parseFloat(e.amount || 0), 0);
    }, [expenses]);

    // --- ACTIONS ---

    const handleBulkCheckout = async () => {
        if (!activePatientFolder) return;
        if (paymentMethod === 'HMO' && !authCode.trim()) return alert('Please enter HMO Authorization Code.');

        const confirmMsg = `Authorize ${activePatientFolder.items.length} items for ${activePatientFolder.name} via ${paymentMethod}?\nTotal: ₦${activePatientFolder.items.reduce((acc, i) => acc + parseFloat(i.amount || 0), 0).toLocaleString()}`;
        if (!window.confirm(confirmMsg)) return;

        setSubmittingAction('bulk');
        try {
            await bulkAuthorize(activePatientFolder.items, user.name, { paymentMethod, authCode });

            // Generate Consolidated Receipt
            generateReceipt({
                type: 'Consolidated Hospital Bill',
                patientName: activePatientFolder.name,
                patientId: activePatientFolder.id,
                paymentMethod,
                authCode: paymentMethod === 'HMO' ? authCode : null,
                lineItems: activePatientFolder.items.map(i => ({
                    label: i.label,
                    qty: 1,
                    unitPrice: parseFloat(i.amount || 0)
                })),
                totalAmount: activePatientFolder.items.reduce((acc, i) => acc + parseFloat(i.amount || 0), 0),
                receiptId: `RCT-${Date.now().toString().slice(-6)}`,
                billerName: user.name,
                note: `Payment cleared via ${paymentMethod}. All services authorized.`
            });

            auditLogger.log(user, 'WRITE', 'BILLING', activePatientFolder.id, `Bulk Authorized ${activePatientFolder.items.length} items for ${activePatientFolder.name}`);
            setActivePatientFolder(null);
            setAuthCode('');
            setPaymentMethod('Cash');
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setSubmittingAction(null);
        }
    };

    const handleUpdateItemAmount = (itemId, newAmount) => {
        setActivePatientFolder(prev => ({
            ...prev,
            items: prev.items.map(i => i.id === itemId ? { ...i, amount: parseFloat(newAmount) || 0 } : i)
        }));
    };

    if (loading) return <Preloader message="Opening Financial Command Center..." />;

    return (
        <div className="page-container billing-v2">
            <div className="page-header-flex">
                <div>
                    <h2>Revenue Cycle Control</h2>
                    <p>Grouped patient checkouts and payment authorization.</p>
                </div>
                <div className="flex-gap">
                    <button className="secondary-btn flex-btn" onClick={() => setShowExpenseModal(true)}>
                        <TrendingDown size={18} /> Spent Out (Expense)
                    </button>
                    <button className="primary-btn flex-btn" onClick={() => setShowNewClaimModal(true)}>
                        <PlusCircle size={18} /> Manual Invoice
                    </button>
                </div>
            </div>

            {/* FINANCIAL SUMMARY */}
            <div className="daily-stats-row">
                <div className="fin-stat-card income">
                    <div className="fin-icon"><DollarSign size={24} /></div>
                    <div className="fin-data">
                        <label>Today's Revenue</label>
                        <h3>₦{dailyIncome.total.toLocaleString()}</h3>
                    </div>
                </div>
                <div className="fin-stat-card expense">
                    <div className="fin-icon"><TrendingDown size={24} /></div>
                    <div className="fin-data">
                        <label>Today's Expenses</label>
                        <h3>₦{dailyExpense.toLocaleString()}</h3>
                    </div>
                </div>
                <div className="fin-stat-card net">
                    <div className="fin-icon"><BarChart3 size={24} /></div>
                    <div className="fin-data">
                        <label>Net Cashflow</label>
                        <h3>₦{(dailyIncome.total - dailyExpense).toLocaleString()}</h3>
                    </div>
                </div>
            </div>

            <div className="billing-main-layout">
                {/* ── LEFT: PENDING PATIENTS ── */}
                <div className="pending-queue-sidebar">
                    <div className="sidebar-header">
                        <h3><Clock size={18} /> Pending Checkouts</h3>
                        <div className="search-bar-mini">
                            <Search size={14} />
                            <input
                                type="text"
                                placeholder="Search patient..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="patient-checkout-list">
                        {patientsWithPending.length === 0 ? (
                            <div className="empty-state-mini">
                                <CheckCircle2 size={30} color="#10b981" />
                                <p>All patients cleared.</p>
                            </div>
                        ) : (
                            patientsWithPending.map(p => (
                                <div
                                    key={p.id}
                                    className={`patient-checkout-card ${activePatientFolder?.id === p.id ? 'active' : ''}`}
                                    onClick={() => setActivePatientFolder(p)}
                                >
                                    <div className="pcc-info">
                                        <strong>{p.name}</strong>
                                        <span>{p.items.length} items pending</span>
                                    </div>
                                    <div className="pcc-amount">
                                        ₦{p.items.reduce((acc, i) => acc + parseFloat(i.amount || 0), 0).toLocaleString()}
                                        <ArrowRight size={14} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ── CENTER: ACTIVE FOLDER ── */}
                <div className="active-checkout-panel">
                    {activePatientFolder ? (
                        <div className="checkout-folder fade-in">
                            <div className="folder-header">
                                <div className="fh-left">
                                    <div className="patient-avatar">{activePatientFolder.name[0]}</div>
                                    <div>
                                        <h3>{activePatientFolder.name}</h3>
                                        <span className="small-text">Patient ID: {activePatientFolder.id.substring(0, 8)}</span>
                                    </div>
                                </div>
                                <button className="close-btn" onClick={() => setActivePatientFolder(null)}><X size={20} /></button>
                            </div>

                            <div className="folder-body">
                                <h4>Pending Items for Authorization</h4>
                                <div className="billing-items-list">
                                    {activePatientFolder.items.map((item, idx) => (
                                        <div key={idx} className="billing-item-row">
                                            <div className="bi-meta">
                                                <div className={`bi-icon ${item.type.toLowerCase()}`}>
                                                    {item.type === 'Appointment' && <Calendar size={14} />}
                                                    {item.type === 'Laboratory' && <FlaskConical size={14} />}
                                                    {item.type === 'Radiology' && <Scan size={14} />}
                                                    {item.type === 'Pharmacy' && <Package size={14} />}
                                                    {item.type === 'Admission' && <DoorOpen size={14} />}
                                                </div>
                                                <div>
                                                    <strong>{item.label}</strong>
                                                    <span className="small-text">{item.type}</span>
                                                </div>
                                            </div>
                                            <div className="bi-price">
                                                <label>₦</label>
                                                <input
                                                    type="number"
                                                    value={item.amount || ''}
                                                    onChange={e => handleUpdateItemAmount(item.id, e.target.value)}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="checkout-footer-controls">
                                    <div className="payment-method-selector">
                                        <label><Wallet size={14} /> Payment Method</label>
                                        <div className="method-grid">
                                            {['Cash', 'POS', 'Transfer', 'HMO'].map(m => (
                                                <button
                                                    key={m}
                                                    className={`method-btn ${paymentMethod === m ? 'active' : ''}`}
                                                    onClick={() => setPaymentMethod(m)}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {paymentMethod === 'HMO' && (
                                        <div className="hmo-auth-section fade-in">
                                            <label><ShieldCheck size={14} /> HMO Authorization Code</label>
                                            <input
                                                type="text"
                                                placeholder="Enter Auth Code..."
                                                value={authCode}
                                                onChange={e => setAuthCode(e.target.value)}
                                                className="full-input"
                                            />
                                        </div>
                                    )}

                                    <div className="checkout-summary">
                                        <div className="summary-row">
                                            <span>Subtotal Items ({activePatientFolder.items.length})</span>
                                            <span>₦{activePatientFolder.items.reduce((acc, i) => acc + parseFloat(i.amount || 0), 0).toLocaleString()}</span>
                                        </div>
                                        <div className="summary-total">
                                            <span>Total Amount Due</span>
                                            <span>₦{activePatientFolder.items.reduce((acc, i) => acc + parseFloat(i.amount || 0), 0).toLocaleString()}</span>
                                        </div>
                                    </div>

                                    <button
                                        className="checkout-finalize-btn"
                                        disabled={submittingAction === 'bulk'}
                                        onClick={handleBulkCheckout}
                                    >
                                        {submittingAction === 'bulk' ? 'Processing...' : (
                                            <><Printer size={18} /> Authorize & Print Consolidated Receipt</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="no-folder-state">
                            <Receipt size={60} color="#e2e8f0" />
                            <p>Select a patient from the sidebar to begin checkout.</p>
                        </div>
                    )}
                </div>

                {/* ── RIGHT: RECENT ACTIVITY ── */}
                <div className="recent-activity-panel">
                    <div className="panel-header">
                        <h3>Recent Transactions</h3>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="small-select">
                            <option value="All">All Status</option>
                            <option value="Paid">Paid</option>
                            <option value="Pending">Pending</option>
                            <option value="Rejected">Rejected</option>
                        </select>
                    </div>
                    <div className="activity-list">
                        {claims.filter(c => filterStatus === 'All' || c.status === filterStatus).slice(0, 20).map(c => (
                            <div key={c.id} className="activity-card" onClick={() => setViewingClaim(c)}>
                                <div className="ac-meta">
                                    <strong>{c.patientName}</strong>
                                    <span className="small-text">{new Date(c.paidAt?.toDate?.() || c.createdAt?.toDate?.() || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull; {c.type || c.source}</span>
                                </div>
                                <div className="ac-value">
                                    <div className={`badge ${c.status.toLowerCase()}`}>{c.status}</div>
                                    <strong>₦{parseFloat(c.amount || 0).toLocaleString()}</strong>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Manual New Claim Modal */}
            {showNewClaimModal && (
                <div className="modal-backdrop">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Generate New Patient Invoice</h3>
                            <button onClick={() => setShowNewClaimModal(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={e => {
                            e.preventDefault();
                            const pt = patients.find(p => p.id === newClaim.patientId);
                            addClaim({ ...newClaim, patientName: pt?.name, status: 'Pending', source: 'Manual' });
                            setShowNewClaimModal(false);
                            setNewClaim({ patientId: '', amount: '', description: '' });
                        }} className="modal-body">
                            <div className="form-group">
                                <label>Patient</label>
                                <select required value={newClaim.patientId} onChange={e => setNewClaim({ ...newClaim, patientId: e.target.value })} className="full-select">
                                    <option value="">-- Select Patient --</option>
                                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group mt-2">
                                <label>Service Description</label>
                                <input type="text" required value={newClaim.description} onChange={e => setNewClaim({ ...newClaim, description: e.target.value })} placeholder="e.g. Surgery Deposit, Admission Fee..." />
                            </div>
                            <div className="form-group mt-2">
                                <label>Billed Amount (₦)</label>
                                <input type="number" required value={newClaim.amount} onChange={e => setNewClaim({ ...newClaim, amount: e.target.value })} />
                            </div>
                            <div className="modal-actions mt-3">
                                <button type="button" className="secondary-btn" onClick={() => setShowNewClaimModal(false)}>Cancel</button>
                                <button type="submit" className="primary-btn">Generate Invoice</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Expense Modal */}
            {showExpenseModal && (
                <div className="modal-backdrop">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Record Hospital Outflow (Expense)</h3>
                            <button onClick={() => setShowExpenseModal(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={e => {
                            e.preventDefault();
                            addExpense(newExpense);
                            setShowExpenseModal(false);
                            setNewExpense({ description: '', amount: '', category: 'General' });
                        }} className="modal-body">
                            <div className="form-group">
                                <label>Expense Category</label>
                                <select value={newExpense.category} onChange={e => setNewExpense({ ...newExpense, category: e.target.value })} className="full-select">
                                    <option value="General">General/Others</option>
                                    <option value="Supplies">Medical Supplies</option>
                                    <option value="Salaries">Staff Wages</option>
                                    <option value="Utility">Utilities/Fuel</option>
                                </select>
                            </div>
                            <div className="form-group mt-2">
                                <label>Description</label>
                                <input type="text" required value={newExpense.description} onChange={e => setNewExpense({ ...newExpense, description: e.target.value })} placeholder="Purpose of expense..." />
                            </div>
                            <div className="form-group mt-2">
                                <label>Amount (₦)</label>
                                <input type="number" required value={newExpense.amount} onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })} />
                            </div>
                            <div className="modal-actions mt-3">
                                <button type="button" className="secondary-btn" onClick={() => setShowExpenseModal(false)}>Cancel</button>
                                <button type="submit" className="primary-btn" style={{ background: '#ef4444' }}>Record Outflow</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Billing;
