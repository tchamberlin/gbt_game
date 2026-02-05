// Audio manager using Web Audio API for procedural sounds

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isEnabled: boolean = true;
  private observationOscillator: OscillatorNode | null = null;
  private observationGain: GainNode | null = null;
  private radarOscillator: OscillatorNode | null = null;
  private radarGain: GainNode | null = null;

  // Menu music
  private menuMusic: HTMLAudioElement | null = null;
  private menuMusicGain: GainNode | null = null;
  private menuMusicSource: MediaElementAudioSourceNode | null = null;
  private isMusicFading: boolean = false;

  constructor() {
    // Audio context is created on first user interaction
    // Pre-load menu music
    this.menuMusic = new Audio('/src/assets/JumpThatGopher.m4a');
    this.menuMusic.loop = true;
    this.menuMusic.preload = 'auto';
  }

  private initAudio(): void {
    if (this.audioContext) return;

    this.audioContext = new AudioContext();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.audioContext.destination);
  }

  enable(): void {
    this.isEnabled = true;
    this.initAudio();
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  disable(): void {
    this.isEnabled = false;
    this.stopObservationSound();
    this.stopRadarSound();
  }

  // Play a soft ping while observing a source
  startObservationSound(frequency: number = 440): void {
    if (!this.isEnabled) return;
    this.initAudio();
    if (!this.audioContext || !this.masterGain) return;

    // Already playing
    if (this.observationOscillator) return;

    this.observationOscillator = this.audioContext.createOscillator();
    this.observationGain = this.audioContext.createGain();

    this.observationOscillator.type = 'sine';
    this.observationOscillator.frequency.value = frequency;

    this.observationGain.gain.value = 0.1;

    this.observationOscillator.connect(this.observationGain);
    this.observationGain.connect(this.masterGain);

    this.observationOscillator.start();
  }

  stopObservationSound(): void {
    if (this.observationOscillator) {
      this.observationOscillator.stop();
      this.observationOscillator.disconnect();
      this.observationOscillator = null;
    }
    if (this.observationGain) {
      this.observationGain.disconnect();
      this.observationGain = null;
    }
  }

  // Play a satisfying chime when a source is fully observed
  playSourceComplete(points: number): void {
    if (!this.isEnabled) return;
    this.initAudio();
    if (!this.audioContext || !this.masterGain) return;

    // Higher pitched chime for more points
    const baseFreq = 523.25; // C5
    const freqMultiplier = 1 + (points / 1000) * 0.5;

    const osc1 = this.audioContext.createOscillator();
    const osc2 = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc1.type = 'sine';
    osc1.frequency.value = baseFreq * freqMultiplier;

    osc2.type = 'sine';
    osc2.frequency.value = baseFreq * freqMultiplier * 1.5; // Perfect fifth

    gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start();
    osc2.start();
    osc1.stop(this.audioContext.currentTime + 0.5);
    osc2.stop(this.audioContext.currentTime + 0.5);
  }

  // Play a warning buzz when hitting a satellite
  playSatelliteHit(): void {
    if (!this.isEnabled) return;
    this.initAudio();
    if (!this.audioContext || !this.masterGain) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 110;

    gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.audioContext.currentTime + 0.2);
  }

  // Play distinctive alert for FRB spawn
  playFRBAlert(): void {
    if (!this.isEnabled) return;
    this.initAudio();
    if (!this.audioContext || !this.masterGain) return;

    // Sweeping frequency alert
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, this.audioContext.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(880, this.audioContext.currentTime + 0.2);

    gain.gain.setValueAtTime(0.25, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.audioContext.currentTime + 0.3);
  }

  // Play tick sound during observation
  playObservationTick(): void {
    if (!this.isEnabled) return;
    this.initAudio();
    if (!this.audioContext || !this.masterGain) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = 1000;

    gain.gain.setValueAtTime(0.05, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.audioContext.currentTime + 0.05);
  }

  // Start continuous radar sound
  startRadarSound(): void {
    if (!this.isEnabled) return;
    this.initAudio();
    if (!this.audioContext || !this.masterGain) return;

    // Already playing
    if (this.radarOscillator) return;

    this.radarOscillator = this.audioContext.createOscillator();
    this.radarGain = this.audioContext.createGain();

    // Low frequency pulsing buzz
    this.radarOscillator.type = 'sawtooth';
    this.radarOscillator.frequency.value = 80;

    this.radarGain.gain.value = 0.15;

    this.radarOscillator.connect(this.radarGain);
    this.radarGain.connect(this.masterGain);

    this.radarOscillator.start();
  }

  stopRadarSound(): void {
    if (this.radarOscillator) {
      this.radarOscillator.stop();
      this.radarOscillator.disconnect();
      this.radarOscillator = null;
    }
    if (this.radarGain) {
      this.radarGain.disconnect();
      this.radarGain = null;
    }
  }

  // Start menu music - attempts autoplay, connects to Web Audio API when available
  startMenuMusic(): void {
    if (!this.menuMusic) return;

    // Don't restart if already playing
    if (!this.menuMusic.paused && !this.isMusicFading) return;

    // Reset state
    this.isMusicFading = false;
    this.menuMusic.volume = 0.3; // Match master gain level
    this.menuMusic.currentTime = 0;

    // Try to play directly (works if autoplay allowed or user already interacted)
    this.menuMusic.play().catch(() => {
      // Autoplay blocked - music will start when user interacts
    });

    // If audio context exists, connect for fade control
    if (this.audioContext && this.masterGain && !this.menuMusicSource) {
      this.menuMusicSource = this.audioContext.createMediaElementSource(this.menuMusic);
      this.menuMusicGain = this.audioContext.createGain();
      this.menuMusicSource.connect(this.menuMusicGain);
      this.menuMusicGain.connect(this.masterGain);
      this.menuMusic.volume = 1.0; // Web Audio API controls volume now
    }
  }

  // Fade out menu music over duration (in seconds)
  fadeOutMenuMusic(duration: number = 1.0): void {
    if (!this.menuMusic) return;
    if (this.isMusicFading) return;

    this.isMusicFading = true;

    // If connected to Web Audio API, use gain node for smooth fade
    if (this.menuMusicGain && this.audioContext) {
      const currentTime = this.audioContext.currentTime;
      this.menuMusicGain.gain.setValueAtTime(this.menuMusicGain.gain.value, currentTime);
      this.menuMusicGain.gain.linearRampToValueAtTime(0, currentTime + duration);
    } else {
      // Fallback: animate volume directly on audio element
      const startVolume = this.menuMusic.volume;
      const startTime = performance.now();
      const fadeStep = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed < duration) {
          this.menuMusic!.volume = startVolume * (1 - elapsed / duration);
          requestAnimationFrame(fadeStep);
        } else {
          this.menuMusic!.volume = 0;
        }
      };
      requestAnimationFrame(fadeStep);
    }

    // Stop playback after fade completes
    setTimeout(() => {
      if (this.menuMusic) {
        this.menuMusic.pause();
      }
    }, duration * 1000);
  }

  // Stop menu music immediately
  stopMenuMusic(): void {
    if (this.menuMusic) {
      this.menuMusic.pause();
      this.menuMusic.currentTime = 0;
    }
    if (this.menuMusicGain) {
      this.menuMusicGain.gain.value = 0;
    }
    this.isMusicFading = false;
  }

  // Play explosion sound when satellite is destroyed
  playSatelliteDestroyed(): void {
    if (!this.isEnabled) return;
    this.initAudio();
    if (!this.audioContext || !this.masterGain) return;

    // Create noise buffer for explosion
    const bufferSize = this.audioContext.sampleRate * 0.3;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }

    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;

    // Low-pass filter for more boom-like sound
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.4, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  // Play squish sound when groundhog is destroyed
  playGroundhogDestroyed(): void {
    if (!this.isEnabled) return;
    this.initAudio();
    if (!this.audioContext || !this.masterGain) return;

    // Quick descending tone for squish effect
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.audioContext.currentTime + 0.15);

    gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.audioContext.currentTime + 0.15);
  }
}
