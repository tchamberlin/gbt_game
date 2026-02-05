// Deer spawning and management

import type { Deer, DifficultyConfig } from './types.ts';
import type { Renderer } from './renderer.ts';
import { drawDeer } from './sprites.ts';
import { ObjectPool } from './object-pool.ts';

const DEER_BASE_SPAWN_INTERVAL = 10.0; // seconds between spawns (slower start)
const DEER_BASE_SPEED = 180; // pixels per second (faster than groundhogs)
const DEER_HEALTH = 150; // health points (more than groundhogs)

export const DEER_RADIUS = 25; // collision radius (larger than groundhogs)

export class DeerManager {
  private deerPool: ObjectPool<Deer>;
  private nextId: number = 0;
  private renderer: Renderer;
  private spawnTimer: number = 0;
  private elapsedTime: number = 0;

  constructor(renderer: Renderer) {
    this.renderer = renderer;

    // Initialize object pool
    this.deerPool = new ObjectPool<Deer>(
      () => this.createEmptyDeer(),
      (deer) => this.resetDeer(deer),
      10 // Pre-allocate 10 deer
    );
  }

  private createEmptyDeer(): Deer {
    return {
      id: 0,
      x: 0,
      y: 0,
      speed: 0,
      direction: 1,
      wasHit: false,
      health: DEER_HEALTH,
      hasBeenDamaged: false,
    };
  }

  private resetDeer(deer: Deer): void {
    deer.wasHit = false;
    deer.health = DEER_HEALTH;
    deer.hasBeenDamaged = false;
  }

  update(deltaTime: number, difficultyLevel: number, gbtX: number, config: DifficultyConfig): void {
    this.elapsedTime += deltaTime;
    this.spawnTimer += deltaTime;

    // Only spawn deer at configured minimum level
    if (difficultyLevel >= config.deerMinLevel) {
      // Spawn deer more frequently as difficulty increases
      const difficultyMultiplier = difficultyLevel - config.deerMinLevel + 1;
      // Apply spawn multiplier from config (higher = slower spawns)
      const spawnInterval = (DEER_BASE_SPAWN_INTERVAL * config.deerSpawnMultiplier) / Math.sqrt(difficultyMultiplier);
      if (this.spawnTimer >= spawnInterval) {
        this.spawnTimer = 0;
        this.spawnDeer(difficultyLevel, gbtX, config);
      }
    }

    // Update all deer and collect ones to remove
    const toRemove: Deer[] = [];

    for (const deer of this.deerPool.getActive()) {
      // Move toward or past GBT
      deer.x += deer.speed * deer.direction * deltaTime;

      // Check removal conditions
      if (deer.wasHit ||
          (deer.direction === 1 && deer.x > this.renderer.width + 50) ||
          (deer.direction === -1 && deer.x < -50)) {
        toRemove.push(deer);
      }
    }

    // Release removed deer back to pool
    for (const deer of toRemove) {
      this.deerPool.release(deer);
    }
  }

  private spawnDeer(difficultyLevel: number, gbtX: number, config: DifficultyConfig): void {
    const groundY = this.renderer.getGroundY();

    // Spawn from left or right side, moving toward GBT
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -30 : this.renderer.width + 30;
    const direction: 1 | -1 = fromLeft ? 1 : -1;

    // Speed increases with difficulty
    const difficultyMultiplier = difficultyLevel - config.deerMinLevel + 1;
    const speed = DEER_BASE_SPEED * (0.8 + Math.random() * 0.4) * Math.sqrt(difficultyMultiplier);

    // Acquire from pool and configure
    const deer = this.deerPool.acquire();
    deer.id = this.nextId++;
    deer.x = x;
    deer.y = groundY;
    deer.speed = speed;
    deer.direction = direction;
    deer.wasHit = false;
    deer.health = DEER_HEALTH;
    deer.hasBeenDamaged = false;
  }

  getDeer(): Deer[] {
    return Array.from(this.deerPool.getActive());
  }

  markDeerHit(id: number): void {
    for (const deer of this.deerPool.getActive()) {
      if (deer.id === id) {
        deer.wasHit = true;
        break;
      }
    }
  }

  removeDeer(id: number): void {
    for (const deer of this.deerPool.getActive()) {
      if (deer.id === id) {
        this.deerPool.release(deer);
        break;
      }
    }
  }

  // Damage a deer, returns true if destroyed
  damageDeer(id: number, damage: number): boolean {
    for (const deer of this.deerPool.getActive()) {
      if (deer.id === id) {
        deer.hasBeenDamaged = true;
        deer.health -= damage;
        if (deer.health <= 0) {
          this.deerPool.release(deer);
          return true;
        }
        return false;
      }
    }
    return false;
  }

  draw(): void {
    for (const deer of this.deerPool.getActive()) {
      drawDeer(
        this.renderer,
        deer.x,
        deer.y,
        deer.direction,
        this.elapsedTime,
        deer.health / DEER_HEALTH,  // health ratio 0-1
        deer.hasBeenDamaged
      );
    }
  }

  reset(): void {
    this.deerPool.releaseAll();
    this.spawnTimer = 0;
    this.elapsedTime = 0;
  }
}
