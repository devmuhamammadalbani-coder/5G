import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
    Package as PackageIcon,
    FileText as FileTextIcon,
    CheckCircle2 as CheckIcon,
    AlertTriangle as AlertIcon,
    Search as SearchIcon,
    Plus as PlusIcon,
    Trash2 as TrashIcon,
    Printer as PrintIcon,
    X as XIcon,
    DollarSign as DollarIcon,
    Info as InfoIcon,
    Pill as PillIcon
} from 'lucide-react';
import auditLogger from '../utils/auditLogger';
import Preloader from '../components/common/Preloader';
import { parsePrescription } from '../utils/drugDictionary';
import { medicineData } from '../utils/medicineData';

const PharmacyDashboard = () => {
    const { user } = useAuth();
    const {
        prescriptions, updatePrescription, pharmacyInventory,
        addPharmacyItem, updatePharmacyItem, addClaim, loading
    } = useData();

    const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'inventory'

    // Inventory State
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddItem, setShowAddItem] = useState(false);
    const [newItem, setNewItem] = useState({ name: '', price: '', stock: '' });

    const [submitting, setSubmitting] = useState(false);

    // Prescription Processing State
    const [processingRx, setProcessingRx] = useState(null);
    const [matchedItems, setMatchedItems] = useState([]);
    const [unresolvedItems, setUnresolvedItems] = useState([]);
    const [unmatchedAlert, setUnmatchedAlert] = useState(false);

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

    // Derived Data
    const pendingRx = prescriptions.filter(p => p.status === 'Pending').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const processedRx = prescriptions.filter(p => ['Processed', 'Paid', 'Dispensed'].includes(p.status)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const filteredInventory = pharmacyInventory.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // --- Inventory Handlers ---
    const handleAddItem = (e) => {
        e.preventDefault();
        addPharmacyItem({
            name: newItem.name,
            price: parseFloat(newItem.price),
            stock: parseInt(newItem.stock, 10)
        });
        auditLogger.log(user, 'WRITE', 'PHARMACY_INVENTORY', 'NEW', `Added new drug: ${newItem.name}`);
        setNewItem({ name: '', price: '', stock: '' });
        setShowAddItem(false);
    };

    const handleUpdateStock = (id, newStock) => {
        updatePharmacyItem(id, { stock: parseInt(newStock, 10) });
    };

    const handleUpdatePrice = (id, newPrice) => {
        updatePharmacyItem(id, { price: parseFloat(newPrice) });
    };


    // --- Prescription Processing Handlers ---
    const handleDispense = async (prescriptionId) => {
        try {
            await updatePrescription(prescriptionId, { status: 'Dispensed', dispensedAt: new Date().toISOString() });
            auditLogger.log(user, 'WRITE', 'PHARMACY_RX', prescriptionId, 'Dispensed paid medication');
            alert("Medication successfully marked as Dispensed!");
        } catch (error) {
            console.error("Error dispensing medication", error);
            alert("Failed to dispense medication.");
        }
    };

    const openProcessModal = (rx) => {
        setProcessingRx(rx);
        const { matched, unresolved } = parsePrescription(rx.drugs, pharmacyInventory);
        setMatchedItems(matched);
        setUnresolvedItems(unresolved);
        setUnmatchedAlert(matched.length === 0 && unresolved.length === 0);
    };

    const handleQuantityChange = (index, delta) => {
        const updated = [...matchedItems];
        if (updated[index].quantity + delta > 0) {
            updated[index].quantity += delta;
            setMatchedItems(updated);
        }
    };

    const handleRemoveMatchedItem = (index) => {
        setMatchedItems(matchedItems.filter((_, i) => i !== index));
    };

    const handleAddManualItem = (e) => {
        const val = e.target.value;
        if (!val) return;
        const item = pharmacyInventory.find(i => i.id === val);
        if (item && !matchedItems.some(m => m.id === item.id)) {
            setMatchedItems([...matchedItems, { ...item, quantity: 1, isAvailable: item.stock > 0 }]);
        }
        e.target.value = ''; // reset select
    };

    const processAndSubmitToBilling = async () => {
        if (!processingRx || submitting) return;

        // Validation: Ensure we have essential data
        if (!processingRx.patientId || !processingRx.patientName) {
            alert("Error: Missing Patient identification data on this prescription. Please contact the doctor.");
            return;
        }

        setSubmitting(true);

        const availableItems = matchedItems.filter(m => m.isAvailable);
        const totalAmount = availableItems.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            const qty = parseInt(item.quantity, 10) || 0;
            return sum + (price * qty);
        }, 0);

        // Check for NaN
        if (isNaN(totalAmount)) {
            alert("Error: Invalid price or quantity detected. Please check the drug items.");
            setSubmitting(false);
            return;
        }

        let billDescription = `Pharmacy Prescription Invoice:\n`;
        availableItems.forEach(item => {
            billDescription += `${item.name} x${item.quantity} = ₦${((parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 0)).toLocaleString()}\n`;
        });

        if (unresolvedItems.length > 0) {
            billDescription += `\nOUT OF STOCK / UNRESOLVED:\n`;
            unresolvedItems.forEach(u => {
                billDescription += `- ${u.name} (Matched from: ${u.alias})\n`;
            });
        }

        // If no items matched, we still allow sending to billing so the office can handle manual pricing/service fees
        if (totalAmount <= 0 && availableItems.length === 0) {
            if (!window.confirm("No medication items matched your inventory. Send this prescription to Billing anyway as a manual pending invoice?")) {
                setSubmitting(false);
                return;
            }
            billDescription = `MANUAL BILLING DATA FOR: ${processingRx.drugs}\n(No inventory matches found - Biller to input amount)`;
        }

        try {
            await addClaim({
                patientId: processingRx.patientId,
                patientName: processingRx.patientName,
                amount: totalAmount,
                description: billDescription,
                source: 'Pharmacy',
                prescriptionId: processingRx.id,
                items: matchedItems.map(m => ({
                    label: m.name,
                    qty: m.quantity,
                    unitPrice: m.price,
                    available: m.isAvailable
                }))
            });

            await updatePrescription(processingRx.id, {
                status: 'Processed',
                processedAt: new Date().toISOString(),
                billingStatus: 'Unpaid'
            });

            auditLogger.log(user, 'WRITE', 'PHARMACY_RX', processingRx.id, `Processed prescription and sent bill of ₦${totalAmount} to office`);
            
            alert("Prescription processed! Data forwarded to billing office.");
            setProcessingRx(null);
        } catch (error) {
            console.error("Pharmacy Billing Error:", error);
            // Provide more specific error feedback
            const errorMsg = error.message || "Unknown error";
            alert(`Failed to send to billing. ${errorMsg.includes('permission') ? 'Check system permissions.' : 'Please check your internet connection.'}`);
        } finally {
            setSubmitting(false);
        }
    };


    if (loading) {
        return <Preloader message="Opening Pharmacy Portal..." />;
    }

    return (
        <div className="pharmacy-dashboard page-container">
            <div className="page-header-flex">
                <div>
                    <h2>Pharmacy Information System</h2>
                    <p>Automated Drug Dispensing & Revenue Control.</p>
                </div>
            </div>

            <div className="pharmacy-tabs">
                <button className={`tab-btn ${activeTab === 'queue' ? 'active' : ''}`} onClick={() => setActiveTab('queue')}>
                    <FileTextIcon size={18} /> Prescription Queue ({pendingRx.length})
                </button>
                <button className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                    <PackageIcon size={18} /> Drug Inventory
                </button>
            </div>

            {activeTab === 'queue' && (
                <div className="tab-pane">
                    <div className="dp-grid">
                        <div className="dp-section">
                            <div className="dp-section-title upcoming">
                                <FileTextIcon size={16} /> Pending Prescriptions
                                <span className="appt-count">{pendingRx.length}</span>
                            </div>

                            {pendingRx.length === 0 ? (
                                <div className="appt-empty">No pending prescriptions at this time.</div>
                            ) : pendingRx.map(rx => (
                                <div key={rx.id} className="queue-card rx-card">
                                    <div className="queue-card-top">
                                        <div className="queue-info">
                                            <strong>{rx.patientName}</strong>
                                            <span className="small-text">Referral: Dr. {rx.doctorName}</span>
                                            <span className="small-text">{new Date(rx.createdAt).toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <div className="rx-preview">
                                        <strong>Doctor's Prescription Text:</strong>
                                        <p style={{ fontStyle: 'italic', background: 'rgba(0,0,0,0.05)', padding: '10px', borderRadius: '4px', marginTop: '6px', color: '#1e293b' }}>
                                            "{rx.drugs}"
                                        </p>
                                    </div>
                                    <div className="queue-actions">
                                        <button className="primary-btn" onClick={() => openProcessModal(rx)}>
                                            <PackageIcon size={16} /> Smart Process Order
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="dp-section">
                            <div className="dp-section-title history">
                                <CheckIcon size={16} /> Recent Transactions
                                <span className="appt-count">{processedRx.length}</span>
                            </div>

                            {processedRx.length === 0 ? (
                                <div className="appt-empty">No processed prescriptions.</div>
                            ) : processedRx.map(rx => (
                                <div key={rx.id} className="queue-card seen">
                                    <div className="queue-card-top">
                                        <div className="queue-info">
                                            <strong>{rx.patientName}</strong>
                                            <span className="small-text">Handled: {new Date(rx.processedAt).toLocaleString()}</span>
                                        </div>
                                        <div className="queue-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                            <span className={`appt-status-pill ${rx.status.toLowerCase()}`}>
                                                {rx.status === 'Paid' ? 'Paid - Ready to Dispense' : rx.status === 'Dispensed' ? 'Dispensed' : 'Pending Payment'}
                                            </span>
                                            {rx.status === 'Paid' && (
                                                <button className="primary-btn mt-2" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => handleDispense(rx.id)}>
                                                    <CheckIcon size={14} style={{ marginRight: '4px' }} /> Dispense
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'inventory' && (
                <div className="tab-pane">
                    <div className="inventory-header">
                        <div className="search-bar">
                            <SearchIcon size={18} />
                            <input
                                type="text"
                                placeholder="Search drug inventory..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button className="primary-btn" onClick={() => setShowAddItem(true)}>
                            <PlusIcon size={18} /> Register New Drug
                        </button>
                    </div>

                    {showAddItem && (
                        <form className="add-item-form card" onSubmit={handleAddItem}>
                            <h4>Register New Medication</h4>
                            <div className="form-row-3">
                                <div className="form-group">
                                    <label>Drug Name & Strength (Search Library)</label>
                                    <div className="searchable-select" ref={drugDropdownRef}>
                                        <div className="custom-select-wrapper">
                                            <input 
                                                type="text" 
                                                placeholder="Search medicine library..." 
                                                value={drugSearch || newItem.name} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setDrugSearch(val);
                                                    setNewItem({ ...newItem, name: val });
                                                    setShowDrugList(true);
                                                }}
                                                onFocus={() => setShowDrugList(true)}
                                                required
                                            />
                                            {showDrugList && drugSearch && (
                                                <div className="select-dropdown-list" style={{ top: '100%', left: 0, width: '100%', maxHeight: '200px', overflowY: 'auto', zIndex: 100 }}>
                                                    {filteredDrugs.length > 0 ? (
                                                        filteredDrugs.map(d => (
                                                            <div 
                                                                key={d} 
                                                                className="dropdown-item" 
                                                                onClick={() => {
                                                                    setNewItem({ ...newItem, name: d });
                                                                    setDrugSearch('');
                                                                    setShowDrugList(false);
                                                                }}
                                                            >
                                                                <PillIcon size={14} style={{ marginRight: '8px', color: '#3b82f6' }} />
                                                                {d}
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="dropdown-item disabled">New drug name: "{drugSearch}"</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Unit Price (₦)</label>
                                    <input required type="number" step="0.01" min="0" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} placeholder="0.00" />
                                </div>
                                <div className="form-group">
                                    <label>Current Stock</label>
                                    <input required type="number" min="0" value={newItem.stock} onChange={e => setNewItem({ ...newItem, stock: e.target.value })} placeholder="0" />
                                </div>
                            </div>
                            <div className="form-actions">
                                <button type="button" className="secondary-btn" onClick={() => setShowAddItem(false)}>Cancel</button>
                                <button type="submit" className="primary-btn">Save to Inventory</button>
                            </div>
                        </form>
                    )}

                    <table className="data-table mt-4">
                        <thead>
                            <tr>
                                <th>Medication</th>
                                <th>Unit Price</th>
                                <th>Stock</th>
                                <th>Availability</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInventory.map(item => (
                                <tr key={item.id}>
                                    <td><strong>{item.name}</strong></td>
                                    <td>
                                        <div className="edit-cell">
                                            ₦<input
                                                type="number" step="0.01"
                                                className="inline-input"
                                                defaultValue={item.price}
                                                onBlur={(e) => handleUpdatePrice(item.id, e.target.value)}
                                            />
                                        </div>
                                    </td>
                                    <td>
                                        <div className="edit-cell">
                                            <input
                                                type="number"
                                                className="inline-input"
                                                defaultValue={item.stock}
                                                onBlur={(e) => handleUpdateStock(item.id, e.target.value)}
                                            />
                                        </div>
                                    </td>
                                    <td>
                                        {item.stock > 10 ? (
                                            <span className="badge success">Available</span>
                                        ) : item.stock > 0 ? (
                                            <span className="badge warning">Low Stock</span>
                                        ) : (
                                            <span className="badge danger">Out of Stock</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {processingRx && (
                <div className="modal-backdrop">
                    <div className="modal-content pharmacy-modal max-w-lg">
                        <div className="modal-header">
                            <div>
                                <h3>Process & Bill Prescription</h3>
                                <p className="small-text">{processingRx.patientName}</p>
                            </div>
                            <button onClick={() => setProcessingRx(null)}><XIcon size={18} /></button>
                        </div>

                        <div className="modal-body pharmacy-bill-layout scrollable-modal-body">
                            <div className="doctor-handwriting-box">
                                <label className="flex items-center gap-2 font-bold mb-1"><FileTextIcon size={14} /> Prescribed by Doctor:</label>
                                <div className="handwriting-preview">"{processingRx.drugs}"</div>
                            </div>

                            <div className="smart-detection-section">
                                <div className="section-head-flex">
                                    <h4>Calculated Billing Items</h4>
                                    <div className="manual-add-wrapper">
                                        <select className="add-manual-select" onChange={handleAddManualItem} defaultValue="">
                                            <option value="" disabled>+ Add manually...</option>
                                            {pharmacyInventory.map(item => (
                                                <option key={item.id} value={item.id}>{item.name} (₦{item.price})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {unmatchedAlert && (
                                    <div className="alert-box warning">
                                        <AlertIcon size={16} />
                                        <span>No medications detected from the prescription text. Please add manually.</span>
                                    </div>
                                )}

                                <div className="bill-table-wrapper">
                                    <table className="mini-bill-table">
                                        <thead>
                                            <tr>
                                                <th>Drug Item</th>
                                                <th>Stock</th>
                                                <th>Qty</th>
                                                <th>Amount</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {matchedItems.map((item, idx) => (
                                                <tr key={item.id} className={!item.isAvailable ? 'row-unavailable' : ''}>
                                                    <td>
                                                        <div className="font-bold">{item.name}</div>
                                                        {!item.isAvailable ? <span className="badge danger x-small">OUT OF STOCK</span> : <span className="badge success x-small">₦{item.price.toLocaleString()} ea</span>}
                                                    </td>
                                                    <td>{item.stock}</td>
                                                    <td>
                                                        <div className="qty-picker">
                                                            <button type="button" onClick={() => handleQuantityChange(idx, -1)}>-</button>
                                                            <span>{item.quantity}</span>
                                                            <button type="button" onClick={() => handleQuantityChange(idx, 1)}>+</button>
                                                        </div>
                                                    </td>
                                                    <td className="text-right">
                                                        <strong>{item.isAvailable ? `₦${(item.price * item.quantity).toLocaleString()}` : '—'}</strong>
                                                    </td>
                                                    <td>
                                                        <button className="del-btn" onClick={() => handleRemoveMatchedItem(idx)}><TrashIcon size={14} /></button>
                                                    </td>
                                                </tr>
                                            ))}

                                            {unresolvedItems.map((u, i) => (
                                                <tr key={`un-${i}`} className="row-unresolved">
                                                    <td>
                                                        <div className="font-bold">{u.name}</div>
                                                        <span className="badge secondary x-small">SHORTHAND: "{u.alias}"</span>
                                                    </td>
                                                    <td colSpan="3" className="text-center italic text-muted text-sm">
                                                        Alias detected but drug is missing from Inventory
                                                    </td>
                                                    <td>
                                                        <button className="del-btn" onClick={() => setUnresolvedItems(unresolvedItems.filter((_, idx) => idx !== i))}><XIcon size={14} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="final-calc-box">
                                    <div className="calc-row">
                                        <span>Subtotal to Charge:</span>
                                        <strong>₦{matchedItems.filter(m => m.isAvailable).reduce((s, i) => s + (i.price * i.quantity), 0).toLocaleString()}</strong>
                                    </div>
                                    <p className="hint-text mt-1"><InfoIcon size={12} /> unavailable items are excluded from total billing.</p>
                                </div>
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button className="secondary-btn" onClick={() => setProcessingRx(null)} disabled={submitting}>Cancel</button>
                            <button className="primary-btn" onClick={processAndSubmitToBilling} disabled={submitting || matchedItems.filter(m => m.isAvailable).length === 0}>
                                {submitting ? (
                                    <>Processing...</>
                                ) : (
                                    <><PrintIcon size={18} /> Confirm & Send to Billing</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default PharmacyDashboard;
