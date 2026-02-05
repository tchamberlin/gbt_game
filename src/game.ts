// Game state management, scoring, and difficulty

import type { GameState, SatelliteDebris, DroppedWheel, LeaderboardEntry, SubmitResult, DifficultyMode, DifficultyConfig } from './types.ts';
import { DIFFICULTY_CONFIGS } from './types.ts';
import { fetchLeaderboard, submitScore, generateGameToken } from './leaderboard.ts';
import type { Renderer } from './renderer.ts';
import { Telescope } from './telescope.ts';
import { SourceManager } from './sources.ts';
import { SatelliteManager } from './satellites.ts';
import { GroundhogManager } from './groundhogs.ts';
import { DeerManager } from './deer.ts';
import { UFOManager } from './ufos.ts';
import { AudioManager } from './audio.ts';
import { processCollisions, checkGroundhogCollision, checkDeerCollision, checkUFOCollision, beamIntersectsGroundhog, beamIntersectsDeer, beamIntersectsUFO } from './collision.ts';
import { drawExplosion, drawWheelExplosion, drawDroppedWheel } from './sprites.ts';

const DIFFICULTY_INTERVAL = 30; // seconds between difficulty increases
const SATELLITE_PENALTY_RATE = 30; // dollars per second while satellite in beam
const HIGH_SCORE_KEY_PREFIX = 'gbt_observations_high_dollars';
const OBSERVATION_BONUS_RATE = 10; // base dollars per second while observing source
const RADAR_COST_RATE = 10; // dollars per second while radar is active
const BASE_RADAR_DAMAGE_RATE = 100; // base damage per second to enemies in beam
const SATELLITE_DESTRUCTION_FINE = 500; // fine for destroying a satellite
const DEBRIS_GRAVITY = 300; // pixels per second squared
const DEBRIS_SIZE = 12; // size of debris for collision
const DROPPED_WHEEL_SIZE = 12; // size of dropped wheel for collision

// Format number as dollars with commas
function formatDollars(amount: number): string {
  return '$' + amount.toLocaleString('en-US');
}

export class Game {
  state: GameState;
  renderer: Renderer;
  telescope: Telescope;
  sources: SourceManager;
  satellites: SatelliteManager;
  groundhogs: GroundhogManager;
  deer: DeerManager;
  ufos: UFOManager;
  audio: AudioManager;

  private lastFRBCount: number = 0;
  private observationTickTimer: number = 0;
  private scorePopups: { x: number; y: number; text: string; age: number; color: string }[] = [];
  private satelliteFlash: number = 0;
  private explosionProgress: number = 0;
  private keysHeld: Set<string> = new Set();
  private wheelExplosions: { x: number; y: number; progress: number }[] = [];
  private heldMouseButtons: Set<number> = new Set();  // Track all held mouse buttons
  private activeMouseButton: number | null = null;  // The button currently controlling state
  private satelliteDebris: SatelliteDebris[] = [];
  private nextDebrisId: number = 0;
  private radarCostAccumulator: number = 0;
  private droppedWheels: DroppedWheel[] = [];
  private nextWheelId: number = 0;

  // Difficulty state
  private selectedDifficulty: DifficultyMode | null = null;

  // Leaderboard state
  private leaderboard: LeaderboardEntry[] = [];
  private normalLeaderboard: LeaderboardEntry[] = [];
  private hardLeaderboard: LeaderboardEntry[] = [];
  private leaderboardLoading: boolean = false;
  private playerInitials: string = '';
  private initialsInputActive: boolean = false;
  private submitState: 'idle' | 'submitting' | 'submitted' | 'error' = 'idle';
  private submitRank: number | null = null;
  private gameStartTime: number = 0;
  private cursorBlink: number = 0;
  private showLeaderboardOverlay: boolean = false;
  private gameOverButtons: { submit: { x: number; y: number; width: number; height: number } | null; skip: { x: number; y: number; width: number; height: number } | null } = { submit: null, skip: null };
  private difficultyButtons: { normal: { x: number; y: number; width: number; height: number } | null; hard: { x: number; y: number; width: number; height: number } | null } = { normal: null, hard: null };
  private hoveredDifficulty: 'normal' | 'hard' | null = null;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.telescope = new Telescope(renderer);
    this.sources = new SourceManager(renderer);
    this.satellites = new SatelliteManager(renderer);
    this.groundhogs = new GroundhogManager(renderer);
    this.deer = new DeerManager(renderer);
    this.ufos = new UFOManager(renderer);
    this.audio = new AudioManager();

