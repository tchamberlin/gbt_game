// Pixel art sprite definitions

import type { Renderer } from './renderer.ts';
import type { SourceType, WheelState } from './types.ts';
import { SpriteCache } from './sprite-cache.ts';
import { animSin } from './lookup-tables.ts';

// GBT color palette
const COLORS = {
  dishLight: '#e0e0e0',
  dishMid: '#b0b0b0',
  dishDark: '#808080',
  structure: '#404040',
  structureLight: '#606060',
  wheel: '#303030',
  wheelHighlight: '#505050',
  feedArm: '#606060',
  feedArmLight: '#808080',
  receiver: '#ff4444',
  ground: '#1a2a1a',
};

// Draw the GBT telescope at a given position and elevation angle
export function drawGBT(
  renderer: Renderer,
  x: number,
  groundY: number,
  elevationDegrees: number,
  wheels: WheelState[] = Array(8).fill({ damaged: false })
): void {
  const ctx = renderer.ctx;

  // Dimensions
  const trackWidth = 180;
  const wheelRadius = 14;
  const wheelCount = 8;
  const baseHeight = 15;
  const towerHeight = 60;
  const dishRadius = 50;

  // Draw wheels with damage states - spread across the track
  const wheelSpacing = trackWidth / (wheelCount - 1);
  for (let i = 0; i < wheelCount; i++) {
    const wx = x - trackWidth / 2 + i * wheelSpacing;
    drawWheel(ctx, wx, groundY - wheelRadius, wheelRadius, wheels[i]?.damaged ?? false);
  }

  // Draw base carriage
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x - trackWidth / 2, groundY - wheelRadius * 2 - baseHeight, trackWidth, baseHeight);

  // Draw support tower (alidade)
  const towerBaseY = groundY - wheelRadius * 2 - baseHeight;
  const towerTopY = towerBaseY - towerHeight;

  ctx.fillStyle = '#252525';
  ctx.beginPath();
  ctx.moveTo(x - 25, towerBaseY);
  ctx.lineTo(x - 12, towerTopY);
  ctx.lineTo(x + 12, towerTopY);
  ctx.lineTo(x + 25, towerBaseY);
  ctx.closePath();
  ctx.fill();

  // Tower detail lines
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const ty = towerBaseY - towerHeight * t;
    const tw = 25 - t * 13;
    ctx.beginPath();
    ctx.moveTo(x - tw, ty);
    ctx.lineTo(x + tw, ty);
    ctx.stroke();
  }

  // Pivot point
  const pivotY = towerTopY;

  // Draw dish (rotated)
  ctx.save();
  ctx.translate(x, pivotY);
  ctx.rotate(-elevationDegrees * Math.PI / 180);

  // Dish - parabolic arc, concave side faces RIGHT (toward beam direction)
  // The curve bulges LEFT so the open/concave side faces right
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, -dishRadius);
  ctx.quadraticCurveTo(-dishRadius * 0.5, 0, 0, dishRadius);
  ctx.stroke();

  // Dish surface detail (inner edge)
  ctx.strokeStyle = '#4a4a4a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-3, -dishRadius + 5);
  ctx.quadraticCurveTo(-dishRadius * 0.4, 0, -3, dishRadius - 5);
  ctx.stroke();

  // Back structure (behind the dish)
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(-dishRadius * 0.5, -20, 20, 40);

  // Feed arm - offset design, from bottom curving to receiver in front of dish
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 3;

  // Main arm from bottom of dish to receiver
  ctx.beginPath();
  ctx.moveTo(-dishRadius * 0.3, dishRadius * 0.7);
  ctx.quadraticCurveTo(dishRadius * 0.3, dishRadius * 0.2, dishRadius * 0.6, -dishRadius * 0.3);
  ctx.stroke();

  // Support strut from top of dish
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-dishRadius * 0.2, -dishRadius * 0.6);
  ctx.lineTo(dishRadius * 0.6, -dishRadius * 0.3);
  ctx.stroke();

  // Receiver at focal point (in front of dish)
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(dishRadius * 0.6, -dishRadius * 0.3, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff4444';
  ctx.beginPath();
  ctx.arc(dishRadius * 0.6, -dishRadius * 0.3, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, damaged: boolean = false): void {
  // Don't draw damaged wheels at all
  if (damaged) {
    return;
  }

  // Wheel body
  ctx.fillStyle = COLORS.wheel;
  ctx.beginPath();
  ctx.arc(Math.floor(x), Math.floor(y), radius, 0, Math.PI * 2);
  ctx.fill();

  // Wheel highlight
  ctx.fillStyle = COLORS.wheelHighlight;
  ctx.beginPath();
  ctx.arc(Math.floor(x), Math.floor(y), radius - 2, 0, Math.PI * 2);
  ctx.fill();

  // Wheel hub
  ctx.fillStyle = COLORS.wheel;
  ctx.beginPath();
  ctx.arc(Math.floor(x), Math.floor(y), 2, 0, Math.PI * 2);
  ctx.fill();
}

// Small explosion for wheel destruction
export function drawWheelExplosion(
  renderer: Renderer,
  x: number,
  y: number,
  progress: number // 0 to 1
): void {
  const ctx = renderer.ctx;
  const maxRadius = 30;
  const radius = maxRadius * progress;
  const alpha = 1 - progress;

  // Flash
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(255, 200, 50, ${alpha})`);
  gradient.addColorStop(0.5, `rgba(255, 100, 0, ${alpha * 0.7})`);
  gradient.addColorStop(1, `rgba(100, 50, 0, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Sparks
  if (progress < 0.7) {
    ctx.fillStyle = `rgba(255, 200, 100, ${alpha})`;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const dist = radius * 0.8;
      ctx.fillRect(x + Math.cos(angle) * dist - 2, y + Math.sin(angle) * dist - 2, 4, 4);
    }
  }
}


// Draw astronomical source sprites using cached OffscreenCanvas
export function drawSource(
  renderer: Renderer,
  x: number,
  y: number,
  type: SourceType,
  size: number,
  observationProgress: number, // 0-1
  age: number
): void {
  const ctx = renderer.ctx;
  const cache = SpriteCache.getInstance();

  // Get pre-rendered sprite from cache
  const sprite = cache.getSourceSprite(type, age);

  // Draw cached sprite centered at x, y
  ctx.drawImage(
    sprite.canvas,
    Math.floor(x - sprite.originX),
    Math.floor(y - sprite.originY)
  );

  // Draw observation progress ring (lightweight, changes every frame)
  if (observationProgress > 0) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, size + 5, -Math.PI / 2, -Math.PI / 2 + observationProgress * Math.PI * 2);
    ctx.stroke();
  }
}

