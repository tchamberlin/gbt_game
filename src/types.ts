// Core game types

export interface Point {
  x: number;
  y: number;
}

export interface Triangle {
  origin: Point;
  left: Point;
  right: Point;
}

export interface GameState {
  score: number;
  highScore: number;
  elapsedTime: number;
  difficultyLevel: number;
  isPaused: boolean;
  isStarted: boolean;
  isGameOver: boolean;
  isBeamBlanked: boolean;
  isRadarActive: boolean;
  satellitesDestroyed: number;
  radarDisabledTimer: number;
  welcomeStage: number; // 0 = title screen, 1 = instructions screen
}

export interface WheelState {
  damaged: boolean;
}

export interface TelescopeState {
  commandedElevation: number; // degrees, where mouse points
  actualElevation: number;    // degrees, current position
  maxSlewRate: number;        // degrees per second
  x: number;                  // current x position on screen
  y: number;                  // current y position (can change when jumping)
  groundY: number;            // ground level y position
  velocityY: number;          // vertical velocity for jumping
  isGrounded: boolean;        // whether on ground
  wheels: WheelState[];       // 8 wheels, track damage
  movingLeft: boolean;        // A key held
  movingRight: boolean;       // D key held
}

export interface Groundhog {
  id: number;
  x: number;
  y: number;
  speed: number;
  direction: 1 | -1;          // 1 = moving right, -1 = moving left
  wasHit: boolean;            // already collided
  health: number;             // health points (0 = destroyed)
  hasBeenDamaged: boolean;    // true after first damage (shows health bar)
}

export type SourceType = 'pulsar' | 'maser' | 'quasar' | 'galaxy' | 'frb';

export interface SourceConfig {
  type: SourceType;
  size: number;           // radius in pixels
  observationTime: number; // seconds needed to complete observation
  points: number;         // points awarded
  speed: number;          // base pixels per second
  color: string;          // primary color
  lifetime?: number;      // optional: for FRBs, total time before vanishing
}

export interface Source {
  id: number;
  type: SourceType;
  x: number;
  y: number;
  size: number;
  observationTime: number;
  observedTime: number;   // accumulated observation time
  points: number;
  basePoints: number;     // original points before satellite penalty
  speed: number;
  color: string;
  lifetime?: number;
  age: number;            // time since spawn
  isComplete: boolean;    // fully observed
  satellitePenalized: boolean; // true if points already reduced by satellite
}

export interface Satellite {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  wasHit: boolean;        // already penalized this pass
  blinkPhase: number;
  health: number;         // health points (0 = destroyed)
  maxHealth: number;      // max health for this satellite (scales with difficulty)
  hasBeenDamaged: boolean; // true after first damage (shows health bar)
}

export interface SatelliteDebris {
  id: number;
  x: number;
  y: number;
  vy: number;             // falling velocity
  isOnGround: boolean;    // true when landed
}

export interface Deer {
  id: number;
  x: number;
  y: number;
  speed: number;
  direction: 1 | -1;          // 1 = moving right, -1 = moving left
  wasHit: boolean;            // already collided
  health: number;             // health points (0 = destroyed)
  hasBeenDamaged: boolean;    // true after first damage (shows health bar)
}

export type UFOState = 'approaching' | 'diving' | 'retreating' | 'destroyed';

export interface UFO {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: UFOState;
  targetX: number;            // x position to dive toward
  health: number;             // health points (0 = destroyed)
  hasBeenDamaged: boolean;    // true after first damage (shows health bar)
  wasHit: boolean;            // already collided with GBT this pass
  stolenWheels: number;       // 0, 1, or 2 wheels currently carried
}

export interface DroppedWheel {
  id: number;
  x: number;
  y: number;
  vy: number;                 // falling velocity
  isOnGround: boolean;        // true when landed
}

export interface BeamState {
  triangle: Triangle;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  timestamp: number;
}

export interface SubmitResult {
  success: boolean;
  rank?: number;
  error?: string;
  leaderboard?: LeaderboardEntry[];
}

export const SOURCE_CONFIGS: Record<SourceType, Omit<SourceConfig, 'type'>> = {
  pulsar: {
    size: 8,
    observationTime: 1.5,
    points: 100,
    speed: 30,
    color: '#00ffff',
  },
  maser: {
    size: 12,
    observationTime: 2.0,
    points: 150,
    speed: 25,
    color: '#ff00ff',
  },
  quasar: {
    size: 5,
    observationTime: 1.0,
    points: 250,
    speed: 35,
    color: '#ffff00',
  },
  galaxy: {
    size: 20,
    observationTime: 4.0,
    points: 400,
    speed: 15,
    color: '#ff8800',
  },
  frb: {
    size: 10,
    observationTime: 0.5,
    points: 1000,
    speed: 40,
    color: '#ffffff',
    lifetime: 2.0,
  },
};
