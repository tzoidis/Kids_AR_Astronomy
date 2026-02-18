/* ===== speech.js — Audio Narration with TTS Fallback ===== */
/* Priority: MP3 file from assets/audio/ → Web Speech API (el-GR)
   Call playNarration() for constellation speech.
   Call speak() for one-off strings (still TTS only). */

const GreekTTS = (() => {
  let greekVoice = null;
  let ready = false;
  let unlocked = false;       // iOS requires user gesture before TTS
  let currentAudio = null;    // Currently playing Audio element

  /* Try to play an MP3 at the given path.
     Resolves true if the file played to completion, false if missing or errored. */
  function tryAudio(src) {
    return new Promise(resolve => {
      const audio = new Audio(src);
      currentAudio = audio;

      let resolved = false;
      const done = (ok) => {
        if (!resolved) { resolved = true; resolve(ok); }
      };

      audio.onerror = () => done(false);   // File missing, network error, decode error
      audio.onended = () => done(true);    // Played successfully to the end

      // play() returns a Promise on modern browsers — catch autoplay blocks or load errors
      audio.play().catch(() => done(false));
    });
  }

  /* ── TTS internals ─────────────────────────────────────────────────────── */

  function findGreekVoice() {
    const voices = speechSynthesis.getVoices();
    // Prefer el-GR, fall back to el, then any voice with 'greek' in name
    greekVoice =
      voices.find(v => v.lang === 'el-GR') ||
      voices.find(v => v.lang === 'el') ||
      voices.find(v => v.lang.startsWith('el')) ||
      voices.find(v => v.name.toLowerCase().includes('greek')) ||
      null;
    ready = true;
  }

  function init() {
    if (speechSynthesis.getVoices().length > 0) {
      findGreekVoice();
    }
    speechSynthesis.addEventListener('voiceschanged', findGreekVoice);
  }

  /* iOS unlock: must call speechSynthesis.speak from a user gesture.
     Call this from the welcome screen's Start button handler. */
  function unlock() {
    if (unlocked) return;
    const utt = new SpeechSynthesisUtterance('');
    utt.volume = 0;
    utt.lang = 'el-GR';
    speechSynthesis.speak(utt);
    unlocked = true;
  }

  /* Internal TTS: speaks a Greek string. Returns a Promise. */
  function speakTTS(text) {
    return new Promise((resolve, reject) => {
      if (!text) { resolve(); return; }

      speechSynthesis.cancel();

      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = greekVoice ? greekVoice.lang : 'el-GR';
      if (greekVoice) utt.voice = greekVoice;
      utt.rate = 0.85;   // Slightly slower for kids
      utt.pitch = 1.1;   // Slightly higher, friendlier
      utt.volume = 1.0;

      utt.onerror = (e) => {
        // 'interrupted' / 'canceled' are normal when we call stop() mid-speech
        if (e.error === 'interrupted' || e.error === 'canceled') {
          resolve();
        } else {
          reject(e);
        }
      };

      speechSynthesis.speak(utt);

      // Chrome bug: speech can pause if tab loses focus — resume periodically
      const resumeInterval = setInterval(() => {
        if (!speechSynthesis.speaking) {
          clearInterval(resumeInterval);
        } else {
          speechSynthesis.resume();
        }
      }, 5000);

      utt.onend = () => {
        clearInterval(resumeInterval);
        resolve();
      };
    });
  }

  /* ── Public API ────────────────────────────────────────────────────────── */

  /* Play a constellation narration by id and type ('intro' or 'detail').
     Tries assets/audio/<id>_<type>.mp3 first; falls back to TTS if missing.
     Example: playNarration('ursaMajor', 'intro', NARRATIONS.ursaMajor.intro) */
  async function playNarration(constellationId, type, fallbackText) {
    stop();
    const file = `assets/audio/${constellationId}_${type}.mp3`;
    const played = await tryAudio(file);
    if (!played && fallbackText) {
      await speakTTS(fallbackText);
    }
  }

  /* Speak any Greek string via TTS (one-off strings, no audio file).
     Kept for backward compatibility — existing callers need no changes. */
  function speak(text) {
    stop();
    return speakTTS(text);
  }

  /* Stop any ongoing audio or speech */
  function stop() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
    speechSynthesis.cancel();
  }

  /* Check if a Greek voice is available for TTS fallback */
  function hasGreekVoice() {
    return greekVoice !== null;
  }

  return { init, unlock, speak, playNarration, stop, hasGreekVoice };
})();