function drawPulsar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  age: number
): void {
  // Pulsars blink rapidly
  const blinkRate = 8; // Hz
  const brightness = 0.5 + 0.5 * Math.sin(age * blinkRate * Math.PI * 2);

  ctx.fillStyle = `rgba(0, 255, 255, ${brightness})`;
  ctx.beginPath();
  ctx.arc(Math.floor(x), Math.floor(y), size, 0, Math.PI * 2);
  ctx.fill();

  // Radio beam effect
  if (brightness > 0.7) {
    ctx.strokeStyle = `rgba(0, 255, 255, ${brightness * 0.5})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(Math.floor(x), Math.floor(y), size + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawMaser(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  // Masers have a steady glow with color gradient
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.3, '#ff00ff');
  gradient.addColorStop(1, 'rgba(255, 0, 255, 0.3)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(Math.floor(x), Math.floor(y), size, 0, Math.PI * 2);
  ctx.fill();
}

function drawQuasar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  // Quasars are small and bright with jets
  ctx.fillStyle = '#ffff00';
  ctx.beginPath();
  ctx.arc(Math.floor(x), Math.floor(y), size, 0, Math.PI * 2);
  ctx.fill();

  // Accretion disk hint
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(Math.floor(x), Math.floor(y), size + 4, size / 2, 0.3, 0, Math.PI * 2);
  ctx.stroke();
}

function drawGalaxy(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  // Spiral galaxy - larger and diffuse
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
  gradient.addColorStop(0, '#ffcc88');
  gradient.addColorStop(0.3, '#ff8844');
  gradient.addColorStop(0.7, 'rgba(255, 100, 50, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 100, 50, 0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(Math.floor(x), Math.floor(y), size, 0, Math.PI * 2);
  ctx.fill();

  // Spiral arms hint
  ctx.strokeStyle = 'rgba(255, 200, 150, 0.4)';
  ctx.lineWidth = 2;
  for (let arm = 0; arm < 2; arm++) {
    ctx.beginPath();
    for (let t = 0; t < Math.PI * 1.5; t += 0.1) {
      const r = (t / (Math.PI * 1.5)) * size * 0.8;
      const angle = t + arm * Math.PI;
      const px = x + r * Math.cos(angle);
      const py = y + r * Math.sin(angle) * 0.6; // Flatten for inclination
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

function drawFRB(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  age: number
): void {
  // FRBs flash brightly then fade
  const flashDuration = 0.3;
  const brightness = age < flashDuration ? 1 : Math.max(0, 1 - (age - flashDuration) * 0.5);

  // Intense white flash
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 2);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${brightness})`);
  gradient.addColorStop(0.5, `rgba(200, 200, 255, ${brightness * 0.7})`);
  gradient.addColorStop(1, `rgba(100, 100, 255, 0)`);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(Math.floor(x), Math.floor(y), size * 2, 0, Math.PI * 2);
  ctx.fill();

  // Core
  ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
  ctx.beginPath();
  ctx.arc(Math.floor(x), Math.floor(y), size, 0, Math.PI * 2);
  ctx.fill();
}

