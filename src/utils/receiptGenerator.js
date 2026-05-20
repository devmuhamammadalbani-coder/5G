/**
 * RECEIPT GENERATOR
 * Generates printable HTML receipts for all transaction types:
 * - Appointment fees
 * - Lab test fees
 * - Pharmacy bills
 * Opens in a new window with print dialog triggered automatically.
 */

const HOSPITAL_NAME = '5G E-GURUCLINIC';
const HOSPITAL_TAGLINE = 'Precision Healthcare. Compassionate Care.';

const baseStyles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 13px; color: #111; background: white; padding: 24px; max-width: 720px; margin: 0 auto; }
    .receipt { border: 2px solid #222; padding: 24px; }
    .header { text-align: center; border-bottom: 2px dashed #444; padding-bottom: 16px; margin-bottom: 16px; }
    .header h1 { font-size: 20px; letter-spacing: 2px; text-transform: uppercase; }
    .header p { font-size: 11px; color: #555; margin-top: 4px; }
    .header .rtype { display: inline-block; margin-top: 8px; background: #111; color: white; padding: 3px 12px; font-size: 11px; letter-spacing: 1px; border-radius: 4px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px dashed #999; }
    .meta-item label { font-size: 10px; text-transform: uppercase; color: #666; }
    .meta-item span { font-size: 13px; font-weight: bold; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .items-table th { background: #222; color: white; padding: 6px 10px; font-size: 11px; text-align: left; }
    .items-table td { padding: 6px 10px; border-bottom: 1px solid #ddd; font-size: 12px; }
    .items-table tr:nth-child(even) td { background: #f9f9f9; }
    .unavailable td { color: #999; text-decoration: line-through; }
    .total-section { border-top: 2px solid #222; padding-top: 12px; text-align: right; }
    .total-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; }
    .total-row.grand { font-size: 18px; font-weight: 900; border-top: 1px solid #444; padding-top: 8px; margin-top: 8px; }
    .notice-box { margin-top: 16px; padding: 10px; border: 1px dashed #999; font-size: 11px; color: #444; }
    .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #777; border-top: 1px dashed #ccc; padding-top: 12px; }
    .badge-paid { display: inline-block; background: #16a34a; color: white; padding: 2px 10px; border-radius: 4px; font-size: 10px; }
    .ref-id { font-size: 10px; color: #888; font-family: monospace; margin-top: 4px; }
    @media print {
        body { padding: 0; }
        .no-print { display: none !important; }
    }
`;

/**
 * Generate and print a receipt in a new browser window.
 *
 * @param {Object} opts
 * @param {'Appointment'|'Laboratory'|'Pharmacy'|'General'} opts.type
 * @param {string} opts.patientName
 * @param {string} opts.patientId
 * @param {string} [opts.doctorName]
 * @param {string} [opts.ward]
 * @param {Array}  opts.lineItems   - [{label, qty, unitPrice, available}]
 * @param {number} opts.totalAmount
 * @param {string} opts.receiptId
 * @param {string} [opts.billerName]
 * @param {string} [opts.note]       - Extra notice shown below total
 * @param {boolean} [opts.autoPrint] - Auto-open print dialog (default: true)
 */
export const generateReceipt = ({
    type = 'General',
    patientName,
    patientId,
    doctorName,
    ward,
    lineItems = [],
    totalAmount = 0,
    receiptId,
    billerName,
    note,
    autoPrint = true,
}) => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });

    const typeLabels = {
        Appointment: 'APPOINTMENT RECEIPT',
        Laboratory:  'LABORATORY RECEIPT',
        Pharmacy:    'PHARMACY RECEIPT',
        General:     'PAYMENT RECEIPT',
    };

    const itemRows = lineItems.map(item => `
        <tr class="${item.available === false ? 'unavailable' : ''}">
            <td>${item.label}</td>
            <td>${item.available === false ? '<em>Not Available</em>' : '✓ Dispensed'}</td>
            <td style="text-align:center">${item.qty || 1}</td>
            <td style="text-align:right">₦${(item.unitPrice || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td>
            <td style="text-align:right">${item.available === false ? '—' : '₦' + ((item.unitPrice || 0) * (item.qty || 1)).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td>
        </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>${typeLabels[type]} — ${patientName}</title>
    <style>${baseStyles}</style>
</head>
<body>
    <div class="receipt">
        <div class="header">
            <h1>${HOSPITAL_NAME}</h1>
            <p>${HOSPITAL_TAGLINE}</p>
            <div class="rtype">${typeLabels[type]}</div>
        </div>

        <div class="meta">
            <div class="meta-item"><label>Patient Name</label><span>${patientName}</span></div>
            <div class="meta-item"><label>Patient ID</label><span>${patientId || '—'}</span></div>
            ${doctorName ? `<div class="meta-item"><label>Attending Doctor</label><span>${doctorName}</span></div>` : ''}
            ${ward ? `<div class="meta-item"><label>Department / Ward</label><span>${ward}</span></div>` : ''}
            <div class="meta-item"><label>Date</label><span>${dateStr}</span></div>
            <div class="meta-item"><label>Time</label><span>${timeStr}</span></div>
            ${billerName ? `<div class="meta-item"><label>Processed By</label><span>${billerName}</span></div>` : ''}
            <div class="meta-item"><label>Status</label><span class="badge-paid">✓ PAID</span></div>
        </div>

        ${lineItems.length > 0 ? `
        <table class="items-table">
            <thead>
                <tr>
                    <th>Description</th>
                    <th>Status</th>
                    <th style="text-align:center">Qty</th>
                    <th style="text-align:right">Unit Price</th>
                    <th style="text-align:right">Amount</th>
                </tr>
            </thead>
            <tbody>${itemRows}</tbody>
        </table>
        ` : ''}

        <div class="total-section">
            <div class="total-row grand">
                <span>TOTAL AMOUNT PAID</span>
                <span>₦${totalAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span>
            </div>
        </div>

        ${note ? `<div class="notice-box"><strong>Note:</strong> ${note}</div>` : ''}

        <div class="footer">
            <div class="ref-id">Receipt Ref: ${receiptId || 'N/A'} &nbsp;|&nbsp; ${dateStr} ${timeStr}</div>
            <p style="margin-top:6px">Thank you for choosing ${HOSPITAL_NAME}.</p>
            <p>This is an official payment receipt. Please retain for your records.</p>
        </div>
    </div>

    ${autoPrint ? `<script>window.onload = function() { window.print(); }<\/script>` : ''}
</body>
</html>`;

    const win = window.open('', '_blank', 'width=760,height=900,scrollbars=yes');
    if (win) {
        win.document.write(html);
        win.document.close();
    } else {
        alert('Pop-up blocked. Please allow pop-ups for this site to print receipts.');
    }
};

export default generateReceipt;
