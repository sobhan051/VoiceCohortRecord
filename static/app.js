// app.js – Full client‑side logic with non‑blocking anomaly warnings

let mediaRecorder;
let audioChunks = [];
let recordingStates = {};
let activeRecordingSection = null;
let audioContext = null;
let analyserNode = null;
let silenceDetectionActive = false;

const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 3500;
const MIN_RECORDING_MS = 3000;
let silenceStartTime = null;
let recordingStartTime = null;

let sessionContext = {};           // { v_code: value }
let sessionConfidence = {};        // { v_code: 0..1 } – AI confidence per field
let sectionMetaMap = {};          // { section_key: { depends_on_vcode, depends_on_value } }
let fieldWarnings = {};           // { v_code: [ { message, severity } ] }
let currentSubmissionId = null;   // set once a patient/submission is started
let lastAudioBySection = {};      // { section_key: Blob } – kept so a failed send can be retried without re-recording

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/get-form-structure');
        const sections = await res.json();
        renderForm(sections);
        updateQuestionVisibility();
    } catch (err) {
        console.error("Failed to load form structure:", err);
        document.getElementById('form-container').innerHTML =
            `<div class="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">خطا در دریافت اطلاعات از سرور. لطفا اتصال دیتابیس را بررسی کنید.</div>`;
    }
    // Require a patient before any recording can happen
    openPatientModal();
});

// Add this helper function at the top
function getBestAudioMimeType() {
    // Priority order with bitrate recommendations
    const mimeTypes = [
        { 
            mime: 'audio/webm', 
            label: 'webm',
            bitrate: 32000,  // 32 kbps - optimal for speech
            codec: 'opus'
        },
        { 
            mime: 'audio/mp4', 
            label: 'm4a',
            bitrate: 64000,  // 64 kbps for AAC
            codec: 'aac'
        },
        { 
            mime: 'audio/ogg', 
            label: 'ogg',
            bitrate: 64000,  // 64 kbps for Vorbis
            codec: 'vorbis'
        },
        { 
            mime: 'audio/wav', 
            label: 'wav',
            bitrate: null,   // Uncompressed
            codec: 'pcm'
        }
    ];
    
    for (const mt of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mt.mime)) {
            console.log(`✅ Using format: ${mt.mime} (${mt.codec} @ ${mt.bitrate ? mt.bitrate/1000 + 'kbps' : 'uncompressed'})`);
            return mt;
        }
    }
    
    // Fallback to browser default
    console.warn('No preferred format supported, using browser default');
    return { mime: '', label: 'default', bitrate: null, codec: 'unknown' };
}


// ---------- Patient / Submission gate ----------
function openPatientModal() {
    document.getElementById('pt-error').classList.add('hidden');
    document.getElementById('patient-modal').classList.remove('hidden');
}

function changePatient() {
    // Start a fresh questionnaire for a different patient
    window.location.reload();
}

