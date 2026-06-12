// config.js – tunable constants and the supported audio-format table.

// Real-time silence auto-stop (while recording).
export const SILENCE_THRESHOLD = 0.01;
export const SILENCE_DURATION_MS = 3500;
export const MIN_RECORDING_MS = 3000;

// Post-recording trim + normalization (see audio.js).
export const TRIM_SILENCE_RMS = 0.015;       // window RMS below this counts as silence
export const TRIM_WINDOW_MS = 20;            // analysis window length
export const TRIM_EDGE_PADDING_MS = 120;     // keep a little audio around speech edges
export const MAX_INTERNAL_SILENCE_MS = 600;  // collapse silent gaps longer than this
export const NORMALIZE_TARGET_PEAK = 0.97;   // peak-normalize to just under full scale
export const NORMALIZE_MAX_GAIN = 12;        // cap so near-silent clips aren't blown up

// Preferred capture formats, in priority order. webm/opus @ 32 kbps is ideal for
// speech and stays tiny; the rest are fallbacks for browsers without opus.
export const AUDIO_FORMATS = [
    { mime: 'audio/webm', label: 'webm', bitrate: 32000, codec: 'opus' },   // 32 kbps – optimal for speech
    { mime: 'audio/mp4',  label: 'm4a',  bitrate: 64000, codec: 'aac' },    // 64 kbps for AAC
    { mime: 'audio/ogg',  label: 'ogg',  bitrate: 64000, codec: 'vorbis' }, // 64 kbps for Vorbis
    { mime: 'audio/wav',  label: 'wav',  bitrate: null,  codec: 'pcm' },    // uncompressed
];
