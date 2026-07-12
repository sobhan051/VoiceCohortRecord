// patient.js – the patient/submission gate: read session from dashboard,
// auto-start a draft submission, and progressively resume any existing answers.

import { state } from './state.js';
import * as api from './api.js';
import { applyAiResults, updateQuestionVisibility, markSectionAnswered, updateProgressPanel } from './render.js';

export function changePatient() {
    // Redirect to dashboard to pick a different user
    window.location.href = '/';
}

export async function autoStartFromSession() {
    const errEl = document.getElementById('pt-error');
    
    // Read user session from localStorage (set by dashboard on login)
    const saved = localStorage.getItem('vcr_user');
    if (!saved) {
        errEl.textContent = 'نشست کاربری یافت نشد. لطفاً ابتدا از داشبورد وارد شوید.';
        errEl.classList.remove('hidden');
        setTimeout(() => { window.location.href = '/'; }, 3000);
        return;
    }

    let userData;
    try {
        userData = JSON.parse(saved);
    } catch {
        errEl.textContent = 'اطلاعات نشست نامعتبر است. لطفاً دوباره وارد شوید.';
        errEl.classList.remove('hidden');
        localStorage.removeItem('vcr_user');
        setTimeout(() => { window.location.href = '/'; }, 3000);
        return;
    }

    // Pre-fill the patient card with user data
    document.getElementById('pt-first').value = userData.first_name || '';
    document.getElementById('pt-last').value = userData.last_name || '';
    document.getElementById('pt-national').value = userData.national_code || '';
    document.getElementById('pt-phone').value = userData.phone_number || '';
    
    // Show the patient card
    document.getElementById('patient-card').classList.remove('hidden');

    // Auto-start submission using the user_id from session
    try {
        const data = await api.startSubmission({ user_id: userData.user_id });
        if (data.error) {
            errEl.textContent = data.error;
            errEl.classList.remove('hidden');
            return;
        }

        state.currentSubmissionId = data.submission_id;
        const name = data.user_name || 'بیمار';

        // Update badge text
        const subtitle = document.getElementById('patient-card-subtitle');
        if (subtitle) {
            subtitle.textContent =
                `بیمار: ${name} — شروع شده در ${new Date().toLocaleDateString('fa-IR')}`;
        }

        // Progressive resume: prefill any sections this patient already answered
        loadExistingProgress(data);
        updateProgressPanel();
    } catch (err) {
        console.error('start-submission failed:', err);
        errEl.textContent = 'ارتباط با سرور با مشکل مواجه شد.';
        errEl.classList.remove('hidden');
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
