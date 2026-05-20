export const getTemplateByRole = (role) => {
    const templates = {
        'Doctor': {
            name: 'Physician Progress Note (SOAP)',
            fields: [
                { id: 'subjective', label: 'Subjective (S)', type: 'textarea', placeholder: 'Patient complaints, history of present illness...' },
                { id: 'objective', label: 'Objective (O)', type: 'textarea', placeholder: 'Physical exam findings, vital signs...' },
                { id: 'assessment', label: 'Assessment (A)', type: 'textarea', placeholder: 'Diagnosis, clinical reasoning...' },
                { id: 'plan', label: 'Plan (P)', type: 'textarea', placeholder: 'Treatment, medications, follow-up...' }
            ]
        },
        'Nurse': {
            name: 'Nursing Assessment & Vitals',
            fields: [
                { id: 'vitals', label: 'Vital Signs', type: 'text', placeholder: 'Temp, HR, RR, BP, SpO2' },
                { id: 'observations', label: 'Clinical Observations', type: 'textarea', placeholder: 'Physical assessment findings...' },
                { id: 'interventions', label: 'Nursing Interventions', type: 'textarea', placeholder: 'Care provided, education...' }
            ]
        }
    };
    return templates[role] || templates['Doctor'];
};
