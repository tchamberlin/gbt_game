// Science source spawning and management

import type { Source, SourceType, DifficultyConfig } from './types.ts';
import { SOURCE_CONFIGS } from './types.ts';
import type { Renderer } from './renderer.ts';
import { drawSource } from './sprites.ts';
import { ObjectPool } from './object-pool.ts';

const SOURCE_TYPES: SourceType[] = ['pulsar', 'maser', 'quasar', 'galaxy'];

export class SourceManager {
  private sourcePool: ObjectPool<Source>;
  private nextId: number = 0;
  private renderer: Renderer;
  private spawnTimer: number = 0;
  private frbTimer: number = 0;
  private baseSpawnInterval: number = 2.0; // seconds between spawns
  private frbBaseInterval: number = 8.0;  // seconds between FRB chances
  private currentConfig: DifficultyConfig | null = null;

  constructor(renderer: Renderer) {
    this.renderer = renderer;

    // Initialize object pool
    this.sourcePool = new ObjectPool<Source>(
      () => this.createEmptySource(),
      (source) => this.resetSource(source),
      30 // Pre-allocate 30 sources
    );
  }

  private createEmptySource(): Source {
    return {
      id: 0,
      type: 'pulsar',
      x: 0,
      y: 0,
      size: 0,
      observationTime: 0,
      observedTime: 0,
      points: 0,
      basePoints: 0,
      speed: 0,
      color: '',
      age: 0,
      isComplete: false,
      satellitePenalized: false,
    };
  }

  private resetSource(source: Source): void {
    source.observedTime = 0;
    source.age = 0;
    source.isComplete = false;
    source.satellitePenalized = false;
  }

  update(deltaTime: number, _difficultyMultiplier: number, config: DifficultyConfig): void {
    // Store config for spawning
    this.currentConfig = config;

    // Update spawn timers
    this.spawnTimer += deltaTime;
    this.frbTimer += deltaTime;

    // Spawn regular sources (constant rate, not affected by difficulty)
    if (this.spawnTimer >= this.baseSpawnInterval) {
      this.spawnTimer = 0;
      this.spawnRandomSource();
    }

    // Spawn FRBs occasionally (constant rate, not affected by difficulty)
    if (this.frbTimer >= this.frbBaseInterval) {
      this.frbTimer = 0;
      if (Math.random() < 0.5) { // 50% chance when timer triggers
        this.spawnFRB();
      }
    }

    // Update all sources and collect ones to remove
    const toRemove: Source[] = [];
    const groundY = this.renderer.getGroundY();

    for (const source of this.sourcePool.getActive()) {
      source.x -= source.speed * deltaTime;
      source.age += deltaTime;

      // Check removal conditions
      if (source.x < -50 ||
          source.y >= groundY ||
          (source.type === 'frb' && source.lifetime && source.age >= source.lifetime)) {
        toRemove.push(source);
      }
    }

    // Release removed sources back to pool
    for (const source of toRemove) {
      this.sourcePool.release(source);
    }
  }

  private spawnRandomSource(): void {
    const type = SOURCE_TYPES[Math.floor(Math.random() * SOURCE_TYPES.length)]!;
    this.spawnSource(type);
  }

  private spawnSource(type: SourceType): void {
    const sourceConfig = SOURCE_CONFIGS[type];
    const groundY = this.renderer.getGroundY();

    // Spawn in the sky portion (upper 70% of screen before ground)
    const minY = 50;
    const maxY = groundY - 100;
    const y = minY + Math.random() * (maxY - minY);

    // Apply observation time multiplier from difficulty config
    const obsTimeMultiplier = this.currentConfig?.observationTimeMultiplier ?? 1.0;

    // Acquire from pool and configure
    const source = this.sourcePool.acquire();
    source.id = this.nextId++;
    source.type = type;
    source.x = this.renderer.width + sourceConfig.size;
    source.y = y;
    source.size = sourceConfig.size;
    source.observationTime = sourceConfig.observationTime * obsTimeMultiplier;
    source.observedTime = 0;
    source.points = sourceConfig.points;
    source.basePoints = sourceConfig.points;
    source.speed = sourceConfig.speed;
    source.color = sourceConfig.color;
    source.lifetime = sourceConfig.lifetime;
    source.age = 0;
    source.isComplete = false;
    source.satellitePenalized = false;
  }

  private spawnFRB(): void {
    const frbConfig = SOURCE_CONFIGS['frb'];
    const groundY = this.renderer.getGroundY();

    // FRBs can appear anywhere in the sky
    const minY = 80;
    const maxY = groundY - 100;
    const y = minY + Math.random() * (maxY - minY);

    // FRBs appear at random x positions (not just at edge)
    const x = 200 + Math.random() * (this.renderer.width - 400);

    // Apply observation time multiplier from difficulty config
    const obsTimeMultiplier = this.currentConfig?.observationTimeMultiplier ?? 1.0;

    // Acquire from pool and configure
    const source = this.sourcePool.acquire();
    source.id = this.nextId++;
    source.type = 'frb';
    source.x = x;
    source.y = y;
    source.size = frbConfig.size;
    source.observationTime = frbConfig.observationTime * obsTimeMultiplier;
    source.observedTime = 0;
    source.points = frbConfig.points;
    source.basePoints = frbConfig.points;
    source.speed = 0; // FRBs don't move
    source.color = frbConfig.color;
    source.lifetime = frbConfig.lifetime;
    source.age = 0;
    source.isComplete = false;
    source.satellitePenalized = false;
  }

  getSources(): Source[] {
    return Array.from(this.sourcePool.getActive());
  }

  markSourceComplete(id: number): void {
    for (const source of this.sourcePool.getActive()) {
      if (source.id === id) {
        source.isComplete = true;
        break;
      }
    }
  }

  removeSource(id: number): void {
    for (const source of this.sourcePool.getActive()) {
      if (source.id === id) {
        this.sourcePool.release(source);
        break;
      }
    }
  }

  draw(): void {
    for (const source of this.sourcePool.getActive()) {
      const progress = source.observedTime / source.observationTime;
      drawSource(
        this.renderer,
        source.x,
        source.y,
        source.type,
        source.size,
        progress,
        source.age
      );
    }
  }

  reset(): void {
    this.sourcePool.releaseAll();
    this.spawnTimer = 0;
    this.frbTimer = 0;
  }
}