// Draw satellite using cached sprite + dynamic blinking lights
export function drawSatellite(
  renderer: Renderer,
  x: number,
  y: number,
  size: number,
  blinkPhase: number,
  healthRatio: number = 1,  // 0-1, where 1 is full health
  hasBeenDamaged: boolean = false
): void {
  const ctx = renderer.ctx;
  const cache = SpriteCache.getInstance();

  // Draw cached satellite body
  const sprite = cache.getSatelliteSprite();
  ctx.drawImage(
    sprite.canvas,
    Math.floor(x - sprite.originX),
    Math.floor(y - sprite.originY)
  );

  // Blinking lights (dynamic, drawn on top)
  const blink = animSin(blinkPhase * 10 / (Math.PI * 2)) > 0;
  if (blink) {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(Math.floor(x - 2), Math.floor(y - size / 4 - 2), 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.floor(x - size / 2), Math.floor(y - 1), 2, 2);
    ctx.fillRect(Math.floor(x + size / 2 - 2), Math.floor(y - 1), 2, 2);
  }

  // Draw health bar ring (only if damaged, starts full and decreases)
  if (hasBeenDamaged && healthRatio > 0) {
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Arc goes from top, clockwise, showing remaining health
    // Full health = full circle, no health = no arc
    ctx.arc(x, y, size + 5, -Math.PI / 2, -Math.PI / 2 + healthRatio * Math.PI * 2);
    ctx.stroke();
  }
}

// Draw groundhog using cached animation frames
export function drawGroundhog(
  renderer: Renderer,
  x: number,
  y: number,
  direction: 1 | -1,
  animPhase: number,
  healthRatio: number = 1,  // 0-1, where 1 is full health
  hasBeenDamaged: boolean = false
): void {
  const ctx = renderer.ctx;
  const cache = SpriteCache.getInstance();

  // Get pre-rendered animation frame
  const sprite = cache.getGroundhogSprite(direction, animPhase);

  // Draw cached sprite
  ctx.drawImage(
    sprite.canvas,
    Math.floor(x - sprite.originX),
    Math.floor(y - sprite.originY)
  );

  // Draw health bar ring (only if damaged, starts full and decreases)
  if (hasBeenDamaged && healthRatio > 0) {
    const groundhogSize = 15;  // approximate groundhog radius
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Arc goes from top, clockwise, showing remaining health
    ctx.arc(x, y - 10, groundhogSize + 5, -Math.PI / 2, -Math.PI / 2 + healthRatio * Math.PI * 2);
    ctx.stroke();
  }
}

// Draw explosion effect
export function drawExplosion(
  renderer: Renderer,
  x: number,
  y: number,
  progress: number // 0 to 1
): void {
  const ctx = renderer.ctx;

  // Expanding fireball - much larger!
  const maxRadius = 400;
  const radius = maxRadius * Math.pow(progress, 0.7); // Faster initial expansion
  const alpha = Math.max(0, 1 - progress * 0.8);

  // Multiple explosion layers for more dramatic effect
  for (let layer = 0; layer < 3; layer++) {
    const layerRadius = radius * (1 - layer * 0.25);
    const layerAlpha = alpha * (1 - layer * 0.2);

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, layerRadius);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${layerAlpha})`);
    gradient.addColorStop(0.2, `rgba(255, 255, 100, ${layerAlpha * 0.9})`);
    gradient.addColorStop(0.4, `rgba(255, 150, 0, ${layerAlpha * 0.7})`);
    gradient.addColorStop(0.7, `rgba(255, 50, 0, ${layerAlpha * 0.4})`);
    gradient.addColorStop(1, `rgba(100, 0, 0, 0)`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, layerRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Flying debris particles
  if (progress < 0.8) {
    const debrisCount = 24;
    for (let i = 0; i < debrisCount; i++) {
      const angle = (i / debrisCount) * Math.PI * 2 + progress * 2;
      const dist = radius * 0.9 + Math.sin(i * 5) * 30;
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist - progress * 100; // Rise up
      const size = 4 + Math.random() * 6;

      // Debris color varies
      const debrisAlpha = alpha * (1 - progress * 0.5);
      ctx.fillStyle = i % 3 === 0
        ? `rgba(80, 80, 80, ${debrisAlpha})`
        : `rgba(255, 100, 0, ${debrisAlpha})`;
      ctx.fillRect(Math.floor(px - size/2), Math.floor(py - size/2), size, size);
    }
  }

  // Smoke clouds
  if (progress > 0.2) {
    const smokeAlpha = Math.min(0.4, (progress - 0.2) * 0.5) * (1 - progress);
    ctx.fillStyle = `rgba(40, 40, 40, ${smokeAlpha})`;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = radius * 0.6;
      const smokeX = x + Math.cos(angle) * dist;
      const smokeY = y + Math.sin(angle) * dist - progress * 150;
      const smokeRadius = 30 + progress * 50;
      ctx.beginPath();
      ctx.arc(smokeX, smokeY, smokeRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
