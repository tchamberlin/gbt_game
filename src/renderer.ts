// Canvas rendering and pixel art utilities

import { SpriteCache } from './sprite-cache.ts';

const ASPECT_RATIO = 16 / 9;
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number = BASE_WIDTH;
  height: number = BASE_HEIGHT;
  scale: number = 1;

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas ${canvasId} not found`);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');

    this.canvas = canvas;
    this.ctx = ctx;

    this.setupResponsiveCanvas();
    window.addEventListener('resize', () => this.setupResponsiveCanvas());
  }

  private setupResponsiveCanvas(): void {
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;

    let width = containerWidth;
    let height = containerWidth / ASPECT_RATIO;

    if (height > containerHeight) {
      height = containerHeight;
      width = containerHeight * ASPECT_RATIO;
    }

    this.scale = width / BASE_WIDTH;
    this.width = BASE_WIDTH;
    this.height = BASE_HEIGHT;

    this.canvas.width = BASE_WIDTH;
    this.canvas.height = BASE_HEIGHT;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.style.cursor = 'crosshair';

    // Disable anti-aliasing for pixel art
    this.ctx.imageSmoothingEnabled = false;
  }

  clear(): void {
    // Dark sky gradient (cached)
    const gradient = SpriteCache.getInstance().getSkyGradient(this.ctx, this.height);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawStars(): void {
    // Single drawImage call for pre-rendered star field
    const starField = SpriteCache.getInstance().getStarField();
    this.ctx.drawImage(starField, 0, 0);
  }

  drawGround(): void {
    const groundY = this.height * 0.85;

    // Ground
    this.ctx.fillStyle = '#1a2a1a';
    this.ctx.fillRect(0, groundY, this.width, this.height - groundY);

    // Ground line
    this.ctx.fillStyle = '#2a3a2a';
    this.ctx.fillRect(0, groundY, this.width, 3);
  }

  // Pixel art helper - draw a filled rectangle
  drawPixelRect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  }

  // Draw a circle (for beam)
  drawCircle(x: number, y: number, radius: number, color: string, fill: boolean = true): void {
    this.ctx.beginPath();
    this.ctx.arc(Math.floor(x), Math.floor(y), radius, 0, Math.PI * 2);
    if (fill) {
      this.ctx.fillStyle = color;
      this.ctx.fill();
    } else {
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }
  }

  // Draw a plus sign (for commanded position)
  drawPlus(x: number, y: number, size: number, color: string): void {
    this.ctx.fillStyle = color;
    const halfSize = Math.floor(size / 2);
    const thickness = Math.max(2, Math.floor(size / 5));
    const halfThick = Math.floor(thickness / 2);

    // Horizontal bar
    this.ctx.fillRect(
      Math.floor(x) - halfSize,
      Math.floor(y) - halfThick,
      size,
      thickness
    );
    // Vertical bar
    this.ctx.fillRect(
      Math.floor(x) - halfThick,
      Math.floor(y) - halfSize,
      thickness,
      size
    );
  }

  // Draw text with pixel font styling
  drawText(
    text: string,
    x: number,
    y: number,
    color: string,
    size: number = 16,
    align: CanvasTextAlign = 'left'
  ): void {
    this.ctx.fillStyle = color;
    this.ctx.font = `${size}px monospace`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(text, Math.floor(x), Math.floor(y));
  }

  // Get mouse position relative to canvas (accounting for scale)
  getMousePosition(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / this.scale,
      y: (event.clientY - rect.top) / this.scale,
    };
  }

  getTouchPosition(touch: Touch): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (touch.clientX - rect.left) / this.scale,
      y: (touch.clientY - rect.top) / this.scale,
    };
  }

  getGroundY(): number {
    return this.height * 0.85;
  }
}
