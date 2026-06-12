// audio.js – capture-format selection and post-recording silence trim +
// loudness normalization. This is all browser-only (Web Audio API).

import {
    AUDIO_FORMATS,
    TRIM_SILENCE_RMS,
    TRIM_WINDOW_MS,
    TRIM_EDGE_PADDING_MS,
    MAX_INTERNAL_SILENCE_MS,
    NORMALIZE_TARGET_PEAK,
    NORMALIZE_MAX_GAIN,
} from './config.js';

// Pick the first capture format this browser actually supports.
export function getBestAudioMimeType() {
    for (const mt of AUDIO_FORMATS) {
        if (MediaRecorder.isTypeSupported(mt.mime)) {
            console.log(`✅ Using format: ${mt.mime} (${mt.codec} @ ${mt.bitrate ? mt.bitrate / 1000 + 'kbps' : 'uncompressed'})`);
            return mt;
        }
    }
    console.warn('No preferred format supported, using browser default');
    return { mime: '', label: 'default', bitrate: null, codec: 'unknown' };
}

// ---------- Audio post-processing: silence trim + normalization ----------
// The recorder already produces a small webm/opus clip. Before sending we
// decode it to raw PCM, trim leading/trailing (and collapse long internal)
// silence, peak-normalize the loudness, then re-encode with the SAME opus
// codec so the upload stays small. Any failure falls back to the original
// blob — a recording is never lost.

export async function processRecordedAudio(blob, audioFormat) {
    try {
        if (!blob || !blob.size) return blob;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx || typeof MediaRecorder === 'undefined') return blob;

        const arrayBuf = await blob.arrayBuffer();
        const decodeCtx = new Ctx();
        const audioBuffer = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
        decodeCtx.close().catch(() => {});

        const mono = trimAndNormalizeBuffer(audioBuffer);
        if (!mono || mono.data.length === 0) return blob;  // all-silent → keep original

        const reBlob = await encodeBufferToBlob(mono, audioFormat);
        if (reBlob && reBlob.size > 0) {
            console.log(`🎛️ Trim+normalize: ${(blob.size / 1024).toFixed(1)}KB → ${(reBlob.size / 1024).toFixed(1)}KB`);
            // Use whichever is smaller; re-encode overhead can occasionally win on tiny clips.
            return reBlob.size <= blob.size ? reBlob : blob;
        }
        return blob;
    } catch (err) {
        console.warn('Audio post-processing failed, sending original clip:', err);
        return blob;
    }
}

