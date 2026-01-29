// Satellite spawning and management

import type { Satellite } from './types.ts';
import type { Renderer } from './renderer.ts';
import { drawSatellite } from './sprites.ts';
import { ObjectPool } from './object-pool.ts';

const BASE_SATELLITE_SPEED = 200; // pixels per second
const SATELLITE_SIZE = 16;
const SATELLITE_HEALTH = 100; // health points

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
      health: SATELLITE_HEALTH,
      hasBeenDamaged: false,
    };
  }

  private resetSatellite(satellite: Satellite): void {
    satellite.wasHit = false;
    satellite.blinkPhase = 0;
    satellite.health = SATELLITE_HEALTH;
    satellite.hasBeenDamaged = false;
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

    // Determine spawn edge and trajectory
    const spawnEdge = Math.floor(Math.random() * 3); // 0: left, 1: right, 2: top

    let x: number, y: number, vx: number, vy: number;
    const speed = BASE_SATELLITE_SPEED * (0.8 + Math.random() * 0.4) * difficultyMultiplier;

    switch (spawnEdge) {
      case 0: // Left edge
        x = -SATELLITE_SIZE;
        y = 50 + Math.random() * (skyHeight - 100);
        vx = speed;
        vy = (Math.random() - 0.5) * speed * 0.5;
        break;
      case 1: // Right edge
        x = this.renderer.width + SATELLITE_SIZE;
        y = 50 + Math.random() * (skyHeight - 100);
        vx = -speed;
        vy = (Math.random() - 0.5) * speed * 0.5;
        break;
      case 2: // Top edge
      default:
        x = Math.random() * this.renderer.width;
        y = -SATELLITE_SIZE;
        vx = (Math.random() - 0.5) * speed;
        vy = speed * 0.7;
        break;
    }

    // Acquire from pool and configure
    const satellite = this.satellitePool.acquire();
    satellite.id = this.nextId++;
    satellite.x = x;
    satellite.y = y;
    satellite.vx = vx;
    satellite.vy = vy;
    satellite.size = SATELLITE_SIZE;
    satellite.wasHit = false;
    satellite.blinkPhase = Math.random() * Math.PI * 2;
    satellite.health = SATELLITE_HEALTH;
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
        satellite.health / SATELLITE_HEALTH,  // health ratio 0-1
        satellite.hasBeenDamaged
      );
    }
  }

  reset(): void {
    this.satellitePool.releaseAll();
    this.spawnTimer = 0;
  }
}
