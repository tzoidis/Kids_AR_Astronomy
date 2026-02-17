/* ===== speech.js — Greek Text-to-Speech Wrapper ===== */

const GreekTTS = (() => {
  let greekVoice = null;
  let ready = false;
  let unlocked = false; // iOS requires user gesture

  /* Find the best Greek voice available */
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

  /* Initialize — call early, voices may load async */
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

  /* Speak a Greek string. Returns a Promise that resolves when done. */
  function speak(text) {
    return new Promise((resolve, reject) => {
      if (!text) { resolve(); return; }

      // Cancel any ongoing speech
      speechSynthesis.cancel();

      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = greekVoice ? greekVoice.lang : 'el-GR';
      if (greekVoice) utt.voice = greekVoice;
      utt.rate = 0.85;   // Slightly slower for kids
      utt.pitch = 1.1;   // Slightly higher, friendlier
      utt.volume = 1.0;

      utt.onend = () => resolve();
      utt.onerror = (e) => {
        // Don't reject on 'interrupted' — that's normal when we cancel
        if (e.error === 'interrupted' || e.error === 'canceled') {
          resolve();
        } else {
          reject(e);
        }
      };

      speechSynthesis.speak(utt);

      // Chrome bug: speech can pause if tab loses focus. Workaround:
      // Resume periodically while speaking.
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

  /* Stop any ongoing speech */
  function stop() {
    speechSynthesis.cancel();
  }

  /* Check if a Greek voice is available */
  function hasGreekVoice() {
    return greekVoice !== null;
  }

  return { init, unlock, speak, stop, hasGreekVoice };
})();
