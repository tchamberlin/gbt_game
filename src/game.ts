// Game state management, scoring, and difficulty

import type { GameState, SatelliteDebris } from './types.ts';
import type { Renderer } from './renderer.ts';
import { Telescope } from './telescope.ts';
import { SourceManager } from './sources.ts';
import { SatelliteManager } from './satellites.ts';
import { GroundhogManager } from './groundhogs.ts';
import { AudioManager } from './audio.ts';
import { processCollisions, checkGroundhogCollision, beamIntersectsGroundhog } from './collision.ts';
import { drawExplosion, drawWheelExplosion } from './sprites.ts';

const DIFFICULTY_INTERVAL = 30; // seconds between difficulty increases
const SATELLITE_PENALTY_RATE = 30; // dollars per second while satellite in beam
const HIGH_SCORE_KEY = 'gbt_observations_high_dollars';
const OBSERVATION_BONUS_RATE = 10; // base dollars per second while observing source
const WHEEL_COST = 10_000; // cost to repair a wheel
const RADAR_COST_RATE = 10; // dollars per second while radar is active
const RADAR_DAMAGE_RATE = 100; // damage per second to enemies in beam
const SATELLITE_DESTRUCTION_FINE = 500; // fine for destroying a satellite
const DEBRIS_GRAVITY = 300; // pixels per second squared
const DEBRIS_SIZE = 12; // size of debris for collision

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

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.telescope = new Telescope(renderer);
    this.sources = new SourceManager(renderer);
    this.satellites = new SatelliteManager(renderer);
    this.groundhogs = new GroundhogManager(renderer);
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
    };
  }

  private loadHighScore(): number {
    const stored = localStorage.getItem(HIGH_SCORE_KEY);
    return stored ? parseInt(stored, 10) : 0;
  }

  private saveHighScore(): void {
    if (this.state.score > this.state.highScore) {
      this.state.highScore = this.state.score;
      localStorage.setItem(HIGH_SCORE_KEY, this.state.highScore.toString());
    }
  }

  start(): void {
    this.state.isStarted = true;
    this.state.isPaused = false;
    this.audio.enable();
    this.reset();
  }

  reset(): void {
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
    this.telescope = new Telescope(this.renderer);
    this.scorePopups = [];
    this.explosionProgress = 0;
    this.keysHeld.clear();
    this.wheelExplosions = [];
    this.heldMouseButtons.clear();
    this.activeMouseButton = null;
    this.satelliteDebris = [];
    this.radarCostAccumulator = 0;
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
      return;
    }

    // Update elapsed time and difficulty
    this.state.elapsedTime += deltaTime;
    this.state.difficultyLevel = 1 + Math.floor(this.state.elapsedTime / DIFFICULTY_INTERVAL) * 0.2;

    // Update telescope (includes movement and jumping)
    this.telescope.update(deltaTime);

    // Track FRB count before update
    const frbCountBefore = this.sources.getSources().filter((s) => s.type === 'frb').length;

    // Update game objects
    this.sources.update(deltaTime, this.state.difficultyLevel);
    this.satellites.update(deltaTime, this.state.difficultyLevel);
    this.groundhogs.update(deltaTime, this.state.difficultyLevel, this.telescope.state.x);

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

      // Calculate damage this frame
      const damage = RADAR_DAMAGE_RATE * deltaTime;

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

    // Reset ALL source timers when satellite enters beam (not blanked and not radar)
    if (collisions.newSatellitesInBeam.length > 0 && !this.state.isBeamBlanked && !this.state.isRadarActive) {
      // Reset ALL sources with any observation progress
      for (const source of this.sources.getSources()) {
        if (!source.isComplete && source.observedTime > 0) {
          source.observedTime = 0;
        }
      }
      this.addScorePopup(
        this.renderer.width / 2,
        100,
        'ALL OBSERVATIONS RESET!',
        '#ff8800'
      );
      this.audio.playSatelliteHit();
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
        this.addScorePopup(groundhog.x, groundhog.y - 30, '+50 STOMP!', '#00ff00');
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
          this.saveHighScore();
        }
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

    // Auto-purchase wheel repairs
    const hasDamagedWheel = this.telescope.state.wheels.some(w => w.damaged);
    if (hasDamagedWheel && this.state.score >= WHEEL_COST) {
      if (this.telescope.repairWheel()) {
        this.state.score -= WHEEL_COST;
        this.addScorePopup(
          this.renderer.width / 2,
          150,
          `-${formatDollars(WHEEL_COST)} WHEEL REPAIRED!`,
          '#00ff88'
        );
        this.audio.playSourceComplete(100);
      }
    }

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
    if (!this.state.isStarted || this.state.isPaused) return;
    this.telescope.setTargetPoint({ x, y });
  }

  handleClick(): void {
    if (!this.state.isStarted) {
      this.start();
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
    if (key === 'Escape' || key === 'p' || key === 'P') {
      if (this.state.isStarted && !this.state.isGameOver) {
        this.togglePause();
      }
    }
    if (key === 'r' || key === 'R') {
      if (this.state.isStarted) {
        this.reset();
      }
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

    // Draw satellite debris
    for (const debris of this.satelliteDebris) {
      this.drawDebris(debris);
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

    // Difficulty level
    this.renderer.drawText(
      `LEVEL: ${Math.floor(this.state.difficultyLevel)}`,
      this.renderer.width - padding,
      padding,
      '#ffff00',
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
        '#444444',
        14,
        'center'
      );
    }

    // Show wheel count
    if (this.state.isStarted) {
      const activeWheels = this.telescope.state.wheels.filter(w => !w.damaged).length;
      const wheelColor = activeWheels <= 2 ? '#ff4444' : activeWheels <= 4 ? '#ffaa00' : '#888888';
      this.renderer.drawText(
        `WHEELS: ${activeWheels}/8 (${formatDollars(WHEEL_COST)} each)`,
        this.renderer.width - 20,
        padding + 50,
        wheelColor,
        16,
        'right'
      );

      // Show debris count if any on ground
      const debrisOnGround = this.satelliteDebris.filter(d => d.isOnGround).length;
      if (debrisOnGround > 0) {
        this.renderer.drawText(
          `DEBRIS: ${debrisOnGround} (roll over to salvage)`,
          this.renderer.width - 20,
          padding + 75,
          '#88aaff',
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

    // Title
    this.renderer.drawText('GBT OBSERVING', centerX, centerY - 130, '#00ff00', 48, 'center');

    // Instructions
    const instructions = [
      'Move mouse to aim the telescope beam',
      'A/D to move left/right, W/SPACE to jump',
      'LEFT CLICK to observe sources (beam blanked by default)',
      'RIGHT CLICK for radar to destroy enemies ($10/s)',
      'Avoid satellites - they reset your observations!',
      `Wheels auto-repair for ${formatDollars(WHEEL_COST)} when damaged`,
      '',
      'Click to start',
    ];

    for (let i = 0; i < instructions.length; i++) {
      this.renderer.drawText(
        instructions[i]!,
        centerX,
        centerY - 60 + i * 25,
        '#cccccc',
        18,
        'center'
      );
    }

    // High score
    if (this.state.highScore > 0) {
      this.renderer.drawText(
        `High Score: ${formatDollars(this.state.highScore)}`,
        centerX,
        centerY + 160,
        '#ffff00',
        20,
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
  }

  private drawGameOverScreen(): void {
    // Darken background
    this.renderer.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.renderer.ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

    const centerX = this.renderer.width / 2;
    const centerY = this.renderer.height / 2;

    // Title
    this.renderer.drawText('GAME OVER', centerX, centerY - 80, '#ff4444', 56, 'center');

    // Cause of death
    this.renderer.drawText('All wheels destroyed!', centerX, centerY - 30, '#ff8888', 24, 'center');

    // Final score
    this.renderer.drawText(`Final: ${formatDollars(this.state.score)}`, centerX, centerY + 20, '#ffffff', 32, 'center');

    // High score
    if (this.state.score >= this.state.highScore) {
      this.renderer.drawText('NEW HIGH SCORE!', centerX, centerY + 60, '#ffff00', 24, 'center');
    } else {
      this.renderer.drawText(`High Score: ${formatDollars(this.state.highScore)}`, centerX, centerY + 60, '#888888', 20, 'center');
    }

    // Restart hint
    this.renderer.drawText('Press R to play again', centerX, centerY + 110, '#cccccc', 18, 'center');
  }
}
