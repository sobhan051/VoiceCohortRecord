// api.js – thin fetch wrappers around the JSON API.
//
// The backend returns `{ "error": "..." }` with HTTP 200 rather than error
// statuses (see CLAUDE.md), so these helpers just parse and return the JSON;
// callers branch on `result.error`. Network failures still reject and are
// caught by callers.

export async function getFormStructure() {
    const res = await fetch('/get-form-structure');
    return res.json();
}

export async function startSubmission(payload) {
    const res = await fetch('/start-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return res.json();
}

export async function processVoice(formData) {
    const res = await fetch('/process-voice', { method: 'POST', body: formData });
    return res.json();
}

export async function checkSectionAnomalies(payload) {
    const res = await fetch('/check-section-anomalies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return res.json();
}

export async function completeSubmission(payload) {
    const res = await fetch('/complete-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return res.json();
}