async function startSubmission() {
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
        const res = await fetch('/start-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user: {
                    first_name: document.getElementById('pt-first').value.trim(),
                    last_name: document.getElementById('pt-last').value.trim(),
                    national_code: national,
                    phone_number: document.getElementById('pt-phone').value.trim(),
                }
            })
        });
        const data = await res.json();
        if (data.error) {
            errEl.textContent = data.error;
            errEl.classList.remove('hidden');
            return;
        }

        currentSubmissionId = data.submission_id;
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
function loadExistingProgress(data) {
    const answers = data.answers || {};
    const confidence = data.confidence || {};
    const answeredSections = data.answered_sections || [];

    // Seed client state so the final submit includes prior answers untouched.
    Object.entries(answers).forEach(([vcode, val]) => {
        if (val !== null && val !== undefined) sessionContext[vcode] = String(val);
    });
    Object.entries(confidence).forEach(([vcode, conf]) => {
        if (conf !== null && conf !== undefined) sessionConfidence[vcode] = conf;
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

// Visually flag a section the patient already completed. The mic stays enabled
// so they can re-record to correct an answer.
function markSectionAnswered(sectionKey) {
    const sectionEl = document.getElementById(`sect-${sectionKey}`);
    if (!sectionEl) return;
    sectionEl.classList.add('section-answered');

    const badge = document.getElementById(`badge-${sectionKey}`);
    if (badge && !badge.classList.contains('active')) {
        badge.textContent = '✓ تکمیل شد';
        badge.classList.add('section-done-badge');
    }
}

// ---------- Floating Stop Button & Volume Meter ----------
function showFloatingStopButton() {
    document.getElementById('floating-stop-btn').classList.remove('hidden');
    document.getElementById('floating-stop-btn').classList.add('flex');
    document.getElementById('volume-meter-container').classList.remove('hidden');
    document.getElementById('volume-meter-container').classList.add('flex');
}

function hideFloatingStopButton() {
    document.getElementById('floating-stop-btn').classList.add('hidden');
    document.getElementById('floating-stop-btn').classList.remove('flex');
    document.getElementById('volume-meter-container').classList.add('hidden');
    document.getElementById('volume-meter-container').classList.remove('flex');
}

function stopRecordingViaFab() {
    if (activeRecordingSection) toggleRecording(activeRecordingSection);
}

// ---------- Section‑Level Visibility (DB rules) ----------
function updateQuestionVisibility() {
    document.querySelectorAll('section[id^="sect-"]').forEach(sectionEl => {
        const sectionKey = sectionEl.id.replace('sect-', '');
        const meta = sectionMetaMap[sectionKey];
        let sectionShouldShow = true;

        if (meta && meta.depends_on_vcode) {
            const parentValue = sessionContext[meta.depends_on_vcode];
            if (parentValue === undefined || parentValue === null || parentValue === '') {
                sectionShouldShow = false;
            } else if (parentValue != meta.depends_on_value) {
                sectionShouldShow = false;
            }
        }

        sectionEl.style.display = sectionShouldShow ? '' : 'none';
        sectionEl.style.opacity = sectionShouldShow ? '1' : '0';
    });
}

// ---------- Rendering ----------
function renderForm(sections) {
    const container = document.getElementById('form-container');
    container.innerHTML = '';

    sections.forEach(section => {
        sectionMetaMap[section.section_key] = {
            depends_on_vcode: section.depends_on_vcode || null,
            depends_on_value: section.depends_on_value || null
        };

        const sectHtml = `
            <section class="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100"
                     id="sect-${section.section_key}">
                <div class="flex justify-between items-center mb-6 pb-4 border-b border-gray-50">
                    <h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">
                        ${section.name_fa}
                        <span id="badge-${section.section_key}" class="section-warning-badge"></span>
                    </h2>
                    <button onclick="toggleRecording('${section.section_key}')"
                            id="btn-${section.section_key}"
                            class="flex items-center gap-2 px-5 py-2.5 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-all group">
                        <span id="icon-${section.section_key}">
                            <svg class="w-6 h-6 text-gray-500 group-hover:text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                            </svg>
                        </span>
                        <span id="text-${section.section_key}" class="text-sm font-bold">ثبت با صدا</span>
                    </button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    ${section.questions.map(q => renderQuestion(q)).join('')}
                </div>
            </section>
        `;
        container.insertAdjacentHTML('beforeend', sectHtml);
    });
}

function renderQuestion(q) {
    if (q.response_type === 'MultiSelect') {
        let options = q.coding_options;
        if (typeof options === 'string') {
            try { options = JSON.parse(options); } catch (e) { options = {}; }
        }
        return `
            <div class="md:col-span-2 space-y-3">
                <label class="block text-gray-700 font-bold">${q.question_text_fa}</label>
                <div class="flex flex-wrap gap-4">
                    ${Object.entries(options || {}).map(([key, val]) => `
                        <label class="flex items-center gap-3 border-2 border-gray-100 px-4 py-3 rounded-2xl cursor-pointer hover:border-blue-200 hover:bg-blue-50 transition-all">
                            <input type="checkbox" name="${q.v_code}[]" value="${key}" data-vcode="${q.v_code}" class="w-5 h-5 cursor-pointer">
                            <span class="text-base">${val}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }
    if (q.response_type === 'Categorical' || q.response_type === 'Dichotomous') {
        let options = q.coding_options;
        if (typeof options === 'string') {
            try { options = JSON.parse(options); } catch (e) { options = {}; }
        }
        return `
            <div class="md:col-span-2 space-y-3">
                <label class="block text-gray-700 font-bold">${q.question_text_fa}</label>
                <div class="flex flex-wrap gap-4">
                    ${Object.entries(options || {}).map(([key, val]) => `
                        <label class="flex items-center gap-3 border-2 border-gray-100 px-4 py-3 rounded-2xl cursor-pointer hover:border-blue-200 hover:bg-blue-50 transition-all">
                            <input type="radio" name="${q.v_code}" value="${key}" data-vcode="${q.v_code}" class="w-5 h-5 cursor-pointer">
                            <span class="text-base">${val}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }
    return `
        <div class="flex flex-col gap-2 relative">
            <label class="text-gray-600 text-sm font-medium">${q.question_text_fa}</label>
            <div class="relative">
                <input type="text" data-vcode="${q.v_code}"
                       class="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                       placeholder="${q.unit ? 'واحد: ' + q.unit : '---'}">
            </div>
        </div>
    `;
}

// Modified toggleRecording function with bitrate control
async function toggleRecording(sectionKey) {
    const btn = document.getElementById(`btn-${sectionKey}`);
    const icon = document.getElementById(`icon-${sectionKey}`);
    const text = document.getElementById(`text-${sectionKey}`);

    if (!recordingStates[sectionKey] && !currentSubmissionId) {
        openPatientModal();
        return;
    }

    if (!recordingStates[sectionKey]) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Get best supported format for this browser
            const audioFormat = getBestAudioMimeType();
            
            // Create MediaRecorder with optimal settings
            const options = {
                mimeType: audioFormat.mime
            };
            
            // Add bitrate for formats that support it
            if (audioFormat.bitrate) {
                options.audioBitsPerSecond = audioFormat.bitrate;
                console.log(`🎚️ Setting bitrate: ${audioFormat.bitrate/1000}kbps`);
            }
            
            mediaRecorder = new MediaRecorder(stream, options);
            
            // Store the format info for later
            mediaRecorder.audioFormat = audioFormat;
            audioChunks = [];

            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                // Use the correct MIME type for the blob
                const audioBlob = new Blob(audioChunks, { type: mediaRecorder.audioFormat.mime });
                sendAudioToServer(sectionKey, audioBlob, mediaRecorder.audioFormat);
            };

            // Start recording with data collection every second
            mediaRecorder.start(1000);
            recordingStartTime = Date.now();
            silenceStartTime = null;
            silenceDetectionActive = true;

            // Volume meter setup (unchanged from your original)
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            analyserNode = audioContext.createAnalyser();
            analyserNode.fftSize = 256;
            source.connect(analyserNode);

            const scriptProcessor = audioContext.createScriptProcessor(256, 1, 1);
            analyserNode.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination);

            scriptProcessor.onaudioprocess = (event) => {
                if (!silenceDetectionActive) return;
                const input = event.inputBuffer.getChannelData(0);
                let sum = 0;
                for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
                const rms = Math.sqrt(sum / input.length);

                const meterFill = document.getElementById('volume-meter-fill');
                if (meterFill) {
                    const displayPercent = Math.min((rms / 0.2) * 100, 100);
                    meterFill.style.height = displayPercent + '%';
                    if (rms < 0.005) meterFill.style.backgroundColor = '#ef4444';
                    else if (rms > 0.25) meterFill.style.backgroundColor = '#f97316';
                    else if (rms > 0.15) meterFill.style.backgroundColor = '#eab308';
                    else meterFill.style.backgroundColor = '#22c55e';
                }

                if (Date.now() - recordingStartTime < MIN_RECORDING_MS) return;

                if (rms < SILENCE_THRESHOLD) {
                    if (silenceStartTime === null) {
                        silenceStartTime = Date.now();
                    } else if (Date.now() - silenceStartTime > SILENCE_DURATION_MS) {
                        scriptProcessor.disconnect();
                        if (activeRecordingSection) toggleRecording(activeRecordingSection);
                    }
                } else {
                    silenceStartTime = null;
                }
            };

            recordingStates[sectionKey] = true;
            activeRecordingSection = sectionKey;
            showFloatingStopButton();
            document.getElementById('volume-meter-fill').style.height = '0%';

            btn.classList.add('mic-recording');
            text.innerText = "توقف ضبط";
            icon.innerHTML = `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>`;
        } catch (err) {
            console.error("Mic access denied:", err);
            alert("خطا: اجازه دسترسی به میکروفون داده نشده است.");
            activeRecordingSection = null;
            hideFloatingStopButton();
        }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        if (audioContext) {
            audioContext.close().catch(console.error);
            audioContext = null;
            analyserNode = null;
        }
        silenceDetectionActive = false;
        recordingStates[sectionKey] = false;
        activeRecordingSection = null;
        hideFloatingStopButton();

        btn.classList.remove('mic-recording');
        btn.classList.add('bg-blue-100', 'text-blue-600');
        text.innerText = "در حال تحلیل...";
        icon.innerHTML = `<svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    }
}

// Modified sendAudioToServer to handle format info
async function sendAudioToServer(sectionKey, blob, audioFormat) {
    // Hold onto the recording so any failure can be retried without re-recording.
    if (blob) {
        lastAudioBySection[sectionKey] = blob;
        lastAudioBySection[`${sectionKey}_format`] = audioFormat;
    }
    
    const audioBlob = blob || lastAudioBySection[sectionKey];
    if (!audioBlob) {
        alert("صدای ضبط‌شده‌ای برای ارسال یافت نشد. لطفا دوباره ضبط کنید.");
        return;
    }

    const savedFormat = lastAudioBySection[`${sectionKey}_format`] || audioFormat || { label: 'webm', bitrate: 32000 };
    
    const formData = new FormData();
    // Use appropriate file extension based on format
    const fileExtension = savedFormat.label === 'm4a' ? 'm4a' : savedFormat.label;
    formData.append("audio", audioBlob, `voice.${fileExtension}`);
    formData.append("section_key", sectionKey);
    formData.append("audio_format", savedFormat.label);  // Send format info to server
    formData.append("bitrate", savedFormat.bitrate || '');  // Send bitrate for logging
    
    if (currentSubmissionId) formData.append("submission_id", currentSubmissionId);

    // Log the actual file size for debugging
    console.log(`📤 Uploading ${savedFormat.label} (${savedFormat.bitrate ? savedFormat.bitrate/1000 + 'kbps' : 'uncompressed'}): ${(audioBlob.size/1024).toFixed(2)} KB`);

    try {
        const response = await fetch("/process-voice", { method: "POST", body: formData });
        const result = await response.json();

        if (result.error) {
            console.error("Server returned error:", result.error);
            offerAudioRetry(sectionKey, `خطا در پردازش صدا: ${result.error}`);
            return;
        }

        if (result.data) {
            // Update session context
            Object.entries(result.data).forEach(([vcode, val]) => {
                if (val !== null && val !== undefined) {
                    sessionContext[vcode] = String(val);
                }
            });

            // Track AI confidence per field for the final submit
            if (result.confidence) {
                Object.entries(result.confidence).forEach(([vcode, conf]) => {
                    if (conf !== null && conf !== undefined) {
                        sessionConfidence[vcode] = conf;
                    }
                });
            }

            applyAiResults(result.data);

            updateQuestionVisibility();
            markSectionAnswered(sectionKey);
            
            // Clear stored audio on success
            delete lastAudioBySection[sectionKey];
            delete lastAudioBySection[`${sectionKey}_format`];

            // Anomaly check (non‑blocking)
            try {
                const anomalyResp = await fetch("/check-section-anomalies", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        section_key: sectionKey,
                        answers: sessionContext,
                        confidence_reasons: result.confidence_reasons || {}  
                    })
                });
                const anomalyData = await anomalyResp.json();
                if (!anomalyData.error && anomalyData.warnings && anomalyData.warnings.length > 0) {
                    anomalyData.warnings.forEach(w => {
                        if (!fieldWarnings[w.v_code]) {
                            fieldWarnings[w.v_code] = [];
                        }
                        fieldWarnings[w.v_code].push({
                            message: w.message,
                            severity: w.severity || 'warning'
                        });
                    });
                    applyFieldWarnings();
                    updateSectionBadges();
                    updateWarningPanel();
                }
            } catch (anomalyErr) {
                console.error("Section anomaly check failed:", anomalyErr);
            }
        }
    } catch (err) {
        console.error("Fetch error:", err);
        offerAudioRetry(sectionKey, "ارتباط با سرور با مشکل مواجه شد.");
    } finally {
        resetButtonUI(sectionKey);
    }
}

// On a failed send the recording is still in memory; let the user retry it with
// one click instead of re-recording the whole section.
function offerAudioRetry(sectionKey, message) {
    if (lastAudioBySection[sectionKey] &&
        confirm(`${message}\n\nصدای ضبط‌شده حفظ شده است. آیا می‌خواهید دوباره ارسال شود؟`)) {
        // Re-show the analyzing state, then resend the held blob.
        const text = document.getElementById(`text-${sectionKey}`);
        if (text) text.innerText = "در حال تحلیل...";
        sendAudioToServer(sectionKey, null);
    } else {
        alert(message);
    }
}

// ---------- Warning UI functions ----------
function applyFieldWarnings() {
    // Remove old warning styles from all inputs and their parent labels
    document.querySelectorAll('.field-warning, .field-critical').forEach(el => {
        el.classList.remove('field-warning', 'field-critical');
    });

    Object.entries(fieldWarnings).forEach(([vcode, warnings]) => {
        if (warnings.length === 0 || vcode === 'general') return;

        const input = document.querySelector(`[data-vcode="${vcode}"]`);
        if (!input) return;

        const hasCritical = warnings.some(w => w.severity === 'critical');
        const className = hasCritical ? 'field-critical' : 'field-warning';

        if (input.type === 'radio' || input.type === 'checkbox') {
            // Style the visible label card
            const label = input.closest('label');
            if (label) {
                label.classList.add(className);
            }
        } else {
            // Text / numeric – style the input itself
            input.classList.add(className);
        }
    });
}

function updateSectionBadges() {
    document.querySelectorAll('section[id^="sect-"]').forEach(sectionEl => {
        const sectionKey = sectionEl.id.replace('sect-', '');
        let count = 0;

        // Get all unique v_codes in this section that have warnings
        const warnedVcodes = new Set();
        sectionEl.querySelectorAll('[data-vcode]').forEach(input => {
            const vcode = input.dataset.vcode;
            if (vcode !== 'general' && fieldWarnings[vcode] && fieldWarnings[vcode].length > 0) {
                warnedVcodes.add(vcode);
            }
        });
        count = warnedVcodes.size;   // one count per field, regardless of warning count

        const badge = document.getElementById(`badge-${sectionKey}`);
        if (badge) {
            badge.textContent = count > 0 ? count : '';
            badge.classList.toggle('active', count > 0);
        }
    });
}

function updateWarningPanel() {
    const totalWarnings = Object.values(fieldWarnings).reduce((sum, arr) => sum + arr.length, 0);
    const toggleBtn = document.getElementById('warning-toggle-btn');
    const countSpan = document.getElementById('warning-count');
    const listEl = document.getElementById('warning-list');

    if (totalWarnings > 0) {
        toggleBtn.style.display = 'flex';
        countSpan.textContent = totalWarnings;
        // Build warning list
        listEl.innerHTML = '';
        Object.entries(fieldWarnings).forEach(([vcode, warnings]) => {
            warnings.forEach(w => {
                listEl.innerHTML += `<div class="warning-item"><span class="vcode">${vcode}</span>: ${w.message}</div>`;
            });
        });
    } else {
        toggleBtn.style.display = 'none';
        listEl.innerHTML = '';
        listEl.classList.remove('active');
    }
}

function toggleWarningPanel() {
    const list = document.getElementById('warning-list');
    list.classList.toggle('active');
}

// ---------- Apply AI results (unchanged) ----------
function applyAiResults(data) {
    Object.keys(data).forEach(vCode => {
        const val = data[vCode];
        if (val === null || val === undefined) return;

        if (typeof val === 'string' && val.includes(',')) {
            const codes = val.split(',').map(c => c.trim());
            codes.forEach(code => {
                const checkboxes = document.querySelectorAll(
                    `input[type="checkbox"][data-vcode="${vCode}"][value="${code}"]`
                );
                checkboxes.forEach(cb => {
                    cb.checked = true;
                    cb.closest('label').classList.add('ai-updated');
                });
                setTimeout(() => {
                    checkboxes.forEach(cb => cb.closest('label').classList.remove('ai-updated'));
                }, 3000);
            });
        } else {
            const inputs = document.querySelectorAll(`[data-vcode="${vCode}"]`);
            inputs.forEach(input => {
                if (input.type === 'radio') {
                    if (input.value == val) {
                        input.checked = true;
                        input.closest('label').classList.add('ai-updated');
                    }
                } else {
                    input.value = val;
                    input.classList.add('ai-updated');
                }
                setTimeout(() => {
                    input.classList.remove('ai-updated');
                    if (input.closest('label')) input.closest('label').classList.remove('ai-updated');
                }, 3000);
            });
        }
    });
}

function resetButtonUI(sectionKey) {
    const btn = document.getElementById(`btn-${sectionKey}`);
    const icon = document.getElementById(`icon-${sectionKey}`);
    const text = document.getElementById(`text-${sectionKey}`);

    btn.className = "flex items-center gap-2 px-5 py-2.5 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-all group";
    text.innerText = "ثبت با صدا";
    icon.innerHTML = `<svg class="w-6 h-6 text-gray-500 group-hover:text-blue-600" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
    </svg>`;
}

// ---------- Manual Input Listener (clears field warnings on change) ----------
document.addEventListener('change', function(event) {
    const input = event.target;
    if (!input.dataset.vcode) return;

    const vcode = input.dataset.vcode;
    let value;
    if (input.type === 'checkbox') {
        const checkboxes = document.querySelectorAll(`input[type="checkbox"][data-vcode="${vcode}"]:checked`);
        value = Array.from(checkboxes).map(cb => cb.value).join(',');
    } else if (input.type === 'radio') {
        if (input.checked) value = input.value;
        else return;
    } else {
        value = input.value;
    }

    sessionContext[vcode] = value;
    // Remove warnings for this field when user manually edits
    delete fieldWarnings[vcode];
    applyFieldWarnings();
    updateSectionBadges();
    updateWarningPanel();

    updateQuestionVisibility();
});

async function submitFinalForm() {
    if (!currentSubmissionId) {
        openPatientModal();
        return;
    }

    // Warn (but don't block) if anomalies are still open
    const openWarnings = Object.values(fieldWarnings).reduce((s, a) => s + a.length, 0);
    if (openWarnings > 0 &&
        !confirm(`${openWarnings} هشدار بررسی‌نشده وجود دارد. آیا مطمئن هستید که می‌خواهید ثبت نهایی کنید؟`)) {
        return;
    }

    try {
        const res = await fetch('/complete-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                submission_id: currentSubmissionId,
                answers: sessionContext,
                confidence: sessionConfidence,
            })
        });
        const data = await res.json();
        if (data.error) {
            alert(`خطا در ثبت نهایی: ${data.error}`);
            return;
        }
        alert(`اطلاعات با موفقیت ثبت شد. (${data.saved} پاسخ ذخیره شد)`);
        // Lock further edits for this patient; require an explicit new start
        currentSubmissionId = null;
        document.getElementById('status-badge').textContent = 'ثبت شد';
    } catch (err) {
        console.error('complete-submission failed:', err);
        alert('ارتباط با سرور با مشکل مواجه شد.');
    }
}