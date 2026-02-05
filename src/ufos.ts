// UFO spawning and management

import type { UFO, UFOState } from './types.ts';
import type { Renderer } from './renderer.ts';
import { drawUFO } from './sprites.ts';
import { ObjectPool } from './object-pool.ts';

const UFO_BASE_SPAWN_INTERVAL = 12.0; // seconds between spawns (slower start)
const UFO_HORIZONTAL_SPEED = 100; // pixels per second while approaching
const UFO_DIVE_SPEED = 300; // pixels per second while diving
const UFO_RETREAT_SPEED = 200; // pixels per second while retreating
const UFO_HEALTH = 30; // low health (easy to kill with radar)
const UFO_MIN_LEVEL = 4; // minimum difficulty level to spawn

export const UFO_RADIUS = 20; // collision radius

export class UFOManager {
  private ufoPool: ObjectPool<UFO>;
  private nextId: number = 0;
  private renderer: Renderer;
  private spawnTimer: number = 0;
  private elapsedTime: number = 0;

  constructor(renderer: Renderer) {
    this.renderer = renderer;

    // Initialize object pool
    this.ufoPool = new ObjectPool<UFO>(
      () => this.createEmptyUFO(),
      (ufo) => this.resetUFO(ufo),
      15 // Pre-allocate 15 UFOs
    );
  }

  private createEmptyUFO(): UFO {
    return {
      id: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      state: 'approaching',
      targetX: 0,
      health: UFO_HEALTH,
      hasBeenDamaged: false,
      wasHit: false,
      stolenWheels: 0,
    };
  }

  private resetUFO(ufo: UFO): void {
    ufo.state = 'approaching';
    ufo.health = UFO_HEALTH;
    ufo.hasBeenDamaged = false;
    ufo.wasHit = false;
    ufo.stolenWheels = 0;
  }

  update(deltaTime: number, difficultyLevel: number, gbtX: number, gbtY: number): void {
    this.elapsedTime += deltaTime;
    this.spawnTimer += deltaTime;

    // Only spawn UFOs at level 3 or higher
    if (difficultyLevel >= UFO_MIN_LEVEL) {
      // Spawn UFOs more frequently as difficulty increases
      const difficultyMultiplier = difficultyLevel - UFO_MIN_LEVEL + 1;
      const spawnInterval = UFO_BASE_SPAWN_INTERVAL / Math.sqrt(difficultyMultiplier);
      if (this.spawnTimer >= spawnInterval) {
        this.spawnTimer = 0;
        this.spawnUFO(difficultyLevel, gbtX);
      }
    }

    // Update all UFOs and collect ones to remove
    const toRemove: UFO[] = [];
    const groundY = this.renderer.getGroundY();

    for (const ufo of this.ufoPool.getActive()) {
      // Update target position (track GBT x position)
      ufo.targetX = gbtX;

      switch (ufo.state) {
        case 'approaching':
          // Move horizontally toward GBT
          ufo.x += ufo.vx * deltaTime;

          // Check if we're above the GBT position (within range to dive)
          const distanceToTarget = Math.abs(ufo.x - ufo.targetX);
          if (distanceToTarget < 50) {
            // Start diving
            ufo.state = 'diving';
            ufo.vx = 0;
            ufo.vy = UFO_DIVE_SPEED;
          }
          break;

        case 'diving':
          // Dive down toward GBT
          ufo.y += ufo.vy * deltaTime;

          // Slight horizontal tracking while diving
          const dx = ufo.targetX - ufo.x;
          ufo.x += dx * 2 * deltaTime;

          // Check if we've reached ground level or passed GBT
          if (ufo.y >= groundY - 50) {
            // Start retreating (missed or hit)
            ufo.state = 'retreating';
            ufo.vy = -UFO_RETREAT_SPEED;
            ufo.vx = (Math.random() - 0.5) * UFO_HORIZONTAL_SPEED;
          }
          break;

        case 'retreating':
          // Fly back up and away
          ufo.x += ufo.vx * deltaTime;
          ufo.y += ufo.vy * deltaTime;
          break;

        case 'destroyed':
          toRemove.push(ufo);
          continue;
      }

      // Check removal conditions (off screen)
      if (ufo.y < -100 || ufo.y > this.renderer.height + 100 ||
          ufo.x < -100 || ufo.x > this.renderer.width + 100) {
        toRemove.push(ufo);
      }
    }

    // Release removed UFOs back to pool
    for (const ufo of toRemove) {
      this.ufoPool.release(ufo);
    }
  }

