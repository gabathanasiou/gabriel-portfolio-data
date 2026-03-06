/**
 * gameSounds - Web Audio API Sound Effects for the Game
 * 
 * Generates game sound effects programmatically using the Web Audio API.
 * No external audio files required - all sounds are synthesized in real-time.
 * 
 * @module utils/gameSounds
 * 
 * ## Features
 * - Zero external dependencies (no audio files to load)
 * - Graceful fallback if Web Audio API not supported
 * - Respects browser autoplay policies (requires user interaction)
 * - Toggle on/off functionality
 * - Click-free audio (fade in/out to avoid pops)
 * 
 * ## Available Sounds
 * - `playClick()` - Subtle UI click (800Hz, 30ms)
 * - `playCorrect()` - Happy ascending notes (C5 → E5)
 * - `playWrong()` - Low buzz (200Hz square wave)
 * - `playShuffle()` - Whoosh effect (400Hz → 100Hz sweep)
 * - `playHighScore()` - Triumphant arpeggio (C5 → E5 → G5 → C6)
 * 
 * ## Usage
 * ```typescript
 * import { gameSounds } from './utils/gameSounds';
 * 
 * // Must call resume() after first user interaction
 * gameSounds.resume();
 * 
 * // Play sounds
 * gameSounds.playClick();
 * gameSounds.playCorrect();
 * 
 * // Toggle sounds
 * gameSounds.toggle(false); // Disable
 * ```
 * 
 * @see GameView.tsx for integration example
 */

/**
 * GameSounds class - Singleton for managing game audio
 * Uses Web Audio API oscillators to generate sounds
 */
class GameSounds {
    /** Web Audio API context (lazy initialized) */
    private audioContext: AudioContext | null = null;
    
    /** Whether sounds are enabled */
    private enabled: boolean = true;

    /**
     * Get or create the AudioContext
     * Lazy initialization to avoid creating context before user interaction
     * @returns AudioContext or null if not supported
     */
    private getContext(): AudioContext | null {
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            } catch (e) {
                console.warn('Web Audio API not supported');
                return null;
            }
        }
        return this.audioContext;
    }

    /**
     * Resume audio context after user interaction
     * Required by browsers to comply with autoplay policies
     */
    async resume(): Promise<void> {
        const ctx = this.getContext();
        if (ctx && ctx.state === 'suspended') {
            await ctx.resume();
        }
    }

    /**
     * Toggle sound effects on/off
     * @param enabled - Optional explicit state, or toggle if not provided
     * @returns New enabled state
     */
    toggle(enabled?: boolean): boolean {
        this.enabled = enabled ?? !this.enabled;
        return this.enabled;
    }

    /** Check if sounds are currently enabled */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Play a simple tone using an oscillator
     * Includes fade in/out to prevent audio clicks
     * 
     * @param frequency - Frequency in Hz
     * @param duration - Duration in seconds
     * @param type - Oscillator type (sine, square, triangle, sawtooth)
     * @param volume - Volume level (0-1)
     */
    private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3): void {
        if (!this.enabled) return;
        
        const ctx = this.getContext();
        if (!ctx) return;

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type;

        // Fade in and out to avoid clicks
        const now = ctx.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    /**
     * Play correct answer sound
     * Two quick ascending notes (C5 → E5) - happy/success feeling
     */
    playCorrect(): void {
        if (!this.enabled) return;
        
        const ctx = this.getContext();
        if (!ctx) return;

        // Play two quick ascending notes
        setTimeout(() => this.playTone(523.25, 0.1, 'sine', 0.2), 0);    // C5
        setTimeout(() => this.playTone(659.25, 0.15, 'sine', 0.25), 80); // E5
    }

    /**
     * Play wrong answer sound
     * Short low buzz using square wave - error/failure feeling
     */
    playWrong(): void {
        if (!this.enabled) return;
        
        const ctx = this.getContext();
        if (!ctx) return;

        // Play a short low buzz
        this.playTone(200, 0.15, 'square', 0.15);
    }

    /**
     * Play button click sound
     * Subtle high-frequency click for UI feedback
     */
    playClick(): void {
        if (!this.enabled) return;
        
        const ctx = this.getContext();
        if (!ctx) return;

        this.playTone(800, 0.03, 'sine', 0.1);
    }

    /**
     * Play card shuffle sound
     * Frequency sweep from 400Hz → 100Hz for whoosh effect
     */
    playShuffle(): void {
        if (!this.enabled) return;
        
        const ctx = this.getContext();
        if (!ctx) return;

        // Quick whoosh-like sound
        const now = ctx.currentTime;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(400, now);
        oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
        
        oscillator.start(now);
        oscillator.stop(now + 0.2);
    }

    /**
     * Play high score celebration sound
     * Triumphant ascending arpeggio (C5 → E5 → G5 → C6)
     */
    playHighScore(): void {
        if (!this.enabled) return;
        
        const ctx = this.getContext();
        if (!ctx) return;

        // Triumphant ascending arpeggio
        setTimeout(() => this.playTone(523.25, 0.12, 'sine', 0.2), 0);    // C5
        setTimeout(() => this.playTone(659.25, 0.12, 'sine', 0.2), 100);  // E5
        setTimeout(() => this.playTone(783.99, 0.12, 'sine', 0.2), 200);  // G5
        setTimeout(() => this.playTone(1046.5, 0.2, 'sine', 0.25), 300);  // C6
    }
}

// Singleton instance
export const gameSounds = new GameSounds();