// Returns { data: Float32Array (mono), sampleRate } or null if entirely silent.
export function trimAndNormalizeBuffer(audioBuffer) {
    const sr = audioBuffer.sampleRate;
    const len = audioBuffer.length;
    const chCount = audioBuffer.numberOfChannels;

    // Downmix to mono.
    const monoSrc = new Float32Array(len);
    for (let c = 0; c < chCount; c++) {
        const data = audioBuffer.getChannelData(c);
        for (let i = 0; i < len; i++) monoSrc[i] += data[i] / chCount;
    }

    // Classify each window as voiced/silent by RMS.
    const win = Math.max(1, Math.floor(sr * TRIM_WINDOW_MS / 1000));
    const winCount = Math.ceil(len / win);
    const voiced = new Uint8Array(winCount);
    for (let w = 0; w < winCount; w++) {
        const start = w * win;
        const end = Math.min(start + win, len);
        let sum = 0;
        for (let i = start; i < end; i++) sum += monoSrc[i] * monoSrc[i];
        if (Math.sqrt(sum / (end - start)) >= TRIM_SILENCE_RMS) voiced[w] = 1;
    }

    const firstW = voiced.indexOf(1);
    const lastW = voiced.lastIndexOf(1);
    if (firstW === -1) return null;  // no speech detected at all

    // Keep a small pad of windows around the speech edges.
    const padWins = Math.ceil(TRIM_EDGE_PADDING_MS / TRIM_WINDOW_MS);
    const keepStart = Math.max(0, firstW - padWins);
    const keepEnd = Math.min(winCount - 1, lastW + padWins);

    const keep = new Uint8Array(winCount);
    for (let i = keepStart; i <= keepEnd; i++) keep[i] = 1;

    // Collapse long internal silent runs down to MAX_INTERNAL_SILENCE_MS
    // (half kept at each edge so word boundaries stay natural).
    const maxGapWins = Math.max(1, Math.ceil(MAX_INTERNAL_SILENCE_MS / TRIM_WINDOW_MS));
    let i = firstW;
    while (i <= lastW) {
        if (voiced[i]) { i++; continue; }
        const runS = i;
        while (i <= lastW && !voiced[i]) i++;
        const runE = i;  // exclusive
        if (runE - runS > maxGapWins) {
            const half = Math.floor(maxGapWins / 2);
            for (let k = runS + half; k < runE - half; k++) keep[k] = 0;
        }
    }

    // Assemble the kept samples and find the peak in one pass.
    let keptCount = 0;
    for (let w = keepStart; w <= keepEnd; w++) {
        if (keep[w]) keptCount += Math.min((w + 1) * win, len) - w * win;
    }
    const out = new Float32Array(keptCount);
    let pos = 0;
    let peak = 0;
    for (let w = keepStart; w <= keepEnd; w++) {
        if (!keep[w]) continue;
        const s = w * win, e = Math.min(s + win, len);
        for (let j = s; j < e; j++) {
            const v = monoSrc[j];
            out[pos++] = v;
            const a = v < 0 ? -v : v;
            if (a > peak) peak = a;
        }
    }

    // Peak-normalize, capped so a quiet/noisy clip isn't amplified to garbage.
    if (peak > 0) {
        const gain = Math.min(NORMALIZE_TARGET_PEAK / peak, NORMALIZE_MAX_GAIN);
        if (Math.abs(gain - 1) > 0.001) {
            for (let j = 0; j < out.length; j++) {
                let v = out[j] * gain;
                if (v > 1) v = 1; else if (v < -1) v = -1;
                out[j] = v;
            }
        }
    }

    return { data: out, sampleRate: sr };
}

// Re-encode a mono PCM buffer to the original opus codec via a real-time
// MediaRecorder on a MediaStreamDestination. Resolves to a Blob, or null.
export function encodeBufferToBlob(mono, audioFormat) {
    return new Promise((resolve) => {
        let ctx;
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            ctx = new Ctx();
            const buffer = ctx.createBuffer(1, mono.data.length, mono.sampleRate);
            if (buffer.copyToChannel) buffer.copyToChannel(mono.data, 0);
            else buffer.getChannelData(0).set(mono.data);

            const dest = ctx.createMediaStreamDestination();
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(dest);

            const options = {};
            if (audioFormat && audioFormat.mime && MediaRecorder.isTypeSupported(audioFormat.mime)) {
                options.mimeType = audioFormat.mime;
            }
            if (audioFormat && audioFormat.bitrate) options.audioBitsPerSecond = audioFormat.bitrate;

            const rec = new MediaRecorder(dest.stream, options);
            const chunks = [];
            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                ctx.close().catch(() => {});
                resolve(result);
            };

            rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
            rec.onstop = () => {
                const type = (audioFormat && audioFormat.mime) || 'audio/webm';
                finish(chunks.length ? new Blob(chunks, { type }) : null);
            };
            rec.onerror = () => finish(null);

            src.onended = () => setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 120);

            const startEncode = () => { rec.start(); src.start(); };
            const resumed = ctx.resume ? ctx.resume() : null;
            if (resumed && typeof resumed.then === 'function') resumed.then(startEncode, startEncode);
            else startEncode();

            // Safety net if onended never fires.
            const durMs = (mono.data.length / mono.sampleRate) * 1000;
            setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, durMs + 1500);
        } catch (err) {
            console.warn('Re-encode failed:', err);
            if (ctx) ctx.close().catch(() => {});
            resolve(null);
        }
    });
}
