// Touch screen controls for mobile/tablet devices

import type { Renderer } from './renderer.ts';

export interface TouchState {
  aimX: number;
  aimY: number;
  isTouching: boolean;
  movingLeft: boolean;
  movingRight: boolean;
  jumpPressed: boolean;
  radarToggled: boolean;
}

type TouchType = 'aim' | 'dpad-left' | 'dpad-right' | 'jump' | 'radar-toggle' | 'fullscreen';

interface TrackedTouch {
  x: number;
  y: number;
  type: TouchType;
}

// Button layout constants (in game coordinates 1280x720)
const DPAD_LEFT_X = 70;
const DPAD_RIGHT_X = 170;
const DPAD_Y = 620;
const DPAD_SIZE = 60;

const JUMP_X = 1200;
const JUMP_Y = 630;
const JUMP_RADIUS = 45;

const RADAR_X = 1200;
const RADAR_Y = 530;
const RADAR_RADIUS = 38;

const FULLSCREEN_SIZE = 36;
const FULLSCREEN_PADDING = 12;

export class TouchControls {
  private renderer: Renderer;
  private isTouchDevice: boolean;
  private activeTouches: Map<number, TrackedTouch> = new Map();
  private radarToggled: boolean = false;
  private isPortrait: boolean = false;
  private isFullscreen: boolean = false;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this.checkOrientation();
    window.addEventListener('resize', () => this.checkOrientation());
    if (screen.orientation) {
      screen.orientation.addEventListener('change', () => this.checkOrientation());
    }

