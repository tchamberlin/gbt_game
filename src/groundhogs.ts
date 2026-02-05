// Groundhog spawning and management

import type { Groundhog } from './types.ts';
import type { Renderer } from './renderer.ts';
import { drawGroundhog } from './sprites.ts';
import { ObjectPool } from './object-pool.ts';

const BASE_SPAWN_INTERVAL = 8.0; // seconds between spawns (slower start)
const BASE_SPEED = 120; // pixels per second
const GROUNDHOG_HEALTH = 100; // health points
const GROUNDHOG_MIN_LEVEL = 2; // minimum difficulty level to spawn

export class GroundhogManager {
  private groundhogPool: ObjectPool<Groundhog>;
  private nextId: number = 0;
  private renderer: Renderer;
  private spawnTimer: number = 0;
  private elapsedTime: number = 0;

  constructor(renderer: Renderer) {
    this.renderer = renderer;

    // Initialize object pool
    this.groundhogPool = new ObjectPool<Groundhog>(
      () => this.createEmptyGroundhog(),
      (groundhog) => this.resetGroundhog(groundhog),
      15 // Pre-allocate 15 groundhogs
    );
  }

  private createEmptyGroundhog(): Groundhog {
    return {
      id: 0,
      x: 0,
      y: 0,
      speed: 0,
      direction: 1,
      wasHit: false,
      health: GROUNDHOG_HEALTH,
      hasBeenDamaged: false,
    };
  }

  private resetGroundhog(groundhog: Groundhog): void {
    groundhog.wasHit = false;
    groundhog.health = GROUNDHOG_HEALTH;
    groundhog.hasBeenDamaged = false;
  }

  update(deltaTime: number, difficultyMultiplier: number, gbtX: number): void {
    this.elapsedTime += deltaTime;
    this.spawnTimer += deltaTime;

    // Only spawn groundhogs at level 2 or higher
    if (difficultyMultiplier >= GROUNDHOG_MIN_LEVEL) {
      // Spawn groundhogs more frequently as difficulty increases
      const effectiveDifficulty = difficultyMultiplier - GROUNDHOG_MIN_LEVEL + 1;
      const spawnInterval = BASE_SPAWN_INTERVAL / Math.sqrt(effectiveDifficulty);
      if (this.spawnTimer >= spawnInterval) {
        this.spawnTimer = 0;
        this.spawnGroundhog(difficultyMultiplier, gbtX);
      }
    }

    // Update all groundhogs and collect ones to remove
    const toRemove: Groundhog[] = [];

    for (const groundhog of this.groundhogPool.getActive()) {
      // Move toward or past GBT
      groundhog.x += groundhog.speed * groundhog.direction * deltaTime;

      // Check removal conditions
      if (groundhog.wasHit ||
          (groundhog.direction === 1 && groundhog.x > this.renderer.width + 50) ||
          (groundhog.direction === -1 && groundhog.x < -50)) {
        toRemove.push(groundhog);
      }
    }

    // Release removed groundhogs back to pool
    for (const groundhog of toRemove) {
      this.groundhogPool.release(groundhog);
    }
  }

  private spawnGroundhog(difficultyMultiplier: number, gbtX: number): void {
    const groundY = this.renderer.getGroundY();

    // Spawn from left or right side, moving toward GBT
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -30 : this.renderer.width + 30;
    const direction: 1 | -1 = fromLeft ? 1 : -1;

    // Speed increases with difficulty
    const speed = BASE_SPEED * (0.8 + Math.random() * 0.4) * Math.sqrt(difficultyMultiplier);

    // Acquire from pool and configure
    const groundhog = this.groundhogPool.acquire();
    groundhog.id = this.nextId++;
    groundhog.x = x;
    groundhog.y = groundY;
    groundhog.speed = speed;
    groundhog.direction = direction;
    groundhog.wasHit = false;
    groundhog.health = GROUNDHOG_HEALTH;
    groundhog.hasBeenDamaged = false;
  }

  getGroundhogs(): Groundhog[] {
    return Array.from(this.groundhogPool.getActive());
  }

  markGroundhogHit(id: number): void {
    for (const groundhog of this.groundhogPool.getActive()) {
      if (groundhog.id === id) {
        groundhog.wasHit = true;
        break;
      }
    }
  }

  removeGroundhog(id: number): void {
    for (const groundhog of this.groundhogPool.getActive()) {
      if (groundhog.id === id) {
        this.groundhogPool.release(groundhog);
        break;
      }
    }
  }

  // Damage a groundhog, returns true if destroyed
  damageGroundhog(id: number, damage: number): boolean {
    for (const groundhog of this.groundhogPool.getActive()) {
      if (groundhog.id === id) {
        groundhog.hasBeenDamaged = true;
        groundhog.health -= damage;
        if (groundhog.health <= 0) {
          this.groundhogPool.release(groundhog);
          return true;
        }
        return false;
      }
    }
    return false;
  }

  draw(): void {
    for (const groundhog of this.groundhogPool.getActive()) {
      drawGroundhog(
        this.renderer,
        groundhog.x,
        groundhog.y,
        groundhog.direction,
        this.elapsedTime,
        groundhog.health / GROUNDHOG_HEALTH,  // health ratio 0-1
        groundhog.hasBeenDamaged
      );
    }
  }

  reset(): void {
    this.groundhogPool.releaseAll();
    this.spawnTimer = 0;
    this.elapsedTime = 0;
  }

  spawnInitialGroundhogs(count: number, gbtX: number): void {
    const difficultyMultiplier = 1;  // Starting difficulty
    for (let i = 0; i < count; i++) {
      this.spawnGroundhog(difficultyMultiplier, gbtX);
    }
  }
}
