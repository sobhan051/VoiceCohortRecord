// recorder.js – recording lifecycle: mic capture, live silence auto-stop +
// volume meter, the floating stop button, and sending audio to the server.

import { state } from './state.js';
import { SILENCE_THRESHOLD, SILENCE_DURATION_MS, MIN_RECORDING_MS } from './config.js';
import { getBestAudioMimeType, processRecordedAudio } from './audio.js';
import { processVoice, checkSectionAnomalies } from './api.js';
import { applyAiResults, updateQuestionVisibility, markSectionAnswered, resetButtonUI, updateProgressPanel } from './render.js';
import { applyFieldWarnings, updateSectionBadges, updateWarningPanel } from './warnings.js';

// ---------- Floating Stop Button & Volume Meter ----------
export function showFloatingStopButton() {
    document.getElementById('floating-stop-btn').classList.remove('hidden');
    document.getElementById('floating-stop-btn').classList.add('flex');
    document.getElementById('volume-meter-container').classList.remove('hidden');
    document.getElementById('volume-meter-container').classList.add('flex');
}

export function hideFloatingStopButton() {
    document.getElementById('floating-stop-btn').classList.add('hidden');
    document.getElementById('floating-stop-btn').classList.remove('flex');
    document.getElementById('volume-meter-container').classList.add('hidden');
    document.getElementById('volume-meter-container').classList.remove('flex');
}

export function stopRecordingViaFab() {
    if (state.activeRecordingSection) toggleRecording(state.activeRecordingSection);
}