    const updateFullscreen = () => {
      this.isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement);
    };
    document.addEventListener('fullscreenchange', updateFullscreen);
    document.addEventListener('webkitfullscreenchange', updateFullscreen);
    document.addEventListener('mozfullscreenchange', updateFullscreen);
  }

  get touchDevice(): boolean {
    return this.isTouchDevice;
  }

  get portrait(): boolean {
    return this.isPortrait;
  }

  private checkOrientation(): void {
    this.isPortrait = window.innerHeight > window.innerWidth;
  }

  getState(): TouchState {
    let isTouching = false;
    let aimX = 0;
    let aimY = 0;
    let movingLeft = false;
    let movingRight = false;
    let jumpPressed = false;

    for (const touch of this.activeTouches.values()) {
      if (touch.type === 'aim') {
        isTouching = true;
        aimX = touch.x;
        aimY = touch.y;
      } else if (touch.type === 'dpad-left') {
        movingLeft = true;
      } else if (touch.type === 'dpad-right') {
        movingRight = true;
      } else if (touch.type === 'jump') {
        jumpPressed = true;
      }
    }

    return {
      aimX,
      aimY,
      isTouching,
      movingLeft,
      movingRight,
      jumpPressed,
      radarToggled: this.radarToggled,
    };
  }

  getTouchPosition(touch: Touch): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return {
      x: (touch.clientX - rect.left) / this.renderer.scale,
      y: (touch.clientY - rect.top) / this.renderer.scale,
    };
  }

  classifyTouch(x: number, y: number): TouchType {
    // Check fullscreen button first (top-right)
    if (this.hitTestFullscreen(x, y)) {
      return 'fullscreen';
    }

    // Check D-pad left
    if (x >= DPAD_LEFT_X - DPAD_SIZE / 2 && x <= DPAD_LEFT_X + DPAD_SIZE / 2 &&
        y >= DPAD_Y - DPAD_SIZE / 2 && y <= DPAD_Y + DPAD_SIZE / 2) {
      return 'dpad-left';
    }

    // Check D-pad right
    if (x >= DPAD_RIGHT_X - DPAD_SIZE / 2 && x <= DPAD_RIGHT_X + DPAD_SIZE / 2 &&
        y >= DPAD_Y - DPAD_SIZE / 2 && y <= DPAD_Y + DPAD_SIZE / 2) {
      return 'dpad-right';
    }

    // Check jump button
    const jdx = x - JUMP_X;
    const jdy = y - JUMP_Y;
    if (jdx * jdx + jdy * jdy <= JUMP_RADIUS * JUMP_RADIUS) {
      return 'jump';
    }

    // Check radar toggle button
    const rdx = x - RADAR_X;
    const rdy = y - RADAR_Y;
    if (rdx * rdx + rdy * rdy <= RADAR_RADIUS * RADAR_RADIUS) {
      return 'radar-toggle';
    }

    // Everything else is aim
    return 'aim';
  }

  handleTouchStart(id: number, x: number, y: number): TouchType {
    const type = this.classifyTouch(x, y);

    if (type === 'radar-toggle') {
      this.radarToggled = !this.radarToggled;
    }
    // Fullscreen is deferred to touchend for Firefox Android compatibility

    this.activeTouches.set(id, { x, y, type });
    return type;
  }

  handleTouchMove(id: number, x: number, y: number): void {
    const touch = this.activeTouches.get(id);
    if (touch) {
      touch.x = x;
      touch.y = y;
      // Type is locked at touchstart, so we just update position
    }
  }

  handleTouchEnd(id: number): void {
    const touch = this.activeTouches.get(id);
    if (touch?.type === 'fullscreen') {
      this.toggleFullscreen();
    }
    this.activeTouches.delete(id);
  }

  getTouchType(id: number): TouchType | null {
    const touch = this.activeTouches.get(id);
    return touch ? touch.type : null;
  }

  hitTestFullscreen(x: number, y: number): boolean {
    const btnX = this.renderer.width - FULLSCREEN_PADDING - FULLSCREEN_SIZE;
    const btnY = FULLSCREEN_PADDING;
    return x >= btnX && x <= btnX + FULLSCREEN_SIZE &&
           y >= btnY && y <= btnY + FULLSCREEN_SIZE;
  }

  private toggleFullscreen(): void {
    if (this.isFullscreen) {
      const doc = document as any;
      const exit = doc.exitFullscreen?.bind(doc) || doc.webkitExitFullscreen?.bind(doc) || doc.mozCancelFullScreen?.bind(doc);
      if (exit) exit().catch((e: Error) => console.warn('Exit fullscreen failed:', e));
    } else {
      this.requestFullscreen();
    }
  }

  requestFullscreen(): void {
    // Try the game container first, then documentElement as fallback
    const target = document.getElementById('game-container') || document.documentElement;
    const el = target as any;
    const request = el.requestFullscreen?.bind(el)
      || el.webkitRequestFullscreen?.bind(el)
      || el.mozRequestFullScreen?.bind(el);

    if (request) {
      request().then(() => {
        if (screen.orientation && 'lock' in screen.orientation) {
          (screen.orientation as any).lock('landscape').catch(() => {});
        }
      }).catch((e: Error) => console.warn('Fullscreen request failed:', e));
    }
  }

  reset(): void {
    this.activeTouches.clear();
    this.radarToggled = false;
  }

  draw(isGameActive: boolean): void {
    if (!this.isTouchDevice) return;

    this.drawFullscreenButton();

    if (isGameActive) {
      this.drawDpad();
      this.drawJumpButton();
      this.drawRadarToggleButton();
    }
  }

  drawOrientationWarning(): void {
    if (!this.isTouchDevice || !this.isPortrait) return;

    const ctx = this.renderer.ctx;
    const w = this.renderer.width;
    const h = this.renderer.height;

    // Full-screen dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(0, 0, w, h);

    const centerX = w / 2;
    const centerY = h / 2;

    // Draw phone rotation icon
    ctx.save();
    ctx.translate(centerX, centerY - 40);

    // Phone outline (portrait orientation)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(-20, -35, 40, 70);

    // Rotation arrow
    ctx.beginPath();
    ctx.arc(0, 0, 55, -Math.PI * 0.3, Math.PI * 0.3);
    ctx.stroke();
    // Arrow head
    const arrowX = 55 * Math.cos(Math.PI * 0.3);
    const arrowY = 55 * Math.sin(Math.PI * 0.3);
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX - 10, arrowY - 5);
    ctx.lineTo(arrowX - 5, arrowY + 8);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();

    // Text
    this.renderer.drawText('ROTATE YOUR DEVICE', centerX, centerY + 50, '#ffffff', 28, 'center');
    this.renderer.drawText('This game is best played in landscape mode', centerX, centerY + 90, '#888888', 16, 'center');
  }

  private drawFullscreenButton(): void {
    const ctx = this.renderer.ctx;
    const btnX = this.renderer.width - FULLSCREEN_PADDING - FULLSCREEN_SIZE;
    const btnY = FULLSCREEN_PADDING;
    const size = FULLSCREEN_SIZE;

    ctx.save();
    ctx.globalAlpha = 0.5;

    // Background
    ctx.fillStyle = '#333333';
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, size, size, 6);
    ctx.fill();

    // Icon (expand or collapse)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    if (this.isFullscreen) {
      // Collapse icon: arrows pointing inward
      const m = 8;
      const a = 5;
      // Top-left
      ctx.beginPath();
      ctx.moveTo(btnX + m + a, btnY + m); ctx.lineTo(btnX + m, btnY + m); ctx.lineTo(btnX + m, btnY + m + a);
      ctx.stroke();
      // Top-right
      ctx.beginPath();
      ctx.moveTo(btnX + size - m - a, btnY + m); ctx.lineTo(btnX + size - m, btnY + m); ctx.lineTo(btnX + size - m, btnY + m + a);
      ctx.stroke();
      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(btnX + m + a, btnY + size - m); ctx.lineTo(btnX + m, btnY + size - m); ctx.lineTo(btnX + m, btnY + size - m - a);
      ctx.stroke();
      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(btnX + size - m - a, btnY + size - m); ctx.lineTo(btnX + size - m, btnY + size - m); ctx.lineTo(btnX + size - m, btnY + size - m - a);
      ctx.stroke();
    } else {
      // Expand icon: arrows pointing outward from corners
      const m = 8;
      const a = 5;
      // Top-left
      ctx.beginPath();
      ctx.moveTo(btnX + m + a, btnY + m); ctx.lineTo(btnX + m, btnY + m); ctx.lineTo(btnX + m, btnY + m + a);
      ctx.stroke();
      // Top-right
      ctx.beginPath();
      ctx.moveTo(btnX + size - m - a, btnY + m); ctx.lineTo(btnX + size - m, btnY + m); ctx.lineTo(btnX + size - m, btnY + m + a);
      ctx.stroke();
      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(btnX + m + a, btnY + size - m); ctx.lineTo(btnX + m, btnY + size - m); ctx.lineTo(btnX + m, btnY + size - m - a);
      ctx.stroke();
      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(btnX + size - m - a, btnY + size - m); ctx.lineTo(btnX + size - m, btnY + size - m); ctx.lineTo(btnX + size - m, btnY + size - m - a);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawDpad(): void {
    const ctx = this.renderer.ctx;
    const state = this.getState();

    ctx.save();
    ctx.globalAlpha = 0.4;

    // Left button
    const leftActive = state.movingLeft;
    ctx.fillStyle = leftActive ? '#44aa44' : '#333333';
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(DPAD_LEFT_X - DPAD_SIZE / 2, DPAD_Y - DPAD_SIZE / 2, DPAD_SIZE, DPAD_SIZE, 8);
    ctx.fill();
    ctx.stroke();

    // Left arrow
    ctx.fillStyle = leftActive ? '#ffffff' : '#cccccc';
    ctx.beginPath();
    ctx.moveTo(DPAD_LEFT_X - 15, DPAD_Y);
    ctx.lineTo(DPAD_LEFT_X + 10, DPAD_Y - 15);
    ctx.lineTo(DPAD_LEFT_X + 10, DPAD_Y + 15);
    ctx.closePath();
    ctx.fill();

    // Right button
    const rightActive = state.movingRight;
    ctx.fillStyle = rightActive ? '#44aa44' : '#333333';
    ctx.beginPath();
    ctx.roundRect(DPAD_RIGHT_X - DPAD_SIZE / 2, DPAD_Y - DPAD_SIZE / 2, DPAD_SIZE, DPAD_SIZE, 8);
    ctx.fill();
    ctx.stroke();

    // Right arrow
    ctx.fillStyle = rightActive ? '#ffffff' : '#cccccc';
    ctx.beginPath();
    ctx.moveTo(DPAD_RIGHT_X + 15, DPAD_Y);
    ctx.lineTo(DPAD_RIGHT_X - 10, DPAD_Y - 15);
    ctx.lineTo(DPAD_RIGHT_X - 10, DPAD_Y + 15);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private drawJumpButton(): void {
    const ctx = this.renderer.ctx;
    const jumping = this.getState().jumpPressed;

    ctx.save();
    ctx.globalAlpha = 0.4;

    ctx.fillStyle = jumping ? '#44aa44' : '#333333';
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(JUMP_X, JUMP_Y, JUMP_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Up arrow icon
    ctx.fillStyle = jumping ? '#ffffff' : '#cccccc';
    ctx.beginPath();
    ctx.moveTo(JUMP_X, JUMP_Y - 18);
    ctx.lineTo(JUMP_X - 15, JUMP_Y + 8);
    ctx.lineTo(JUMP_X + 15, JUMP_Y + 8);
    ctx.closePath();
    ctx.fill();

    // Label
    ctx.globalAlpha = 0.6;
    this.renderer.drawText('JUMP', JUMP_X, JUMP_Y + 22, '#cccccc', 11, 'center');

    ctx.restore();
  }

  private drawRadarToggleButton(): void {
    const ctx = this.renderer.ctx;

    ctx.save();
    ctx.globalAlpha = this.radarToggled ? 0.7 : 0.4;

    ctx.fillStyle = this.radarToggled ? '#aa4444' : '#333333';
    ctx.strokeStyle = this.radarToggled ? '#ff6666' : '#888888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(RADAR_X, RADAR_Y, RADAR_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Radar icon - concentric arcs
    ctx.strokeStyle = this.radarToggled ? '#ffffff' : '#cccccc';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(RADAR_X, RADAR_Y + 5, i * 7, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();
    }
    // Dot at center
    ctx.fillStyle = this.radarToggled ? '#ffffff' : '#cccccc';
    ctx.beginPath();
    ctx.arc(RADAR_X, RADAR_Y + 5, 3, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.globalAlpha = 0.6;
    this.renderer.drawText('RADAR', RADAR_X, RADAR_Y + 22, this.radarToggled ? '#ff6666' : '#cccccc', 10, 'center');

    ctx.restore();
  }
}
