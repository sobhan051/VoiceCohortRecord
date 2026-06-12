// patient.js – the patient/submission gate: identify a patient, open a draft
// submission, and progressively resume any answers they already gave.

import { state } from './state.js';
import * as api from './api.js';
import { applyAiResults, updateQuestionVisibility, markSectionAnswered } from './render.js';

export function openPatientModal() {
    document.getElementById('pt-error').classList.add('hidden');
    document.getElementById('patient-modal').classList.remove('hidden');
}

export function changePatient() {
    // Start a fresh questionnaire for a different patient
    window.location.reload();
}

export async function startSubmission() {
    const errEl = document.getElementById('pt-error');
    const btn = document.getElementById('pt-submit');
    const national = document.getElementById('pt-national').value.trim();

    if (!national) {
        errEl.textContent = 'کد ملی الزامی است.';
        errEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'در حال شروع...';
    try {
        const data = await api.startSubmission({
            user: {
                first_name: document.getElementById('pt-first').value.trim(),
                last_name: document.getElementById('pt-last').value.trim(),
                national_code: national,
                phone_number: document.getElementById('pt-phone').value.trim(),
            }
        });
        if (data.error) {
            errEl.textContent = data.error;
            errEl.classList.remove('hidden');
            return;
        }

        state.currentSubmissionId = data.submission_id;
        document.getElementById('patient-modal').classList.add('hidden');
        const bar = document.getElementById('patient-bar');
        bar.classList.remove('hidden');
        const name = data.user_name || 'بیمار';
        document.getElementById('patient-bar-name').textContent =
            `${name} — کد ملی ${data.national_code}`;

        // Progressive resume: prefill any sections this patient already answered
        // and mark them done, so they only need to complete the rest.
        loadExistingProgress(data);
    } catch (err) {
        console.error('start-submission failed:', err);
        errEl.textContent = 'ارتباط با سرور با مشکل مواجه شد.';
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'شروع';
    }
}

// ---------- Progressive resume ----------
// Prefill answers saved on a previous visit and mark answered sections "done".
export function loadExistingProgress(data) {
    const answers = data.answers || {};
    const confidence = data.confidence || {};
    const answeredSections = data.answered_sections || [];

    // Seed client state so the final submit includes prior answers untouched.
    Object.entries(answers).forEach(([vcode, val]) => {
        if (val !== null && val !== undefined) state.sessionContext[vcode] = String(val);
    });
    Object.entries(confidence).forEach(([vcode, conf]) => {
        if (conf !== null && conf !== undefined) state.sessionConfidence[vcode] = conf;
    });

    // Reuse the AI-fill routine to populate the inputs from saved answers.
    if (Object.keys(answers).length > 0) {
        applyAiResults(answers);
        updateQuestionVisibility();
    }

    answeredSections.forEach(markSectionAnswered);

    if (answeredSections.length > 0) {
        document.getElementById('status-badge').textContent =
            `ادامه پرسشنامه (${answeredSections.length} بخش تکمیل‌شده)`;
    }
}
