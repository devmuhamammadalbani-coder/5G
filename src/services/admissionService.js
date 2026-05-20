import { supabase } from '../supabaseClient';
import { toCamelCase, toSnakeCase } from '../utils/caseConverter';

export const admissionService = {
    /**
     * Recommended by Doctor
     */
    async recommendAdmission(admissionData) {
        const { data, error } = await supabase
            .from('admissions')
            .insert([
                toSnakeCase({
                    ...admissionData,
                    status: 'Recommended'
                })
            ])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Authorized by Biller (Payment received)
     */
    async authorizeAdmission(id, billerName, depositAmount) {
        // Fetch admission
        const { data: admData, error: admError } = await supabase
            .from('admissions')
            .select('*')
            .eq('id', id)
            .single();
            
        if (admError || !admData) throw new Error("Admission record not found");
        const admission = toCamelCase(admData);
        
        const now = new Date();
        const nextBillingDate = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days from now

        // 1. Update Admission status
        await supabase
            .from('admissions')
            .update(toSnakeCase({
                status: 'Active',
                authorizedBy: billerName,
                authorizedAt: now.toISOString(),
                lastBillingDate: now.toISOString(),
                nextBillingDate: nextBillingDate.toISOString(),
                currentBalance: depositAmount || 0,
                billingCycleStatus: 'Paid'
            }))
            .eq('id', id);

        // 2. Update room occupancy
        if (admission.roomId) {
            const { data: roomSnap } = await supabase
                .from('rooms')
                .select('occupied_beds')
                .eq('id', admission.roomId)
                .single();
                
            if (roomSnap) {
                const currentOccupied = roomSnap.occupied_beds || 0;
                await supabase
                    .from('rooms')
                    .update({ occupied_beds: currentOccupied + 1 })
                    .eq('id', admission.roomId);
            }
        }
        
        // 3. Record income in billing table
        await supabase
            .from('billing')
            .insert([toSnakeCase({
                patientId: admission.patientId || '',
                patientName: admission.patientName || 'Unknown Patient',
                admissionId: id,
                type: 'Ward Admission Deposit',
                description: `Initial Deposit - Bed ${admission.bedNumber || 'Unassigned'} (${admission.roomName || 'Ward'})`,
                amount: parseFloat(depositAmount || 0),
                status: 'Paid',
                source: 'Admission',
                paidAt: now.toISOString()
            })]);

        return true;
    },

    /**
     * Renew billing cycle (another 7 days)
     */
    async renewAdmissionCycle(id, billerName, amountPaid) {
        const { data: snap } = await supabase
            .from('admissions')
            .select('*')
            .eq('id', id)
            .single();
            
        if (!snap) return;

        const data = toCamelCase(snap);
        const baseDate = data.nextBillingDate ? new Date(data.nextBillingDate) : new Date();
        const newNextBillingDate = new Date(baseDate.getTime() + (7 * 24 * 60 * 60 * 1000));
        const now = new Date();

        await supabase
            .from('admissions')
            .update(toSnakeCase({
                lastBillingDate: baseDate.toISOString(),
                nextBillingDate: newNextBillingDate.toISOString(),
                billingCycleStatus: 'Paid',
                status: 'Active',
                lastRenewalBy: billerName,
                lastRenewalAt: now.toISOString()
            }))
            .eq('id', id);

        // Record income in billing collection
        await supabase
            .from('billing')
            .insert([toSnakeCase({
                patientId: data.patientId || '',
                patientName: data.patientName || 'Unknown Patient',
                admissionId: id,
                type: 'Ward Renewal Fee',
                description: `Weekly Bed Renewal - Bed ${data.bedNumber || 'Unassigned'}`,
                amount: parseFloat(amountPaid || 0),
                status: 'Paid',
                source: 'Admission',
                paidAt: now.toISOString()
            })]);

        return true;
    },

    /**
     * Doctor signs & initiates discharge
     */
    async dischargePatient(id, summaryData = {}) {
        const { data: admSnap } = await supabase
            .from('admissions')
            .select('*')
            .eq('id', id)
            .single();
            
        if (!admSnap) throw new Error('Admission record not found');
        const admission = toCamelCase(admSnap);
        const now = new Date();

        await supabase
            .from('admissions')
            .update(toSnakeCase({
                status: 'ReadyForRelease',
                dischargeReadyAt: now.toISOString(),
                dischargeSummary: {
                    finalDiagnosis:        summaryData.finalDiagnosis        || '',
                    clinicalSummary:       summaryData.clinicalSummary       || '',
                    conditionOnDischarge:  summaryData.conditionOnDischarge  || 'Stable',
                    dischargeMedications:  summaryData.dischargeMedications  || '',
                    followUpPlan:          summaryData.followUpPlan          || '',
                    dischargedBy:          summaryData.dischargedBy          || '',
                    signedAt:              now.toISOString(),
                }
            }))
            .eq('id', id);

        return { admission, admissionId: id };
    },

    /**
     * Nurse confirms physical release — frees bed
     */
    async finalizeDischarge(id) {
        const { data: admSnap } = await supabase
            .from('admissions')
            .select('*')
            .eq('id', id)
            .single();
            
        if (!admSnap) throw new Error('Admission record not found');
        const admission = toCamelCase(admSnap);

        await supabase
            .from('admissions')
            .update(toSnakeCase({
                status: 'Discharged',
                dischargedAt: new Date().toISOString()
            }))
            .eq('id', id);

        if (admission.roomId) {
            const { data: roomSnap } = await supabase
                .from('rooms')
                .select('occupied_beds')
                .eq('id', admission.roomId)
                .single();
                
            if (roomSnap) {
                const currentOccupied = roomSnap.occupied_beds || 0;
                await supabase
                    .from('rooms')
                    .update({ occupied_beds: Math.max(0, currentOccupied - 1) })
                    .eq('id', admission.roomId);
            }
        }
        return true;
    },

    async getActiveAdmissions() {
        const { data, error } = await supabase
            .from('admissions')
            .select('*')
            .in('status', ['Active', 'PendingRenewal'])
            .order('created_at', { ascending: false });
            
        if (error) return [];
        return toCamelCase(data);
    },

    async getPendingAdmissions() {
        const { data, error } = await supabase
            .from('admissions')
            .select('*')
            .eq('status', 'Recommended')
            .order('created_at', { ascending: false });
            
        if (error) return [];
        return toCamelCase(data);
    }
};
