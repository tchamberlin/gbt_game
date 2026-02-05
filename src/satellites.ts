// Satellite spawning and management

import type { Satellite } from './types.ts';
import type { Renderer } from './renderer.ts';
import { drawSatellite } from './sprites.ts';
import { ObjectPool } from './object-pool.ts';

const BASE_SATELLITE_SPEED = 200; // pixels per second
const SATELLITE_SIZE = 16;
const BASE_SATELLITE_HEALTH = 100; // base health points
const SATELLITE_HEALTH_SCALE = 0.08; // 8% health increase per difficulty level (slow ramp)

export class SatelliteManager {
  private satellitePool: ObjectPool<Satellite>;
  private nextId: number = 0;
  private renderer: Renderer;
  private spawnTimer: number = 0;
  private baseSpawnInterval: number = 3.0; // seconds between spawns

  constructor(renderer: Renderer) {
    this.renderer = renderer;

    // Initialize object pool
    this.satellitePool = new ObjectPool<Satellite>(
      () => this.createEmptySatellite(),
      (satellite) => this.resetSatellite(satellite),
      20 // Pre-allocate 20 satellites
    );
  }

  private createEmptySatellite(): Satellite {
    return {
      id: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: SATELLITE_SIZE,
      wasHit: false,
      blinkPhase: 0,
      health: BASE_SATELLITE_HEALTH,
      maxHealth: BASE_SATELLITE_HEALTH,
      hasBeenDamaged: false,
    };
  }

  private resetSatellite(satellite: Satellite): void {
    satellite.wasHit = false;
    satellite.blinkPhase = 0;
    satellite.health = BASE_SATELLITE_HEALTH;
    satellite.maxHealth = BASE_SATELLITE_HEALTH;
    satellite.hasBeenDamaged = false;
  }

  private getScaledHealth(difficultyMultiplier: number): number {
    // Slow health ramp: 8% increase per difficulty level
    return Math.floor(BASE_SATELLITE_HEALTH * (1 + (difficultyMultiplier - 1) * SATELLITE_HEALTH_SCALE));
  }

  update(deltaTime: number, difficultyMultiplier: number): void {
    // Update spawn timer
    this.spawnTimer += deltaTime;

    // Spawn satellites more frequently as difficulty increases
    const spawnInterval = this.baseSpawnInterval / difficultyMultiplier;
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer = 0;
      this.spawnSatellite(difficultyMultiplier);
    }

    // Update all satellites and collect ones to remove
    const toRemove: Satellite[] = [];
    const margin = 50;

    for (const satellite of this.satellitePool.getActive()) {
      satellite.x += satellite.vx * deltaTime;
      satellite.y += satellite.vy * deltaTime;
      satellite.blinkPhase += deltaTime;

      // Check if off screen
      if (satellite.x < -margin ||
          satellite.x > this.renderer.width + margin ||
          satellite.y < -margin ||
          satellite.y > this.renderer.height + margin) {
        toRemove.push(satellite);
      }
    }

    // Release removed satellites back to pool
    for (const satellite of toRemove) {
      this.satellitePool.release(satellite);
    }
  }

  private spawnSatellite(difficultyMultiplier: number): void {
    const groundY = this.renderer.getGroundY();
    const skyHeight = groundY - 50;
    const minSkyY = 50;  // minimum y to stay in sky
    const maxSkyY = skyHeight - 100;  // maximum y to stay well above ground

    // Only spawn from left or right edges (no top spawning)
    const spawnEdge = Math.floor(Math.random() * 2); // 0: left, 1: right

    let x: number, y: number, vx: number, vy: number;
    const speed = BASE_SATELLITE_SPEED * (0.8 + Math.random() * 0.4) * (1 + (difficultyMultiplier - 1) * 0.15);

    // Spawn at random height in sky
    y = minSkyY + Math.random() * (maxSkyY - minSkyY);

    // Calculate max allowed vy to ensure satellite stays in sky
    // Time to cross screen horizontally: screenWidth / speed
    const crossTime = this.renderer.width / speed;
    // Max vertical distance that keeps us in sky bounds
    const maxVerticalTravel = Math.min(y - minSkyY, maxSkyY - y);
    const maxVyMagnitude = maxVerticalTravel / crossTime * 0.8; // 80% safety margin

    // Slight angle but constrained to stay in sky
    vy = (Math.random() - 0.5) * 2 * maxVyMagnitude;

    if (spawnEdge === 0) {
      // Left edge - move right
      x = -SATELLITE_SIZE;
      vx = speed;
    } else {
      // Right edge - move left
      x = this.renderer.width + SATELLITE_SIZE;
      vx = -speed;
    }

    // Acquire from pool and configure
    const scaledHealth = this.getScaledHealth(difficultyMultiplier);
    const satellite = this.satellitePool.acquire();
    satellite.id = this.nextId++;
    satellite.x = x;
    satellite.y = y;
    satellite.vx = vx;
    satellite.vy = vy;
    satellite.size = SATELLITE_SIZE;
    satellite.wasHit = false;
    satellite.blinkPhase = Math.random() * Math.PI * 2;
    satellite.health = scaledHealth;
    satellite.maxHealth = scaledHealth;
    satellite.hasBeenDamaged = false;
  }

  getSatellites(): Satellite[] {
    return Array.from(this.satellitePool.getActive());
  }

  markSatelliteHit(id: number): void {
    for (const satellite of this.satellitePool.getActive()) {
      if (satellite.id === id) {
        satellite.wasHit = true;
        break;
      }
    }
  }

  removeSatellite(id: number): void {
    for (const satellite of this.satellitePool.getActive()) {
      if (satellite.id === id) {
        this.satellitePool.release(satellite);
        break;
      }
    }
  }

  // Damage a satellite, returns true if destroyed
  damageSatellite(id: number, damage: number): boolean {
    for (const satellite of this.satellitePool.getActive()) {
      if (satellite.id === id) {
        satellite.hasBeenDamaged = true;
        satellite.health -= damage;
        if (satellite.health <= 0) {
          this.satellitePool.release(satellite);
          return true;
        }
        return false;
      }
    }
    return false;
  }

  draw(): void {
    for (const satellite of this.satellitePool.getActive()) {
      drawSatellite(
        this.renderer,
        satellite.x,
        satellite.y,
        satellite.size,
        satellite.blinkPhase,
        satellite.health / satellite.maxHealth,  // health ratio 0-1
        satellite.hasBeenDamaged
      );
    }
  }

  reset(): void {
    this.satellitePool.releaseAll();
    this.spawnTimer = 0;
  }
}