  private spawnUFO(difficultyLevel: number, gbtX: number): void {
    const groundY = this.renderer.getGroundY();
    const skyHeight = groundY - 100;

    // Spawn at top of screen, from left or right edge
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -30 : this.renderer.width + 30;
    const y = 50 + Math.random() * 100; // Near top of screen

    // Move toward center/GBT
    const vx = fromLeft ? UFO_HORIZONTAL_SPEED : -UFO_HORIZONTAL_SPEED;

    // Speed increases slightly with difficulty
    const difficultyMultiplier = difficultyLevel - UFO_MIN_LEVEL + 1;
    const speedMult = 1 + (difficultyMultiplier - 1) * 0.2;

    // Acquire from pool and configure
    const ufo = this.ufoPool.acquire();
    ufo.id = this.nextId++;
    ufo.x = x;
    ufo.y = y;
    ufo.vx = vx * speedMult;
    ufo.vy = 0;
    ufo.state = 'approaching';
    ufo.targetX = gbtX;
    ufo.health = UFO_HEALTH;
    ufo.hasBeenDamaged = false;
    ufo.wasHit = false;
    ufo.stolenWheels = 0;
  }

  getUFOs(): UFO[] {
    return Array.from(this.ufoPool.getActive());
  }

  markUFOHit(id: number): void {
    for (const ufo of this.ufoPool.getActive()) {
      if (ufo.id === id) {
        ufo.wasHit = true;
        break;
      }
    }
  }

  // When UFO takes damage, switch to retreating
  startRetreat(id: number): void {
    for (const ufo of this.ufoPool.getActive()) {
      if (ufo.id === id && ufo.state !== 'retreating') {
        ufo.state = 'retreating';
        ufo.vy = -UFO_RETREAT_SPEED;
        ufo.vx = (Math.random() - 0.5) * UFO_HORIZONTAL_SPEED * 2;
        break;
      }
    }
  }

  removeUFO(id: number): void {
    for (const ufo of this.ufoPool.getActive()) {
      if (ufo.id === id) {
        this.ufoPool.release(ufo);
        break;
      }
    }
  }

  // Set stolen wheels on a UFO
  setUFOStolenWheels(id: number, count: number): void {
    for (const ufo of this.ufoPool.getActive()) {
      if (ufo.id === id) {
        ufo.stolenWheels = count;
        break;
      }
    }
  }

  // Damage a UFO, returns destruction status and dropped wheels
  damageUFO(id: number, damage: number): { destroyed: boolean; droppedWheels: number } {
    for (const ufo of this.ufoPool.getActive()) {
      if (ufo.id === id) {
        ufo.hasBeenDamaged = true;
        ufo.health -= damage;

        // Start retreating when damaged
        if (ufo.state === 'diving' || ufo.state === 'approaching') {
          this.startRetreat(id);
        }

        if (ufo.health <= 0) {
          ufo.state = 'destroyed';
          // Calculate wheel drops: always drop 1, 20% chance to drop 2nd
          let droppedWheels = 0;
          if (ufo.stolenWheels > 0) {
            droppedWheels = 1;
            if (ufo.stolenWheels > 1 && Math.random() < 0.2) {
              droppedWheels = 2;
            }
          }
          this.ufoPool.release(ufo);
          return { destroyed: true, droppedWheels };
        }
        return { destroyed: false, droppedWheels: 0 };
      }
    }
    return { destroyed: false, droppedWheels: 0 };
  }

  draw(): void {
    for (const ufo of this.ufoPool.getActive()) {
      drawUFO(
        this.renderer,
        ufo.x,
        ufo.y,
        ufo.state,
        this.elapsedTime,
        ufo.health / UFO_HEALTH,  // health ratio 0-1
        ufo.hasBeenDamaged,
        ufo.stolenWheels
      );
    }
  }

  reset(): void {
    this.ufoPool.releaseAll();
    this.spawnTimer = 0;
    this.elapsedTime = 0;
  }
}
