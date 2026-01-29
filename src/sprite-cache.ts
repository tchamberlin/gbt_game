// Pre-rendered sprite cache using OffscreenCanvas for performance

import type { SourceType } from './types.ts';
import { SOURCE_CONFIGS } from './types.ts';

interface CachedSprite {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  originX: number; // offset from center to draw at
  originY: number;
}

const PULSAR_FRAMES = 16;
const FRB_FRAMES = 20;
const FRB_LIFETIME = 2.0;
const GROUNDHOG_FRAMES = 8;

export class SpriteCache {
  private static instance: SpriteCache;

  // Source sprites
  private maserSprite: CachedSprite | null = null;
  private quasarSprite: CachedSprite | null = null;
  private galaxySprite: CachedSprite | null = null;
  private pulsarFrames: CachedSprite[] = [];
  private frbFrames: CachedSprite[] = [];

  // Entity sprites
  private satelliteSprite: CachedSprite | null = null;
  private groundhogFrames: Map<string, CachedSprite> = new Map(); // "left_0", "right_3", etc.

  // Star field
  private starFieldCanvas: OffscreenCanvas | null = null;

  // Sky gradient (cached)
  private skyGradient: CanvasGradient | null = null;

  static getInstance(): SpriteCache {
    if (!SpriteCache.instance) {
      SpriteCache.instance = new SpriteCache();
    }
    return SpriteCache.instance;
  }

  initialize(): void {
    this.preRenderMaser();
    this.preRenderQuasar();
    this.preRenderGalaxy();
    this.preRenderPulsarFrames();
    this.preRenderFRBFrames();
    this.preRenderSatellite();
    this.preRenderGroundhogFrames();
    this.preRenderStarField();
  }

