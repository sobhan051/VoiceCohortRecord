"""Server-side audio preprocessing with ffmpeg.

Takes the raw recorded clip uploaded by the browser and produces a small,
normalized, silence-trimmed file for the extraction API. This replaces the
old client-side Web Audio post-processing (which only lived in a now-removed
dead JS module).

ffmpeg is a system binary, not a pip dependency. Locate it via FFMPEG_PATH or
PATH. Any failure falls back to the original file so a recording is never lost.
"""
import os
import shutil
import subprocess
import uuid

from app.core import config

# Output format. Flip these two to "wav" / None to switch from opus to wav
# once testing shows which gives better extraction results.
OUT_EXT = "webm"
OUT_CODEC = "libopus"      # None -> wav uses default pcm_s16le
OUT_BITRATE = "32k"
OUT_SR = 16000
OUT_CHANNELS = 1

# Silence handling.
TRIM_THRESHOLD_DB = -40    # windows quieter than this count as silence
MAX_INTERNAL_SILENCE_S = 0.6  # collapse internal silence gaps longer than this

# EBU R128 loudness normalization target (consistent levels -> better ASR).
LOUDNORM = "I=-16:TP=-1.5:LRA=11"


def get_ffmpeg():
    return os.getenv("FFMPEG_PATH") or shutil.which("ffmpeg")


def process_audio_file(src_path):
    """Trim silence + normalize loudness, re-encode to opus/webm.

    Returns the processed file path, or ``src_path`` unchanged on any failure
    (missing ffmpeg, empty output, all-silent clip, etc.).
    """
    ffmpeg = get_ffmpeg()
    if not ffmpeg:
        print("[audio_processor] ffmpeg not found; using original audio")
        return src_path

    out_path = os.path.join(config.UPLOAD_DIR, f"proc_{uuid.uuid4()}.{OUT_EXT}")

    af = (
        f"silenceremove=start_periods=1:start_threshold={TRIM_THRESHOLD_DB}dB"
        f":start_silence=0:detection=peak,"
        f"silenceremove=stop_periods=-1:stop_threshold={TRIM_THRESHOLD_DB}dB"
        f":stop_duration={MAX_INTERNAL_SILENCE_S}:detection=peak,"
        f"loudnorm={LOUDNORM}"
    )

    cmd = [ffmpeg, "-y", "-i", src_path, "-af", af,
           "-ac", str(OUT_CHANNELS), "-ar", str(OUT_SR)]
    if OUT_CODEC:
        cmd += ["-c:a", OUT_CODEC, "-b:a", OUT_BITRATE]
    cmd.append(out_path)

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=120)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as e:
        print(f"[audio_processor] ffmpeg failed ({e}); using original audio")
        try:
            os.remove(out_path)
        except OSError:
            pass
        return src_path

    if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
        print("[audio_processor] ffmpeg produced no output; using original audio")
        try:
            os.remove(out_path)
        except OSError:
            pass
        return src_path

    print(f"[audio_processor] processed {src_path} -> {out_path} "
          f"({(os.path.getsize(out_path) / 1024):.1f} KB)")
    return out_path
