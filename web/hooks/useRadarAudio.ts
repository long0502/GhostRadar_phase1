import { useEffect, useRef, useCallback, useState } from 'react';

export function useRadarAudio() {
    const audioCtxRef = useRef<AudioContext | null>(null);
    const [isMuted, setIsMuted] = useState(false);

    // Initialize and resume AudioContext on first interaction
    const initAudio = useCallback(() => {
        if (!audioCtxRef.current) {
            const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextCtor) {
                audioCtxRef.current = new AudioContextCtor();
            }
        }
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
    }, []);

    useEffect(() => {
        // Add interaction listeners to resume audio
        const handleIteraction = () => initAudio();
        window.addEventListener('click', handleIteraction, { once: true });
        window.addEventListener('touchstart', handleIteraction, { once: true });
        return () => {
            window.removeEventListener('click', handleIteraction);
            window.removeEventListener('touchstart', handleIteraction);
        };
    }, [initAudio]);

    const toggleMute = useCallback(() => {
        setIsMuted((prev) => !prev);
    }, []);

    const playSonar = useCallback((distanceKm?: number, maxRadiusKm?: number) => {
        if (isMuted) return;
        initAudio();
        const ctx = audioCtxRef.current;
        if (!ctx) return;

        // Pitch logic: closer = higher frequency, louder
        let pitch = 700; // default calm ping
        let peakVol = 0.3; // default soft volume

        if (distanceKm !== undefined && maxRadiusKm !== undefined && maxRadiusKm > 0) {
            const normalized = Math.max(0, Math.min(1, distanceKm / maxRadiusKm));
            // Closer -> lower normalized -> higher pitch
            pitch = 700 + (1 - normalized) * 400; // 700 to 1100Hz
            peakVol = 0.4 + (1 - normalized) * 0.4; // 0.4 to 0.8
        }

        const t = ctx.currentTime;

        // Create nodes
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        filter.type = 'lowpass';

        // Filter settings
        filter.frequency.setValueAtTime(pitch * 2, t); // letting some harmonics pass before cutoff
        filter.Q.value = 4;

        // Detune osc2 for ghostly texture
        osc1.frequency.setValueAtTime(pitch, t);
        osc2.frequency.setValueAtTime(pitch * 1.006, t); // detuned by 0.6%

        // Pitch movement: drop to 70% over 2.5 seconds
        osc1.frequency.exponentialRampToValueAtTime(pitch * 0.7, t + 2.5);
        osc2.frequency.exponentialRampToValueAtTime(pitch * 1.006 * 0.7, t + 2.5);

        // Envelope
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(peakVol, t + 0.05); // sharp attack
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5); // eerie decay

        // Connect
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        // Start & Stop
        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 2.6);
        osc2.stop(t + 2.6);

        // Cleanup
        osc1.onended = () => {
            osc1.disconnect();
            osc2.disconnect();
            filter.disconnect();
            gain.disconnect();
        };
    }, [isMuted, initAudio]);

    return { playSonar, isMuted, toggleMute };
}