// ---------- Recording ----------
export async function toggleRecording(sectionKey) {
    const btn = document.getElementById(`btn-${sectionKey}`);
    const icon = document.getElementById(`icon-${sectionKey}`);
    const text = document.getElementById(`text-${sectionKey}`);

    if (!state.recordingStates[sectionKey] && !state.currentSubmissionId) {
        // No active session — redirect to dashboard
        alert('لطفاً ابتدا از داشبورد وارد شوید.');
        window.location.href = '/';
        return;
    }

    if (!state.recordingStates[sectionKey]) {
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
                console.log(`🎚️ Setting bitrate: ${audioFormat.bitrate / 1000}kbps`);
            }

            state.mediaRecorder = new MediaRecorder(stream, options);

            // Store the format info for later
            state.mediaRecorder.audioFormat = audioFormat;
            state.audioChunks = [];

            state.mediaRecorder.ondataavailable = e => state.audioChunks.push(e.data);
            state.mediaRecorder.onstop = async () => {
                // Use the correct MIME type for the blob
                const rawBlob = new Blob(state.audioChunks, { type: state.mediaRecorder.audioFormat.mime });
                // Trim silence + normalize loudness, re-encoded to the same small
                // opus codec. Falls back to rawBlob on any failure.
                const audioBlob = await processRecordedAudio(rawBlob, state.mediaRecorder.audioFormat);
                sendAudioToServer(sectionKey, audioBlob, state.mediaRecorder.audioFormat);
            };

            // Start recording with data collection every second
            state.mediaRecorder.start(1000);
            state.recordingStartTime = Date.now();
            state.silenceStartTime = null;
            state.silenceDetectionActive = true;

            // Volume meter setup
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = state.audioContext.createMediaStreamSource(stream);
            state.analyserNode = state.audioContext.createAnalyser();
            state.analyserNode.fftSize = 256;
            source.connect(state.analyserNode);

            const scriptProcessor = state.audioContext.createScriptProcessor(256, 1, 1);
            state.analyserNode.connect(scriptProcessor);
            scriptProcessor.connect(state.audioContext.destination);

            scriptProcessor.onaudioprocess = (event) => {
                if (!state.silenceDetectionActive) return;
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

                if (Date.now() - state.recordingStartTime < MIN_RECORDING_MS) return;

                if (rms < SILENCE_THRESHOLD) {
                    if (state.silenceStartTime === null) {
                        state.silenceStartTime = Date.now();
                    } else if (Date.now() - state.silenceStartTime > SILENCE_DURATION_MS) {
                        scriptProcessor.disconnect();
                        if (state.activeRecordingSection) toggleRecording(state.activeRecordingSection);
                    }
                } else {
                    state.silenceStartTime = null;
                }
            };

            state.recordingStates[sectionKey] = true;
            state.activeRecordingSection = sectionKey;
            showFloatingStopButton();
            document.getElementById('volume-meter-fill').style.height = '0%';

            btn.classList.add('mic-recording');
            text.innerText = "توقف ضبط";
            icon.innerHTML = `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>`;
        } catch (err) {
            console.error("Mic access denied:", err);
            alert("خطا: اجازه دسترسی به میکروفون داده نشده است.");
            state.activeRecordingSection = null;
            hideFloatingStopButton();
        }
    } else {
        state.mediaRecorder.stop();
        state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        if (state.audioContext) {
            state.audioContext.close().catch(console.error);
            state.audioContext = null;
            state.analyserNode = null;
        }
        state.silenceDetectionActive = false;
        state.recordingStates[sectionKey] = false;
        state.activeRecordingSection = null;
        hideFloatingStopButton();

        btn.classList.remove('mic-recording');
        btn.classList.add('bg-blue-100', 'text-blue-600');
        text.innerText = "در حال تحلیل...";
        icon.innerHTML = `<svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    }
}

// ---------- Sending audio to the server ----------
export async function sendAudioToServer(sectionKey, blob, audioFormat) {
    // Hold onto the recording so any failure can be retried without re-recording.
    if (blob) {
        state.lastAudioBySection[sectionKey] = blob;
        state.lastAudioBySection[`${sectionKey}_format`] = audioFormat;
    }

    const audioBlob = blob || state.lastAudioBySection[sectionKey];
    if (!audioBlob) {
        alert("صدای ضبط‌شده‌ای برای ارسال یافت نشد. لطفا دوباره ضبط کنید.");
        return;
    }

    const savedFormat = state.lastAudioBySection[`${sectionKey}_format`] || audioFormat || { label: 'webm', bitrate: 32000 };

    const formData = new FormData();
    // Use appropriate file extension based on format
    const fileExtension = savedFormat.label === 'm4a' ? 'm4a' : savedFormat.label;
    formData.append("audio", audioBlob, `voice.${fileExtension}`);
    formData.append("section_key", sectionKey);
    formData.append("audio_format", savedFormat.label);  // Send format info to server
    formData.append("bitrate", savedFormat.bitrate || '');  // Send bitrate for logging

    if (state.currentSubmissionId) formData.append("submission_id", state.currentSubmissionId);

    // Log the actual file size for debugging
    console.log(`📤 Uploading ${savedFormat.label} (${savedFormat.bitrate ? savedFormat.bitrate / 1000 + 'kbps' : 'uncompressed'}): ${(audioBlob.size / 1024).toFixed(2)} KB`);

    try {
        const result = await processVoice(formData);

        if (result.error) {
            console.error("Server returned error:", result.error);
            offerAudioRetry(sectionKey, `خطا در پردازش صدا: ${result.error}`);
            return;
        }

        if (result.data) {
            // Update session context
            Object.entries(result.data).forEach(([vcode, val]) => {
                if (val !== null && val !== undefined) {
                    state.sessionContext[vcode] = String(val);
                }
            });

            // Track AI confidence per field for the final submit
            if (result.confidence) {
                Object.entries(result.confidence).forEach(([vcode, conf]) => {
                    if (conf !== null && conf !== undefined) {
                        state.sessionConfidence[vcode] = conf;
                    }
                });
            }

            applyAiResults(result.data);

            updateQuestionVisibility();
            markSectionAnswered(sectionKey);
            updateProgressPanel();

            // Clear stored audio on success
            delete state.lastAudioBySection[sectionKey];
            delete state.lastAudioBySection[`${sectionKey}_format`];

            // Anomaly check (non-blocking)
            try {
                const anomalyData = await checkSectionAnomalies({
                    section_key: sectionKey,
                    answers: state.sessionContext,
                    confidence_reasons: result.confidence_reasons || {}
                });
                if (!anomalyData.error && anomalyData.warnings && anomalyData.warnings.length > 0) {
                    anomalyData.warnings.forEach(w => {
                        if (!state.fieldWarnings[w.v_code]) {
                            state.fieldWarnings[w.v_code] = [];
                        }
                        state.fieldWarnings[w.v_code].push({
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
export function offerAudioRetry(sectionKey, message) {
    if (state.lastAudioBySection[sectionKey] &&
        confirm(`${message}\n\nصدای ضبط‌شده حفظ شده است. آیا می‌خواهید دوباره ارسال شود؟`)) {
        // Re-show the analyzing state, then resend the held blob.
        const text = document.getElementById(`text-${sectionKey}`);
        if (text) text.innerText = "در حال تحلیل...";
        sendAudioToServer(sectionKey, null);
    } else {
        alert(message);
    }
}