    this.state = {
      score: 0,
      highScore: this.loadHighScore(),
      elapsedTime: 0,
      difficultyLevel: 1,
      isPaused: false,
      isStarted: false,
      isGameOver: false,
      isBeamBlanked: true,  // Beam is blanked by default
      isRadarActive: false,
      satellitesDestroyed: 0,
      radarDisabledTimer: 0,
      welcomeStage: 0,
      difficultyMode: this.selectedDifficulty,
    };
  }

  private getDifficultyConfig(): DifficultyConfig {
    return DIFFICULTY_CONFIGS[this.selectedDifficulty || 'normal'];
  }

  private getHighScoreKey(): string {
    if (!this.selectedDifficulty || this.selectedDifficulty === 'hard') {
      return HIGH_SCORE_KEY_PREFIX;  // Preserve existing hard mode key
    }
    return `${HIGH_SCORE_KEY_PREFIX}_${this.selectedDifficulty}`;
  }

  private loadHighScore(): number {
    const stored = localStorage.getItem(this.getHighScoreKey());
    return stored ? parseInt(stored, 10) : 0;
  }

  private saveHighScore(): void {
    if (this.state.score > this.state.highScore) {
      this.state.highScore = this.state.score;
      localStorage.setItem(this.getHighScoreKey(), this.state.highScore.toString());
    }
  }

  start(): void {
    if (!this.selectedDifficulty) return; // Safety check
    this.state.isStarted = true;
    this.state.isPaused = false;
    this.state.difficultyMode = this.selectedDifficulty;
    this.state.highScore = this.loadHighScore(); // Reload high score for selected difficulty
    this.audio.enable();
    this.audio.fadeOutMenuMusic(1.0);
    this.gameStartTime = Date.now();
    this.reset();
  }

  reset(): void {
    // Fade out menu music when restarting from game over
    this.audio.fadeOutMenuMusic(1.0);

    this.state.score = 0;
    this.state.elapsedTime = 0;
    this.state.difficultyLevel = 1;
    this.state.isGameOver = false;
    this.state.isBeamBlanked = true;  // Beam is blanked by default
    this.state.isRadarActive = false;
    this.state.satellitesDestroyed = 0;
    this.state.radarDisabledTimer = 0;
    this.audio.stopRadarSound();
    this.sources.reset();
    this.satellites.reset();
    this.groundhogs.reset();
    this.deer.reset();
    this.ufos.reset();
    this.telescope = new Telescope(this.renderer);
    this.scorePopups = [];
    this.explosionProgress = 0;
    this.keysHeld.clear();
    this.wheelExplosions = [];
    this.heldMouseButtons.clear();
    this.activeMouseButton = null;
    this.satelliteDebris = [];
    this.radarCostAccumulator = 0;
    this.droppedWheels = [];

    // Reset leaderboard state
    this.playerInitials = '';
    this.initialsInputActive = false;
    this.submitState = 'idle';
    this.submitRank = null;
    this.gameStartTime = Date.now();
  }

  pause(): void {
    this.state.isPaused = true;
    this.audio.stopRadarSound();
  }

  resume(): void {
    this.state.isPaused = false;
    this.audio.enable();
  }

  togglePause(): void {
    if (this.state.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  update(deltaTime: number): void {
    if (!this.state.isStarted || this.state.isPaused) return;

    // Handle game over explosion animation
    if (this.state.isGameOver) {
      this.explosionProgress += deltaTime * 0.5; // Explosion takes ~2 seconds
      this.cursorBlink += deltaTime;

      // Activate initials input after explosion
      if (this.explosionProgress > 0.5 && !this.initialsInputActive && this.submitState === 'idle') {
        this.initialsInputActive = true;
        this.loadLeaderboard();
      }
      return;
    }

    // Update elapsed time and difficulty (level increases by 1 every 30 seconds)
    this.state.elapsedTime += deltaTime;
    this.state.difficultyLevel = 1 + Math.floor(this.state.elapsedTime / DIFFICULTY_INTERVAL);

    // Update telescope (includes movement and jumping)
    this.telescope.update(deltaTime);

    // Track FRB count before update
    const frbCountBefore = this.sources.getSources().filter((s) => s.type === 'frb').length;

    // Get difficulty config for this frame
    const diffConfig = this.getDifficultyConfig();

    // Update game objects with difficulty config
    this.sources.update(deltaTime, this.state.difficultyLevel, diffConfig);
    this.satellites.update(deltaTime, this.state.difficultyLevel, diffConfig);
    this.groundhogs.update(deltaTime, this.state.difficultyLevel, this.telescope.state.x, diffConfig);
    this.deer.update(deltaTime, this.state.difficultyLevel, this.telescope.state.x, diffConfig);
    this.ufos.update(deltaTime, this.state.difficultyLevel, this.telescope.state.x, this.telescope.state.y, diffConfig);

    // Check for new FRBs
    const frbCountAfter = this.sources.getSources().filter((s) => s.type === 'frb').length;
    if (frbCountAfter > frbCountBefore) {
      this.audio.playFRBAlert();
    }

    // Beam blanking is now controlled by mouse buttons (left=observe, right=radar)
    // The state is managed in handleMouseDown/handleMouseUp

    // Process beam collisions
    const beam = this.telescope.getBeamState();
    // Radar mode blocks observations like blanking does
    const effectiveBlanked = this.state.isBeamBlanked || this.state.isRadarActive;
    const collisions = processCollisions(
      beam,
      this.sources.getSources(),
      this.satellites.getSatellites(),
      deltaTime,
      effectiveBlanked
    );

    // Handle observations - continuous scoring while observing
    if (collisions.observedSources.length > 0) {
      this.observationTickTimer += deltaTime;
      if (this.observationTickTimer >= 0.2) {
        this.observationTickTimer = 0;
        this.audio.playObservationTick();
      }

      // Award points continuously while observing (small amount per frame)
      for (const { source, deltaObservation } of collisions.observedSources) {
        const continuousPoints = Math.floor(OBSERVATION_BONUS_RATE * deltaObservation);
        if (continuousPoints > 0) {
          this.state.score += continuousPoints;
        }
      }
    } else {
      this.observationTickTimer = 0;
    }

    // Handle completed sources - bonus points for completing observation
    for (const source of collisions.completedSources) {
      this.state.score += source.points;
      this.audio.playSourceComplete(source.points);
      this.addScorePopup(source.x, source.y, `+${source.points} ${source.type.toUpperCase()}`, '#00ff00');
      this.sources.removeSource(source.id);
    }

    // Update radar disabled timer
    if (this.state.radarDisabledTimer > 0) {
      this.state.radarDisabledTimer -= deltaTime;
      if (this.state.radarDisabledTimer < 0) {
        this.state.radarDisabledTimer = 0;
      }
    }

    // Handle radar mode - damage satellites and groundhogs in beam
    // Radar is blocked when disabled timer is active
    const radarBlocked = this.state.radarDisabledTimer > 0 || this.state.score <= 0;
    if (this.state.isRadarActive && !radarBlocked) {
      // Start radar sound
      this.audio.startRadarSound();

      // Calculate damage this frame (apply difficulty multiplier)
      const damage = BASE_RADAR_DAMAGE_RATE * diffConfig.radarDamageMultiplier * deltaTime;

      // Damage satellites in beam
      for (const satellite of collisions.satellitesInBeam) {
        const destroyed = this.satellites.damageSatellite(satellite.id, damage);
        if (destroyed) {
          this.state.satellitesDestroyed++;
          // Fine for destroying satellite
          this.state.score = Math.max(0, this.state.score - SATELLITE_DESTRUCTION_FINE);
          this.addScorePopup(
            satellite.x,
            satellite.y,
            `-$${SATELLITE_DESTRUCTION_FINE} FINE!`,
            '#ff4444'
          );
          // Spawn debris that falls to ground
          this.satelliteDebris.push({
            id: this.nextDebrisId++,
            x: satellite.x,
            y: satellite.y,
            vy: 0,
            isOnGround: false,
          });
          this.audio.playSatelliteDestroyed();
        }
      }

      // Damage groundhogs in beam
      for (const groundhog of this.groundhogs.getGroundhogs()) {
        if (beamIntersectsGroundhog(beam, groundhog)) {
          const destroyed = this.groundhogs.damageGroundhog(groundhog.id, damage);
          if (destroyed) {
            this.audio.playGroundhogDestroyed();
          }
        }
      }

      // Damage deer in beam
      for (const deer of this.deer.getDeer()) {
        if (beamIntersectsDeer(beam, deer)) {
          const destroyed = this.deer.damageDeer(deer.id, damage);
          if (destroyed) {
            this.audio.playGroundhogDestroyed(); // Reuse groundhog sound
          }
        }
      }

      // Damage UFOs in beam (UFOs can only be killed by radar)
      for (const ufo of this.ufos.getUFOs()) {
        if (beamIntersectsUFO(beam, ufo)) {
          const ufoX = ufo.x;
          const ufoY = ufo.y;
          const result = this.ufos.damageUFO(ufo.id, damage);
          if (result.destroyed) {
            this.state.score += 100; // Bonus for destroying UFO
            this.addScorePopup(ufoX, ufoY, '+$100 UFO!', '#00ff00');
            this.audio.playSatelliteDestroyed();

            // Spawn dropped wheels if UFO had stolen any
            if (result.droppedWheels > 0) {
              for (let i = 0; i < result.droppedWheels; i++) {
                this.droppedWheels.push({
                  id: this.nextWheelId++,
                  x: ufoX + (i === 0 ? -10 : 10),
                  y: ufoY,
                  vy: 0,
                  isOnGround: false,
                });
              }
              const dropText = result.droppedWheels === 1 ? '+1 WHEEL DROPPED!' : '+2 WHEELS DROPPED!';
              this.addScorePopup(ufoX, ufoY - 30, dropText, '#88ff88');
            }
          }
        }
      }

      // Radar costs $10/second - accumulate fractional costs
      this.radarCostAccumulator += RADAR_COST_RATE * deltaTime;
      if (this.radarCostAccumulator >= 1) {
        const cost = Math.floor(this.radarCostAccumulator);
        this.radarCostAccumulator -= cost;
        this.state.score = Math.max(0, this.state.score - cost);
      }
    } else {
      // Stop radar sound when not active or blocked
      this.audio.stopRadarSound();
      this.radarCostAccumulator = 0;
    }

    // Handle satellites in beam - continuous penalty (only when not blanked and not radar)
    if (collisions.satellitesInBeam.length > 0 && !this.state.isBeamBlanked && !this.state.isRadarActive) {
      const penalty = Math.floor(SATELLITE_PENALTY_RATE * deltaTime * collisions.satellitesInBeam.length);
      if (penalty > 0) {
        this.state.score = Math.max(0, this.state.score - penalty);
        this.satelliteFlash = 0.1;
      }
    }

    // Reduce source values by 1/3 when satellite enters beam (not blanked and not radar)
    // This only happens once per source, no matter how many satellite encounters
    if (collisions.newSatellitesInBeam.length > 0 && !this.state.isBeamBlanked && !this.state.isRadarActive) {
      let penalizedCount = 0;
      for (const source of this.sources.getSources()) {
        if (!source.isComplete && !source.satellitePenalized) {
          // Reduce points by 1/3 (keeping at least 1 point)
          source.points = Math.max(1, Math.floor(source.points * 2 / 3));
          source.satellitePenalized = true;
          penalizedCount++;
        }
      }
      if (penalizedCount > 0) {
        this.addScorePopup(
          this.renderer.width / 2,
          100,
          'SATELLITE INTERFERENCE! VALUES REDUCED',
          '#ff8800'
        );
        this.audio.playSatelliteHit();
      }
    }

    // Process groundhog collisions
    const gbtBounds = this.telescope.getBaseBounds();
    for (const groundhog of this.groundhogs.getGroundhogs()) {
      if (groundhog.wasHit) continue;

      const collisionResult = checkGroundhogCollision(
        groundhog,
        gbtBounds,
        this.telescope.state.groundY,
        this.telescope.state.y,
        this.telescope.state.velocityY
      );

      if (collisionResult === 'stomp') {
        // Jumping on groundhog kills it - bonus points!
        groundhog.wasHit = true;
        this.state.score += 50;
        this.audio.playSourceComplete(50);
        this.addScorePopup(groundhog.x, groundhog.y - 30, '+$50 STOMP!', '#00ff00');
      } else if (collisionResult === 'hit') {
        // Groundhog hits wheels - damage!
        groundhog.wasHit = true;
        this.audio.playSatelliteHit();

        // Damage the wheel closest to the groundhog
        const { gameOver, wheelIndex } = this.telescope.damageWheel(groundhog.x);

        // Spawn wheel explosion at the damaged wheel's position
        const wheelPos = this.telescope.getWheelPosition(wheelIndex);
        if (wheelPos) {
          this.wheelExplosions.push({ x: wheelPos.x, y: wheelPos.y, progress: 0 });
        }

        this.addScorePopup(groundhog.x, groundhog.y - 30, 'WHEEL DESTROYED!', '#ff4444');

        if (gameOver) {
          this.state.isGameOver = true;
          this.explosionProgress = 0;
          this.audio.stopRadarSound();
          this.audio.startMenuMusic();
          this.saveHighScore();
        }
      }
    }

    // Process deer collisions (stomp gives +75 points, hit removes 2 wheels)
    for (const deer of this.deer.getDeer()) {
      if (deer.wasHit) continue;

      const collisionResult = checkDeerCollision(
        deer,
        gbtBounds,
        this.telescope.state.groundY,
        this.telescope.state.y,
        this.telescope.state.velocityY
      );

      if (collisionResult === 'stomp') {
        // Jumping on deer kills it - bigger bonus than groundhog!
        deer.wasHit = true;
        this.state.score += 75;
        this.audio.playSourceComplete(75);
        this.addScorePopup(deer.x, deer.y - 30, '+$75 STOMP!', '#00ff00');
      } else if (collisionResult === 'hit') {
        // Deer hits wheels - damages 2 wheels!
        deer.wasHit = true;
        this.audio.playSatelliteHit();

        // Damage two wheels (deer are more dangerous)
        for (let i = 0; i < 2; i++) {
          const { gameOver, wheelIndex } = this.telescope.damageWheel(deer.x);

          // Spawn wheel explosion at the damaged wheel's position
          const wheelPos = this.telescope.getWheelPosition(wheelIndex);
          if (wheelPos) {
            this.wheelExplosions.push({ x: wheelPos.x, y: wheelPos.y, progress: 0 });
          }

          if (gameOver) {
            this.state.isGameOver = true;
            this.explosionProgress = 0;
            this.audio.stopRadarSound();
            this.audio.startMenuMusic();
            this.saveHighScore();
            break;
          }
        }

        this.addScorePopup(deer.x, deer.y - 30, '2 WHEELS DESTROYED!', '#ff4444');
      }
    }

    // Process UFO collisions (dive-bomb attack STEALS 2 wheels)
    for (const ufo of this.ufos.getUFOs()) {
      if (ufo.wasHit) continue;

      if (checkUFOCollision(ufo, gbtBounds, this.telescope.state.groundY)) {
        ufo.wasHit = true;
        this.audio.playSatelliteHit();

        // UFO steals 2 wheels (damages them on telescope, carries them away)
        let wheelsStolen = 0;
        for (let i = 0; i < 2; i++) {
          const { gameOver, wheelIndex } = this.telescope.damageWheel(ufo.x);

          // Spawn wheel explosion at the damaged wheel's position
          const wheelPos = this.telescope.getWheelPosition(wheelIndex);
          if (wheelPos) {
            this.wheelExplosions.push({ x: wheelPos.x, y: wheelPos.y, progress: 0 });
            wheelsStolen++;
          }

          if (gameOver) {
            this.state.isGameOver = true;
            this.explosionProgress = 0;
            this.audio.stopRadarSound();
            this.audio.startMenuMusic();
            this.saveHighScore();
            break;
          }
        }

        // Mark UFO as carrying stolen wheels
        if (wheelsStolen > 0) {
          this.ufos.setUFOStolenWheels(ufo.id, wheelsStolen);
        }

        this.addScorePopup(ufo.x, ufo.y, `${wheelsStolen} WHEELS STOLEN!`, '#ff4444');
      }
    }

    // Update score popups
    this.updateScorePopups(deltaTime);

    // Update satellite flash
    if (this.satelliteFlash > 0) {
      this.satelliteFlash -= deltaTime;
    }

    // Update wheel explosions
    for (const explosion of this.wheelExplosions) {
      explosion.progress += deltaTime * 3; // Complete in ~0.33 seconds
    }
    this.wheelExplosions = this.wheelExplosions.filter(e => e.progress < 1);

    // Update satellite debris (falling and collection)
    const groundY = this.telescope.state.groundY;
    const gbtX = this.telescope.state.x;
    const gbtWidth = 80; // approximate width for collision
    const debrisToRemove: number[] = [];

    for (const debris of this.satelliteDebris) {
      if (!debris.isOnGround) {
        // Apply gravity
        debris.vy += DEBRIS_GRAVITY * deltaTime;
        debris.y += debris.vy * deltaTime;

        // Check if hit ground
        if (debris.y >= groundY - DEBRIS_SIZE / 2) {
          debris.y = groundY - DEBRIS_SIZE / 2;
          debris.vy = 0;
          debris.isOnGround = true;
        }
      } else {
        // Check collision with telescope for salvage
        const dx = Math.abs(debris.x - gbtX);
        if (dx < gbtWidth / 2 + DEBRIS_SIZE / 2) {
          // Collected! Repair a wheel
          const hasDamagedWheel = this.telescope.state.wheels.some(w => w.damaged);
          if (hasDamagedWheel) {
            this.telescope.repairWheel();
            this.addScorePopup(debris.x, debris.y - 20, 'SALVAGE! +1 WHEEL', '#00ff00');
            this.audio.playSourceComplete(100);
          } else {
            // All wheels intact, just give a small bonus
            this.state.score += 100;
            this.addScorePopup(debris.x, debris.y - 20, '+$100 SCRAP', '#88ff88');
          }
          debrisToRemove.push(debris.id);
        }
      }
    }

    // Remove collected debris
    this.satelliteDebris = this.satelliteDebris.filter(d => !debrisToRemove.includes(d.id));

    // Update dropped wheels (falling and collection)
    const wheelsToRemove: number[] = [];

    for (const wheel of this.droppedWheels) {
      if (!wheel.isOnGround) {
        // Apply gravity
        wheel.vy += DEBRIS_GRAVITY * deltaTime;
        wheel.y += wheel.vy * deltaTime;

        // Check if hit ground
        if (wheel.y >= groundY - DROPPED_WHEEL_SIZE / 2) {
          wheel.y = groundY - DROPPED_WHEEL_SIZE / 2;
          wheel.vy = 0;
          wheel.isOnGround = true;
        }
      } else {
        // Check collision with telescope for pickup
        const dx = Math.abs(wheel.x - gbtX);
        if (dx < gbtWidth / 2 + DROPPED_WHEEL_SIZE / 2) {
          // Collected! Repair a wheel
          const hasDamagedWheelForPickup = this.telescope.state.wheels.some(w => w.damaged);
          if (hasDamagedWheelForPickup) {
            this.telescope.repairWheel();
            this.addScorePopup(wheel.x, wheel.y - 20, 'WHEEL RECOVERED!', '#00ff00');
            this.audio.playSourceComplete(100);
          } else {
            // All wheels intact, give a bonus
            this.state.score += 150;
            this.addScorePopup(wheel.x, wheel.y - 20, '+$150 SPARE WHEEL', '#88ff88');
          }
          wheelsToRemove.push(wheel.id);
        }
      }
    }

    // Remove collected wheels
    this.droppedWheels = this.droppedWheels.filter(w => !wheelsToRemove.includes(w.id));

    // Save high score periodically
    this.saveHighScore();
  }

  private addScorePopup(x: number, y: number, text: string, color: string): void {
    this.scorePopups.push({ x, y, text, age: 0, color });
  }

  private updateScorePopups(deltaTime: number): void {
    for (const popup of this.scorePopups) {
      popup.age += deltaTime;
      popup.y -= 30 * deltaTime; // Float upward
    }
    this.scorePopups = this.scorePopups.filter((p) => p.age < 1);
  }

  private async loadLeaderboard(): Promise<void> {
    this.leaderboardLoading = true;
    try {
      // Load both leaderboards in parallel
      const [normal, hard] = await Promise.all([
        fetchLeaderboard('normal'),
        fetchLeaderboard('hard')
      ]);
      this.normalLeaderboard = normal;
      this.hardLeaderboard = hard;
      // Also set the main leaderboard based on selected difficulty
      if (this.selectedDifficulty) {
        this.leaderboard = this.selectedDifficulty === 'normal' ? normal : hard;
      }
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      this.normalLeaderboard = [];
      this.hardLeaderboard = [];
      this.leaderboard = [];
    }
    this.leaderboardLoading = false;
  }

  private async handleScoreSubmit(): Promise<void> {
    if (this.submitState !== 'idle' || this.playerInitials.length !== 3 || !this.selectedDifficulty) return;

    this.submitState = 'submitting';
    const token = generateGameToken(this.state.score, this.gameStartTime);

    try {
      const result = await submitScore(this.playerInitials, this.state.score, token, this.selectedDifficulty);
      if (result.success) {
        this.submitState = 'submitted';
        this.submitRank = result.rank || null;
        // Use the leaderboard from the response to avoid cache issues
        if (result.leaderboard) {
          this.leaderboard = result.leaderboard;
        } else {
          // Fallback to fetching if leaderboard not in response
          await this.loadLeaderboard();
        }
      } else {
        this.submitState = 'error';
        console.error('Submit failed:', result.error);
      }
    } catch (error) {
      this.submitState = 'error';
      console.error('Submit error:', error);
    }
  }

  private drawDebris(debris: SatelliteDebris): void {
    const ctx = this.renderer.ctx;
    const size = DEBRIS_SIZE;

    // Draw as a broken satellite piece - metallic with some blinking
    ctx.save();
    ctx.translate(debris.x, debris.y);

    // Main body - dark metallic
    ctx.fillStyle = '#556677';
    ctx.fillRect(-size / 2, -size / 2, size, size);

    // Highlight
    ctx.fillStyle = '#88aacc';
    ctx.fillRect(-size / 2, -size / 2, size / 3, size / 3);

    // Broken solar panel stub
    ctx.fillStyle = '#334488';
    ctx.fillRect(size / 2, -size / 4, size / 3, size / 2);

    // Blinking indicator if on ground (collectible)
    if (debris.isOnGround) {
      const blink = Math.sin(Date.now() / 150) > 0;
      if (blink) {
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(0, -size / 2 - 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  handleMouseMove(x: number, y: number): void {
    // Check hover on difficulty buttons when on start screen
    if (!this.state.isStarted && this.state.welcomeStage === 1) {
      this.hoveredDifficulty = null;
      if (this.difficultyButtons.normal) {
        const btn = this.difficultyButtons.normal;
        if (x >= btn.x && x <= btn.x + btn.width && y >= btn.y && y <= btn.y + btn.height) {
          this.hoveredDifficulty = 'normal';
        }
      }
      if (this.difficultyButtons.hard) {
        const btn = this.difficultyButtons.hard;
        if (x >= btn.x && x <= btn.x + btn.width && y >= btn.y && y <= btn.y + btn.height) {
          this.hoveredDifficulty = 'hard';
        }
      }
      return;
    }

    if (!this.state.isStarted || this.state.isPaused) return;
    this.telescope.setTargetPoint({ x, y });
  }

  handleClick(x: number, y: number): void {
    // Close leaderboard overlay on click
    if (this.showLeaderboardOverlay) {
      this.showLeaderboardOverlay = false;
      return;
    }

    // Handle game over screen button clicks
    if (this.state.isGameOver && this.initialsInputActive && this.submitState === 'idle') {
      // Check submit button
      if (this.gameOverButtons.submit && this.playerInitials.length === 3) {
        const btn = this.gameOverButtons.submit;
        if (x >= btn.x && x <= btn.x + btn.width && y >= btn.y && y <= btn.y + btn.height) {
          this.handleScoreSubmit();
          return;
        }
      }
      // Check skip button
      if (this.gameOverButtons.skip) {
        const btn = this.gameOverButtons.skip;
        if (x >= btn.x && x <= btn.x + btn.width && y >= btn.y && y <= btn.y + btn.height) {
          this.reset();
          return;
        }
      }
    }

    if (!this.state.isStarted) {
      if (this.state.welcomeStage === 0) {
        // First click: enable audio, start music, show combined screen
        this.audio.enable();
        this.audio.startMenuMusic();
        this.state.welcomeStage = 1;
        this.loadLeaderboard(); // Load default leaderboard
      } else if (this.state.welcomeStage === 1) {
        // Check if clicked on difficulty buttons - starts game immediately
        if (this.difficultyButtons.normal) {
          const btn = this.difficultyButtons.normal;
          if (x >= btn.x && x <= btn.x + btn.width && y >= btn.y && y <= btn.y + btn.height) {
            this.selectedDifficulty = 'normal';
            this.state.highScore = this.loadHighScore();
            this.start();
            return;
          }
        }
        if (this.difficultyButtons.hard) {
          const btn = this.difficultyButtons.hard;
          if (x >= btn.x && x <= btn.x + btn.width && y >= btn.y && y <= btn.y + btn.height) {
            this.selectedDifficulty = 'hard';
            this.state.highScore = this.loadHighScore();
            this.start();
            return;
          }
        }
      }
    } else if (this.state.isPaused) {
      this.resume();
    }
  }

  handleMouseDown(button: number): void {
    if (!this.state.isStarted || this.state.isPaused || this.state.isGameOver) return;

    this.heldMouseButtons.add(button);

    // First-held-wins: only the first button pressed takes effect
    if (this.activeMouseButton !== null) return;

    this.activeMouseButton = button;

    if (button === 0) {
      // Left click: unblank beam for observation
      this.state.isBeamBlanked = false;
    } else if (button === 2) {
      // Right click: activate radar
      this.state.isRadarActive = true;
    }
  }

  handleMouseUp(button: number): void {
    this.heldMouseButtons.delete(button);

    // Only respond to the button that was active
    if (this.activeMouseButton !== button) return;

    // Deactivate current action
    if (button === 0) {
      this.state.isBeamBlanked = true;
    } else if (button === 2) {
      this.state.isRadarActive = false;
    }

    // Check if other button is still held and transition to it
    const otherButton = button === 0 ? 2 : 0;
    if (this.heldMouseButtons.has(otherButton)) {
      this.activeMouseButton = otherButton;
      if (otherButton === 0) {
        this.state.isBeamBlanked = false;
      } else {
        this.state.isRadarActive = true;
      }
    } else {
      this.activeMouseButton = null;
    }
  }

  handleKeyDown(key: string): void {
    // Handle initials input during game over
    if (this.state.isGameOver && this.initialsInputActive && this.submitState === 'idle') {
      // Letters A-Z
      if (/^[a-zA-Z]$/.test(key) && this.playerInitials.length < 3) {
        this.playerInitials += key.toUpperCase();
        return;
      }
      // Backspace
      if (key === 'Backspace' && this.playerInitials.length > 0) {
        this.playerInitials = this.playerInitials.slice(0, -1);
        return;
      }
      // Enter to submit
      if (key === 'Enter' && this.playerInitials.length === 3) {
        this.handleScoreSubmit();
        return;
      }
    }

    if (key === 'Escape' || key === 'p' || key === 'P') {
      if (this.state.isStarted && !this.state.isGameOver) {
        this.togglePause();
      }
    }
    if (key === 'r' || key === 'R') {
      if (this.state.isStarted) {
        // Only allow restart during game over if not inputting initials or already submitted
        if (this.state.isGameOver && this.initialsInputActive && this.submitState === 'idle' && this.playerInitials.length > 0) {
          return; // Block R during initials input (could be typing "R")
        }
        this.reset();
      }
    }

    // L to toggle leaderboard (on start screen, pause, or game over after submit)
    if (key === 'l' || key === 'L') {
      // Don't allow during initials input (could be typing "L")
      if (this.state.isGameOver && this.initialsInputActive && this.submitState === 'idle') {
        return;
      }
      // Allow on start screen, pause screen, or game over
      if (!this.state.isStarted || this.state.isPaused || this.state.isGameOver) {
        this.showLeaderboardOverlay = !this.showLeaderboardOverlay;
        if (this.showLeaderboardOverlay) {
          this.loadLeaderboard();
        }
      }
    }

    // Escape also closes leaderboard overlay
    if (key === 'Escape' && this.showLeaderboardOverlay) {
      this.showLeaderboardOverlay = false;
      return;
    }

    // WASD movement (only when game is active)
    if (this.state.isStarted && !this.state.isPaused && !this.state.isGameOver) {
      this.keysHeld.add(key.toLowerCase());
      this.updateMovement();

      // Jump with W or Space
      if (key === 'w' || key === 'W' || key === ' ') {
        this.telescope.jump();
      }
    }
  }

  handleKeyUp(key: string): void {
    this.keysHeld.delete(key.toLowerCase());
    this.updateMovement();
  }

  private updateMovement(): void {
    const left = this.keysHeld.has('a');
    const right = this.keysHeld.has('d');
    this.telescope.setMovement(left, right);
  }

  draw(): void {
    // Clear and draw background
    this.renderer.clear();
    this.renderer.drawStars();
    this.renderer.drawGround();

    // Draw satellite flash overlay if hit
    if (this.satelliteFlash > 0) {
      this.renderer.ctx.fillStyle = `rgba(255, 0, 0, ${this.satelliteFlash * 0.3})`;
      this.renderer.ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);
    }

    // Draw game objects
    this.sources.draw();
    this.satellites.draw();
    this.groundhogs.draw();
    this.deer.draw();
    this.ufos.draw();

    // Draw satellite debris
    for (const debris of this.satelliteDebris) {
      this.drawDebris(debris);
    }

    // Draw dropped wheels
    for (const wheel of this.droppedWheels) {
      drawDroppedWheel(this.renderer, wheel.x, wheel.y, wheel.isOnGround);
    }

    // Draw telescope (unless exploded)
    if (!this.state.isGameOver || this.explosionProgress < 0.3) {
      this.telescope.draw();
      this.telescope.drawBeamIndicators(this.state.isBeamBlanked, this.state.isRadarActive);
    }

    // Draw wheel explosions
    for (const explosion of this.wheelExplosions) {
      drawWheelExplosion(this.renderer, explosion.x, explosion.y, explosion.progress);
    }

    // Draw explosion if game over
    if (this.state.isGameOver) {
      drawExplosion(
        this.renderer,
        this.telescope.state.x,
        this.telescope.state.y - 50,
        Math.min(1, this.explosionProgress)
      );
    }

    // Draw score popups
    for (const popup of this.scorePopups) {
      const alpha = 1 - popup.age;
      this.renderer.ctx.globalAlpha = alpha;
      this.renderer.drawText(popup.text, popup.x, popup.y, popup.color, 20, 'center');
      this.renderer.ctx.globalAlpha = 1;
    }

    // Draw UI
    this.drawUI();

    // Draw overlays
    if (!this.state.isStarted) {
      this.drawStartScreen();
    } else if (this.state.isPaused) {
      this.drawPauseScreen();
    } else if (this.state.isGameOver && this.explosionProgress > 0.5) {
      this.drawGameOverScreen();
    }

    // Draw leaderboard overlay (on top of everything)
    if (this.showLeaderboardOverlay) {
      this.drawLeaderboardOverlay();
    }
  }

  private drawUI(): void {
    const padding = 20;

    // Dollars
    this.renderer.drawText(`DOLLARS: ${formatDollars(this.state.score)}`, padding, padding, '#00ff00', 24);

    // Show radar cost indicator when radar is active (flashes each second)
    const radarBlocked = this.state.radarDisabledTimer > 0 || this.state.score <= 0;
    if (this.state.isRadarActive && !radarBlocked) {
      const flash = Math.floor(this.state.elapsedTime * 2) % 2 === 0;
      if (flash) {
        this.renderer.drawText('(-$10/s)', padding + 200, padding, '#ff4444', 20);
      }
    }

    // High score
    this.renderer.drawText(
      `HIGH: ${formatDollars(this.state.highScore)}`,
      padding,
      padding + 30,
      '#888888',
      18
    );

    // Difficulty level and mode
    const diffConfig = this.getDifficultyConfig();
    const modeColor = this.selectedDifficulty === 'normal' ? '#00ff00' : '#ff6666';
    this.renderer.drawText(
      `${diffConfig.label.toUpperCase()} - LEVEL ${Math.floor(this.state.difficultyLevel)}`,
      this.renderer.width - padding,
      padding,
      modeColor,
      18,
      'right'
    );

    // Time
    const minutes = Math.floor(this.state.elapsedTime / 60);
    const seconds = Math.floor(this.state.elapsedTime % 60);
    this.renderer.drawText(
      `TIME: ${minutes}:${seconds.toString().padStart(2, '0')}`,
      this.renderer.width - padding,
      padding + 25,
      '#888888',
      16,
      'right'
    );

    // Controls hint
    if (this.state.isStarted && !this.state.isPaused && !this.state.isGameOver) {
      this.renderer.drawText(
        '[A/D] Move  [W/SPACE] Jump  [LEFT CLICK] Observe  [RIGHT CLICK] Radar  [P] Pause  [R] Restart',
        this.renderer.width / 2,
        this.renderer.height - 20,
        '#aaaaaa',
        14,
        'center'
      );
    }

    // Show wheel count
    if (this.state.isStarted) {
      const activeWheels = this.telescope.state.wheels.filter(w => !w.damaged).length;
      const wheelColor = activeWheels <= 2 ? '#ff4444' : activeWheels <= 4 ? '#ffaa00' : '#888888';
      this.renderer.drawText(
        `WHEELS: ${activeWheels}/8`,
        this.renderer.width - 20,
        padding + 50,
        wheelColor,
        16,
        'right'
      );

      // Show debris and dropped wheels count if any on ground
      const debrisOnGround = this.satelliteDebris.filter(d => d.isOnGround).length;
      const wheelsOnGround = this.droppedWheels.filter(w => w.isOnGround).length;
      let salvageY = padding + 75;

      if (debrisOnGround > 0) {
        this.renderer.drawText(
          `DEBRIS: ${debrisOnGround} (roll over to salvage)`,
          this.renderer.width - 20,
          salvageY,
          '#88aaff',
          14,
          'right'
        );
        salvageY += 20;
      }

      if (wheelsOnGround > 0) {
        this.renderer.drawText(
          `DROPPED WHEELS: ${wheelsOnGround} (roll over to recover)`,
          this.renderer.width - 20,
          salvageY,
          '#88ff88',
          14,
          'right'
        );
      }
    }
  }

  private drawStartScreen(): void {
    // Darken background
    this.renderer.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.renderer.ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

    const centerX = this.renderer.width / 2;
    const centerY = this.renderer.height / 2;

    if (this.state.welcomeStage === 0) {
      // Stage 0: Title screen
      this.renderer.drawText('GBT OBSERVING', centerX, centerY - 80, '#00ff00', 56, 'center');

      this.renderer.drawText(
        'Guide the Green Bank Telescope to observe cosmic sources',
        centerX,
        centerY,
        '#cccccc',
        20,
        'center'
      );
      this.renderer.drawText(
        'while avoiding satellites, groundhogs, deer, and UFOs!',
        centerX,
        centerY + 30,
        '#cccccc',
        20,
        'center'
      );

      this.renderer.drawText('Click to continue', centerX, centerY + 150, '#ffffff', 24, 'center');

      // Credits
      this.renderer.drawText(
        'Thomas Chamberlin: Prompts  •  Claude Opus 4.5: Code  •  Paul Marganian: Music',
        centerX,
        this.renderer.height - 45,
        '#888888',
        12,
        'center'
      );

      // Disclaimer
      this.renderer.drawText(
        'Not affiliated with Green Bank Observatory',
        centerX,
        this.renderer.height - 20,
        '#666666',
        12,
        'center'
      );
    } else {
      // Stage 1: Instructions + both leaderboards with difficulty buttons
      const col1X = this.renderer.width * 0.2;   // How to Play
      const col2X = this.renderer.width * 0.5;   // Normal leaderboard
      const col3X = this.renderer.width * 0.8;   // Hard leaderboard

      // Load high scores for both difficulties
      const normalHighScore = parseInt(localStorage.getItem(`${HIGH_SCORE_KEY_PREFIX}_normal`) || '0', 10);
      const hardHighScore = parseInt(localStorage.getItem(HIGH_SCORE_KEY_PREFIX) || '0', 10);

      // Instructions column
      this.renderer.drawText('HOW TO PLAY', col1X, 80, '#00ff00', 24, 'center');

      const instructions = [
        'Mouse: aim beam',
        'A/D: move left/right',
        'W/SPACE: jump',
        '',
        'LEFT CLICK: observe',
        '(beam blanked by default)',
        '',
        'RIGHT CLICK: radar',
        '(destroys enemies, $10/s)',
        '',
        'Avoid satellites!',
        'They reset observations',
        '',
        'Roll over debris',
        'to salvage wheels',
      ];

      for (let i = 0; i < instructions.length; i++) {
        this.renderer.drawText(
          instructions[i]!,
          col1X,
          120 + i * 22,
          '#cccccc',
          14,
          'center'
        );
      }

      // Normal leaderboard column with button
      const buttonWidth = 160;
      const buttonHeight = 55;
      const normalButtonX = col2X - buttonWidth / 2;
      const hardButtonX = col3X - buttonWidth / 2;
      const buttonsY = 60;

      // Pulse effect for buttons (disabled when hovered)
      const pulse = (Math.sin(Date.now() / 300) + 1) / 2; // 0 to 1

      // Normal button - grow and stop pulsing on hover
      const normalHovered = this.hoveredDifficulty === 'normal';
      const normalGrow = normalHovered ? 6 : 0;
      const normalPulseAlpha = normalHovered ? 1.0 : 0.5 + pulse * 0.5;
      const normalLineWidth = normalHovered ? 3 : 2 + pulse;
      const normalBtnX = normalButtonX - normalGrow / 2;
      const normalBtnY = buttonsY - normalGrow / 2;
      const normalBtnW = buttonWidth + normalGrow;
      const normalBtnH = buttonHeight + normalGrow;

      this.renderer.ctx.fillStyle = normalHovered ? '#2a442a' : '#223322';
      this.renderer.ctx.fillRect(normalBtnX, normalBtnY, normalBtnW, normalBtnH);
      this.renderer.ctx.strokeStyle = `rgba(68, 204, 68, ${normalPulseAlpha})`;
      this.renderer.ctx.lineWidth = normalLineWidth;
      this.renderer.ctx.strokeRect(normalBtnX, normalBtnY, normalBtnW, normalBtnH);
      const normalBtnCenterY = buttonsY + buttonHeight / 2;
      this.renderer.drawText('NORMAL', col2X, normalBtnCenterY - 6, '#00ff00', normalHovered ? 22 : 20, 'center');
      const normalBestText = normalHighScore > 0 ? formatDollars(normalHighScore) : 'N/A';
      this.renderer.drawText(normalBestText, col2X, normalBtnCenterY + 14, '#ffff00', normalHovered ? 14 : 13, 'center');
      this.difficultyButtons.normal = { x: normalBtnX, y: normalBtnY, width: normalBtnW, height: normalBtnH };

      // Normal leaderboard
      const leaderboardStartY = buttonsY + buttonHeight + 20;
      if (this.leaderboardLoading) {
        this.renderer.drawText('Loading...', col2X, leaderboardStartY + 20, '#888888', 14, 'center');
      } else if (this.normalLeaderboard.length === 0) {
        this.renderer.drawText('No scores yet', col2X, leaderboardStartY + 20, '#888888', 14, 'center');
        this.renderer.drawText('Be the first!', col2X, leaderboardStartY + 40, '#888888', 14, 'center');
      } else {
        for (let i = 0; i < this.normalLeaderboard.length; i++) {
          const entry = this.normalLeaderboard[i]!;
          const y = leaderboardStartY + i * 24;
          const rankColor = i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#888888';

          this.renderer.drawText(`${entry.rank}.`, col2X - 70, y, rankColor, 16, 'right');
          this.renderer.drawText(entry.name, col2X - 50, y, '#ffffff', 16, 'left');
          this.renderer.drawText(formatDollars(entry.score), col2X + 70, y, '#00ff00', 16, 'right');
        }
      }

      // Hard button - grow and stop pulsing on hover
      const hardHovered = this.hoveredDifficulty === 'hard';
      const hardGrow = hardHovered ? 6 : 0;
      const hardPulseAlpha = hardHovered ? 1.0 : 0.5 + pulse * 0.5;
      const hardLineWidth = hardHovered ? 3 : 2 + pulse;
      const hardBtnX = hardButtonX - hardGrow / 2;
      const hardBtnY = buttonsY - hardGrow / 2;
      const hardBtnW = buttonWidth + hardGrow;
      const hardBtnH = buttonHeight + hardGrow;

      this.renderer.ctx.fillStyle = hardHovered ? '#442a2a' : '#332222';
      this.renderer.ctx.fillRect(hardBtnX, hardBtnY, hardBtnW, hardBtnH);
      this.renderer.ctx.strokeStyle = `rgba(204, 68, 68, ${hardPulseAlpha})`;
      this.renderer.ctx.lineWidth = hardLineWidth;
      this.renderer.ctx.strokeRect(hardBtnX, hardBtnY, hardBtnW, hardBtnH);
      const hardBtnCenterY = buttonsY + buttonHeight / 2;
      this.renderer.drawText('HARD', col3X, hardBtnCenterY - 6, '#ff4444', hardHovered ? 22 : 20, 'center');
      const hardBestText = hardHighScore > 0 ? formatDollars(hardHighScore) : 'N/A';
      this.renderer.drawText(hardBestText, col3X, hardBtnCenterY + 14, '#ffff00', hardHovered ? 14 : 13, 'center');
      this.difficultyButtons.hard = { x: hardBtnX, y: hardBtnY, width: hardBtnW, height: hardBtnH };

      // Hard leaderboard
      if (this.leaderboardLoading) {
        this.renderer.drawText('Loading...', col3X, leaderboardStartY + 20, '#888888', 14, 'center');
      } else if (this.hardLeaderboard.length === 0) {
        this.renderer.drawText('No scores yet', col3X, leaderboardStartY + 20, '#888888', 14, 'center');
        this.renderer.drawText('Be the first!', col3X, leaderboardStartY + 40, '#888888', 14, 'center');
      } else {
        for (let i = 0; i < this.hardLeaderboard.length; i++) {
          const entry = this.hardLeaderboard[i]!;
          const y = leaderboardStartY + i * 24;
          const rankColor = i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#888888';

          this.renderer.drawText(`${entry.rank}.`, col3X - 70, y, rankColor, 16, 'right');
          this.renderer.drawText(entry.name, col3X - 50, y, '#ffffff', 16, 'left');
          this.renderer.drawText(formatDollars(entry.score), col3X + 70, y, '#00ff00', 16, 'right');
        }
      }

      // Click to start hint
      this.renderer.drawText('Click NORMAL or HARD to start', centerX, this.renderer.height - 70, '#ffffff', 20, 'center');

      // Credits
      this.renderer.drawText(
        'Thomas Chamberlin: Prompts  •  Claude Opus 4.5: Code  •  Paul Marganian: Music',
        centerX,
        this.renderer.height - 45,
        '#888888',
        12,
        'center'
      );

      // Disclaimer
      this.renderer.drawText(
        'Not affiliated with Green Bank Observatory',
        centerX,
        this.renderer.height - 20,
        '#666666',
        12,
        'center'
      );
    }
  }

  private drawPauseScreen(): void {
    // Darken background
    this.renderer.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.renderer.ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

    const centerX = this.renderer.width / 2;
    const centerY = this.renderer.height / 2;

    this.renderer.drawText('PAUSED', centerX, centerY - 30, '#ffff00', 48, 'center');
    this.renderer.drawText('Click or press P to resume', centerX, centerY + 30, '#cccccc', 18, 'center');
    this.renderer.drawText('Press R to restart', centerX, centerY + 60, '#888888', 16, 'center');
    this.renderer.drawText('[L] Leaderboard', centerX, centerY + 90, '#888888', 14, 'center');
  }

  private drawGameOverScreen(): void {
    // Darken background
    this.renderer.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    this.renderer.ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

    const centerX = this.renderer.width / 2;
    let y = 50;

    // Title
    this.renderer.drawText('GAME OVER', centerX, y, '#ff4444', 42, 'center');
    y += 40;

    // Difficulty mode
    const diffConfig = this.getDifficultyConfig();
    const modeColor = this.selectedDifficulty === 'normal' ? '#00ff00' : '#ff6666';
    this.renderer.drawText(`Difficulty: ${diffConfig.label}`, centerX, y, modeColor, 16, 'center');
    y += 25;

    // Cause of death
    this.renderer.drawText('All wheels destroyed!', centerX, y, '#ff8888', 16, 'center');
    y += 35;

    // Final score
    this.renderer.drawText(`Final: ${formatDollars(this.state.score)}`, centerX, y, '#ffffff', 28, 'center');
    y += 40;

    // Initials input section
    if (this.initialsInputActive) {
      if (this.submitState === 'idle') {
        this.renderer.drawText('ENTER INITIALS:', centerX, y, '#ffff00', 16, 'center');
        y += 25;

        // Draw initials boxes
        const boxWidth = 36;
        const boxHeight = 44;
        const boxSpacing = 8;
        const totalWidth = 3 * boxWidth + 2 * boxSpacing;
        const startX = centerX - totalWidth / 2;
        const boxTop = y;

        for (let i = 0; i < 3; i++) {
          const boxX = startX + i * (boxWidth + boxSpacing);
          const char = this.playerInitials[i] || '';

          // Box background
          this.renderer.ctx.fillStyle = '#222244';
          this.renderer.ctx.fillRect(boxX, boxTop, boxWidth, boxHeight);
          this.renderer.ctx.strokeStyle = i === this.playerInitials.length ? '#ffff00' : '#444488';
          this.renderer.ctx.lineWidth = 2;
          this.renderer.ctx.strokeRect(boxX, boxTop, boxWidth, boxHeight);

          // Letter (vertically centered in box)
          const textY = boxTop + boxHeight / 2 + 8; // offset for text baseline
          if (char) {
            this.renderer.drawText(char, boxX + boxWidth / 2, textY, '#ffffff', 28, 'center');
          } else if (i === this.playerInitials.length) {
            // Blinking cursor
            const showCursor = Math.floor(this.cursorBlink * 3) % 2 === 0;
            if (showCursor) {
              this.renderer.drawText('_', boxX + boxWidth / 2, textY, '#ffff00', 28, 'center');
            }
          }
        }
        y += boxHeight + 10;

        // Typing hint
        this.renderer.drawText('Type A-Z, [BACKSPACE] to delete', centerX, y, '#888888', 11, 'center');
        y += 20;

        // Submit and Skip buttons
        const buttonWidth = 90;
        const buttonHeight = 32;
        const buttonSpacing = 20;
        const buttonsY = y;

        // Submit button (only clickable when 3 initials entered)
        const submitX = centerX - buttonWidth - buttonSpacing / 2;
        const submitEnabled = this.playerInitials.length === 3;
        this.renderer.ctx.fillStyle = submitEnabled ? '#228822' : '#333333';
        this.renderer.ctx.fillRect(submitX, buttonsY, buttonWidth, buttonHeight);
        this.renderer.ctx.strokeStyle = submitEnabled ? '#44cc44' : '#555555';
        this.renderer.ctx.lineWidth = 2;
        this.renderer.ctx.strokeRect(submitX, buttonsY, buttonWidth, buttonHeight);
        this.renderer.drawText('SUBMIT', submitX + buttonWidth / 2, buttonsY + buttonHeight / 2 + 5, submitEnabled ? '#ffffff' : '#666666', 14, 'center');
        this.gameOverButtons.submit = { x: submitX, y: buttonsY, width: buttonWidth, height: buttonHeight };

        // Skip button
        const skipX = centerX + buttonSpacing / 2;
        this.renderer.ctx.fillStyle = '#442222';
        this.renderer.ctx.fillRect(skipX, buttonsY, buttonWidth, buttonHeight);
        this.renderer.ctx.strokeStyle = '#884444';
        this.renderer.ctx.lineWidth = 2;
        this.renderer.ctx.strokeRect(skipX, buttonsY, buttonWidth, buttonHeight);
        this.renderer.drawText('SKIP', skipX + buttonWidth / 2, buttonsY + buttonHeight / 2 + 5, '#cccccc', 14, 'center');
        this.gameOverButtons.skip = { x: skipX, y: buttonsY, width: buttonWidth, height: buttonHeight };

        y += buttonHeight + 15;
      } else if (this.submitState === 'submitting') {
        this.gameOverButtons.submit = null;
        this.gameOverButtons.skip = null;
        this.renderer.drawText('Submitting...', centerX, y, '#ffff00', 18, 'center');
        y += 35;
      } else if (this.submitState === 'submitted') {
        this.gameOverButtons.submit = null;
        this.gameOverButtons.skip = null;
        if (this.submitRank) {
          if (this.submitRank <= 10) {
            this.renderer.drawText(`Ranked #${this.submitRank}!`, centerX, y, '#00ff00', 20, 'center');
          } else {
            this.renderer.drawText(`Ranked #${this.submitRank} - Keep trying!`, centerX, y, '#ffaa00', 16, 'center');
          }
        } else {
          this.renderer.drawText('Score submitted!', centerX, y, '#00ff00', 18, 'center');
        }
        y += 35;
      } else if (this.submitState === 'error') {
        this.gameOverButtons.submit = null;
        this.gameOverButtons.skip = null;
        this.renderer.drawText('Submit failed - try again later', centerX, y, '#ff4444', 14, 'center');
        y += 35;
      }

      // Leaderboard section with difficulty label
      this.renderer.drawText(`--- TOP 10 (${diffConfig.label.toUpperCase()}) ---`, centerX, y, '#888888', 14, 'center');
      y += 22;

      if (this.leaderboardLoading) {
        this.renderer.drawText('Loading...', centerX, y, '#666666', 12, 'center');
      } else if (this.leaderboard.length === 0) {
        this.renderer.drawText('No scores yet - be the first!', centerX, y, '#666666', 12, 'center');
      } else {
        for (const entry of this.leaderboard) {
          const isPlayer = this.submitState === 'submitted' &&
            entry.name === this.playerInitials &&
            entry.score === this.state.score;

          const color = isPlayer ? '#ffff00' : '#cccccc';
          const marker = isPlayer ? ' <-- YOU' : '';

          const rankStr = `#${entry.rank}`;
          const scoreStr = formatDollars(entry.score);
          const line = `${rankStr.padEnd(4)} ${entry.name}    ${scoreStr}${marker}`;

          this.renderer.drawText(line, centerX, y, color, 13, 'center');
          y += 18;
        }
      }
    }

    // Restart hint at bottom - only show when not in initials input mode
    if (this.submitState !== 'idle') {
      const restartY = this.renderer.height - 30;
      this.renderer.drawText('[R] Play Again', centerX, restartY, '#888888', 14, 'center');
    }
  }

  private drawLeaderboardOverlay(): void {
    // Darken background
    this.renderer.ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    this.renderer.ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

    const centerX = this.renderer.width / 2;
    const centerY = this.renderer.height / 2;

    // Title with difficulty
    const diffConfig = this.getDifficultyConfig();
    this.renderer.drawText(`LEADERBOARD (${diffConfig.label.toUpperCase()})`, centerX, centerY - 180, '#ffff00', 36, 'center');

    this.renderer.drawText('--- TOP 10 ---', centerX, centerY - 130, '#888888', 16, 'center');

    if (this.leaderboardLoading) {
      this.renderer.drawText('Loading...', centerX, centerY, '#666666', 18, 'center');
    } else if (this.leaderboard.length === 0) {
      this.renderer.drawText('No scores yet - be the first!', centerX, centerY, '#666666', 18, 'center');
    } else {
      // Draw entries with proper column alignment
      const startY = centerY - 100;
      const lineHeight = 26;

      for (const entry of this.leaderboard) {
        const y = startY + (entry.rank - 1) * lineHeight;
        const rankStr = entry.rank <= 9 ? ` #${entry.rank}` : `#${entry.rank}`;
        const scoreStr = formatDollars(entry.score).padStart(10);

        // Draw rank, name, score as separate elements for alignment
        this.renderer.drawText(rankStr, centerX - 80, y, '#888888', 18, 'left');
        this.renderer.drawText(entry.name, centerX - 20, y, '#ffffff', 18, 'center');
        this.renderer.drawText(scoreStr, centerX + 100, y, '#00ff00', 18, 'right');
      }
    }

    // Close hint
    this.renderer.drawText('[L] or [ESC] Close', centerX, this.renderer.height - 40, '#888888', 14, 'center');
  }
}
