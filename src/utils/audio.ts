// Sound synthesizer & Voice guidance utility

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

let sirenOscillator: OscillatorNode | null = null;
let sirenGain: GainNode | null = null;
let sirenInterval: ReturnType<typeof setInterval> | null = null;

export const playTone = (frequency: number, type: OscillatorType, duration: number, volume = 0.2) => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (err) {
    console.warn('Audio play failed:', err);
  }
};

export const playSuccessChime = () => {
  try {
    playTone(523.25, 'sine', 0.15, 0.15); // C5
    setTimeout(() => playTone(659.25, 'sine', 0.15, 0.15), 120); // E5
    setTimeout(() => playTone(783.99, 'sine', 0.3, 0.15), 240); // G5
  } catch (e) {
    console.error(e);
  }
};

export const playWarningBeep = () => {
  try {
    playTone(880, 'triangle', 0.2, 0.25);
    setTimeout(() => playTone(880, 'triangle', 0.2, 0.25), 250);
  } catch (e) {
    console.error(e);
  }
};

export const startEmergencySiren = () => {
  try {
    const ctx = getAudioContext();
    if (sirenOscillator) {
      stopEmergencySiren();
    }
    
    sirenOscillator = ctx.createOscillator();
    sirenGain = ctx.createGain();
    
    sirenOscillator.type = 'sawtooth';
    sirenGain.gain.setValueAtTime(0.35, ctx.currentTime);
    
    let isHigh = false;
    sirenOscillator.frequency.setValueAtTime(750, ctx.currentTime);
    
    sirenOscillator.connect(sirenGain);
    sirenGain.connect(ctx.destination);
    sirenOscillator.start();
    
    sirenInterval = setInterval(() => {
      if (!sirenOscillator || !audioCtx) return;
      isHigh = !isHigh;
      const targetFreq = isHigh ? 980 : 620;
      sirenOscillator.frequency.cancelScheduledValues(audioCtx.currentTime);
      sirenOscillator.frequency.linearRampToValueAtTime(targetFreq, audioCtx.currentTime + 0.3);
    }, 350);
  } catch (e) {
    console.warn('Siren could not start', e);
  }
};

export const stopEmergencySiren = () => {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
  if (sirenOscillator) {
    try {
      sirenOscillator.stop();
      sirenOscillator.disconnect();
    } catch {
      // ignore
    }
    sirenOscillator = null;
  }
  if (sirenGain) {
    try {
      sirenGain.disconnect();
    } catch {
      // ignore
    }
    sirenGain = null;
  }
};

export const stopSpeaking = () => {
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
};

export const speakVietnamese = (text: string, onEnd?: () => void) => {
  if (!('speechSynthesis' in window)) {
    if (onEnd) onEnd();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    
    if (onEnd) {
      utterance.onend = () => onEnd();
      utterance.onerror = () => onEnd();
    }

    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang.includes('vi') || v.lang.includes('VI'));
    if (viVoice) {
      utterance.voice = viVoice;
    }
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis not available', err);
    if (onEnd) onEnd();
  }
};