  private createSprite(width: number, height: number): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  }

  // ============ Source Sprites ============

  private preRenderMaser(): void {
    const size = SOURCE_CONFIGS.maser.size;
    const padding = 2;
    const canvasSize = (size + padding) * 2;
    const { canvas, ctx } = this.createSprite(canvasSize, canvasSize);
    const cx = canvasSize / 2;
    const cy = canvasSize / 2;

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.3, '#ff00ff');
    gradient.addColorStop(1, 'rgba(255, 0, 255, 0.3)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fill();

    this.maserSprite = { canvas, width: canvasSize, height: canvasSize, originX: cx, originY: cy };
  }

  private preRenderQuasar(): void {
    const size = SOURCE_CONFIGS.quasar.size;
    const padding = 6; // extra for ellipse
    const canvasSize = (size + padding) * 2;
    const { canvas, ctx } = this.createSprite(canvasSize, canvasSize);
    const cx = canvasSize / 2;
    const cy = canvasSize / 2;

    // Main circle
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fill();

    // Accretion disk
    ctx.strokeStyle = 'rgba(255, 200, 0, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, size + 4, size / 2, 0.3, 0, Math.PI * 2);
    ctx.stroke();

    this.quasarSprite = { canvas, width: canvasSize, height: canvasSize, originX: cx, originY: cy };
  }

  private preRenderGalaxy(): void {
    const size = SOURCE_CONFIGS.galaxy.size;
    const padding = size * 0.3; // extra for spiral arms
    const canvasSize = (size + padding) * 2;
    const { canvas, ctx } = this.createSprite(canvasSize, canvasSize);
    const cx = canvasSize / 2;
    const cy = canvasSize / 2;

    // Radial gradient
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
    gradient.addColorStop(0, '#ffcc88');
    gradient.addColorStop(0.3, '#ff8844');
    gradient.addColorStop(0.7, 'rgba(255, 100, 50, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 100, 50, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fill();

    // Spiral arms (pre-calculated, no per-frame cost)
    ctx.strokeStyle = 'rgba(255, 200, 150, 0.4)';
    ctx.lineWidth = 2;
    for (let arm = 0; arm < 2; arm++) {
      ctx.beginPath();
      for (let t = 0; t < Math.PI * 1.5; t += 0.1) {
        const r = (t / (Math.PI * 1.5)) * size * 0.8;
        const angle = t + arm * Math.PI;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle) * 0.6;
        if (t === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    this.galaxySprite = { canvas, width: canvasSize, height: canvasSize, originX: cx, originY: cy };
  }

  private preRenderPulsarFrames(): void {
    const size = SOURCE_CONFIGS.pulsar.size;
    const padding = 5; // for outer ring
    const canvasSize = (size + padding) * 2;

    for (let i = 0; i < PULSAR_FRAMES; i++) {
      const { canvas, ctx } = this.createSprite(canvasSize, canvasSize);
      const cx = canvasSize / 2;
      const cy = canvasSize / 2;

      // Calculate brightness for this frame
      const brightness = 0.5 + 0.5 * Math.sin((i / PULSAR_FRAMES) * Math.PI * 2);

      ctx.fillStyle = `rgba(0, 255, 255, ${brightness})`;
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.fill();

      // Outer ring when bright
      if (brightness > 0.7) {
        ctx.strokeStyle = `rgba(0, 255, 255, ${brightness * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, size + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      this.pulsarFrames.push({ canvas, width: canvasSize, height: canvasSize, originX: cx, originY: cy });
    }
  }

  private preRenderFRBFrames(): void {
    const size = SOURCE_CONFIGS.frb.size;
    const padding = size; // FRBs draw at size * 2
    const canvasSize = (size * 2 + padding) * 2;

    for (let i = 0; i < FRB_FRAMES; i++) {
      const { canvas, ctx } = this.createSprite(canvasSize, canvasSize);
      const cx = canvasSize / 2;
      const cy = canvasSize / 2;

      // Calculate brightness for this age
      const age = (i / FRB_FRAMES) * FRB_LIFETIME;
      const flashDuration = 0.3;
      const brightness = age < flashDuration ? 1 : Math.max(0, 1 - (age - flashDuration) * 0.5);

      // Gradient glow
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 2);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${brightness})`);
      gradient.addColorStop(0.5, `rgba(200, 200, 255, ${brightness * 0.7})`);
      gradient.addColorStop(1, `rgba(100, 100, 255, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 2, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.fill();

      this.frbFrames.push({ canvas, width: canvasSize, height: canvasSize, originX: cx, originY: cy });
    }
  }

  // ============ Entity Sprites ============

  private preRenderSatellite(): void {
    const size = 16; // matches satellite size in game
    const padding = size * 1.5;
    const canvasWidth = size * 4;
    const canvasHeight = size;
    const { canvas, ctx } = this.createSprite(canvasWidth, canvasHeight);
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;

    // Body
    ctx.fillStyle = '#666666';
    ctx.fillRect(cx - size / 2, cy - size / 4, size, size / 2);

    // Solar panels
    ctx.fillStyle = '#4444aa';
    ctx.fillRect(cx - size * 1.5, cy - size / 6, size * 0.8, size / 3);
    ctx.fillRect(cx + size * 0.7, cy - size / 6, size * 0.8, size / 3);

    this.satelliteSprite = { canvas, width: canvasWidth, height: canvasHeight, originX: cx, originY: cy };
  }

  private preRenderGroundhogFrames(): void {
    const size = 20;
    const padding = 10;
    const canvasWidth = size + padding * 2;
    const canvasHeight = size + padding;

    for (const direction of [1, -1] as const) {
      for (let frame = 0; frame < GROUNDHOG_FRAMES; frame++) {
        const { canvas, ctx } = this.createSprite(canvasWidth, canvasHeight);
        const cx = canvasWidth / 2;
        const cy = canvasHeight - padding / 2;

        // Animation phase for this frame
        const animPhase = frame / GROUNDHOG_FRAMES;
        const bobOffset = Math.sin(animPhase * Math.PI * 2) * 2;
        const legOffset = Math.sin(animPhase * Math.PI * 4) * 4;

        ctx.save();
        ctx.translate(cx, cy + bobOffset);

        if (direction === -1) {
          ctx.scale(-1, 1);
        }

        // Body
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        ctx.ellipse(0, -size / 3, size / 2, size / 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = '#A0522D';
        ctx.beginPath();
        ctx.arc(size / 3, -size / 2, size / 4, 0, Math.PI * 2);
        ctx.fill();

        // Ear
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        ctx.arc(size / 3 + 4, -size / 2 - 8, 4, 0, Math.PI * 2);
        ctx.fill();

        // Eye
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(size / 3 + 6, -size / 2 - 2, 2, 0, Math.PI * 2);
        ctx.fill();

        // Legs
        ctx.fillStyle = '#654321';
        ctx.fillRect(Math.floor(size / 4 - legOffset), Math.floor(-size / 6), 4, size / 3);
        ctx.fillRect(Math.floor(size / 4 + legOffset + 4), Math.floor(-size / 6), 4, size / 3);
        ctx.fillRect(Math.floor(-size / 4 + legOffset), Math.floor(-size / 6), 4, size / 3);
        ctx.fillRect(Math.floor(-size / 4 - legOffset - 4), Math.floor(-size / 6), 4, size / 3);

        // Tail
        ctx.fillStyle = '#A0522D';
        ctx.beginPath();
        ctx.arc(-size / 2 - 2, -size / 3, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        const key = `${direction === 1 ? 'right' : 'left'}_${frame}`;
        this.groundhogFrames.set(key, { canvas, width: canvasWidth, height: canvasHeight, originX: cx, originY: cy });
      }
    }
  }

  // ============ Star Field ============

  private preRenderStarField(): void {
    const width = 1280;
    const height = Math.floor(720 * 0.7); // Stars only in upper portion
    const { canvas, ctx } = this.createSprite(width, height);

    // Generate and render stars
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const brightness = 0.3 + Math.random() * 0.7;

      ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
      ctx.fillRect(Math.floor(x), Math.floor(y), 2, 2);
    }

    this.starFieldCanvas = canvas;
  }

  // ============ Getters ============

  getSourceSprite(type: SourceType, age: number): CachedSprite {
    switch (type) {
      case 'pulsar': {
        // Select frame based on age (8 Hz blink rate)
        const frameIndex = Math.floor((age * 8) % PULSAR_FRAMES);
        return this.pulsarFrames[frameIndex]!;
      }
      case 'maser':
        return this.maserSprite!;
      case 'quasar':
        return this.quasarSprite!;
      case 'galaxy':
        return this.galaxySprite!;
      case 'frb': {
        // Select frame based on age (0 to 2 seconds)
        const frameIndex = Math.min(FRB_FRAMES - 1, Math.floor((age / FRB_LIFETIME) * FRB_FRAMES));
        return this.frbFrames[frameIndex]!;
      }
    }
  }

  getSatelliteSprite(): CachedSprite {
    return this.satelliteSprite!;
  }

  getGroundhogSprite(direction: 1 | -1, animPhase: number): CachedSprite {
    const frameIndex = Math.floor((animPhase * GROUNDHOG_FRAMES) % GROUNDHOG_FRAMES);
    const key = `${direction === 1 ? 'right' : 'left'}_${frameIndex}`;
    return this.groundhogFrames.get(key)!;
  }

  getStarField(): OffscreenCanvas {
    return this.starFieldCanvas!;
  }

  // Cache sky gradient for a specific context
  getSkyGradient(ctx: CanvasRenderingContext2D, height: number): CanvasGradient {
    if (!this.skyGradient) {
      this.skyGradient = ctx.createLinearGradient(0, 0, 0, height);
      this.skyGradient.addColorStop(0, '#0a0a1a');
      this.skyGradient.addColorStop(0.7, '#0f0f2a');
      this.skyGradient.addColorStop(1, '#1a1a2a');
    }
    return this.skyGradient;
  }
}
