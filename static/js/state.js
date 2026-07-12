// state.js – shared mutable client state.
//
// One object so any module can both read and reassign fields (ES modules don't
// allow reassigning an imported binding, but mutating an object's property is
// fine). All former top-level globals from app.js live here.
export const state = {
    // --- recording ---
    mediaRecorder: null,
    audioChunks: [],
    recordingStates: {},          // { section_key: bool }
    activeRecordingSection: null,
    audioContext: null,
    analyserNode: null,
    silenceDetectionActive: false,
    silenceStartTime: null,
    recordingStartTime: null,

    // --- questionnaire session ---
    sessionContext: {},           // { v_code: value }
    sessionConfidence: {},        // { v_code: 0..1 } – AI confidence per field
    sectionMetaMap: {},           // { section_key: { depends_on_vcode, depends_on_value } }
    fieldWarnings: {},            // { v_code: [ { message, severity } ] }
    currentSubmissionId: null,    // set once a patient/submission is started
    lastAudioBySection: {},       // { section_key: Blob } – kept so a failed send can be retried
    sectionProgressData: {},      // { section_key: { name_fa, total, answered } } – progress panel data
};
