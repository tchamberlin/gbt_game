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
// All action buttons grouped bottom-left for left thumb
const DPAD_LEFT_X = 60;
const DPAD_RIGHT_X = 240;
const DPAD_Y = 620;
const DPAD_SIZE = 80;

const JUMP_X = 150;   // Between left and right
const JUMP_Y = 610;
const JUMP_RADIUS = 50;

const RADAR_X = 150;  // Above the jump/dpad cluster
const RADAR_Y = 500;
const RADAR_RADIUS = 42;

const FULLSCREEN_SIZE = 52;
const FULLSCREEN_PADDING = 10;

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
    ctx.globalAlpha = 0.85;

    // Bright yellow background
    ctx.fillStyle = this.isFullscreen ? '#666622' : '#ccaa00';
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, size, size, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#ffee44';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, size, size, 8);
    ctx.stroke();

    // Icon - corner brackets
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    const m = 10;
    const a = 10;

    if (this.isFullscreen) {
      // Collapse icon: inward arrows
      const cx = btnX + size / 2;
      const cy = btnY + size / 2;
      const o = 6;
      // Top-left inward
      ctx.beginPath();
      ctx.moveTo(cx - o - a, cy - o); ctx.lineTo(cx - o, cy - o); ctx.lineTo(cx - o, cy - o - a);
      ctx.stroke();
      // Top-right inward
      ctx.beginPath();
      ctx.moveTo(cx + o + a, cy - o); ctx.lineTo(cx + o, cy - o); ctx.lineTo(cx + o, cy - o - a);
      ctx.stroke();
      // Bottom-left inward
      ctx.beginPath();
      ctx.moveTo(cx - o - a, cy + o); ctx.lineTo(cx - o, cy + o); ctx.lineTo(cx - o, cy + o + a);
      ctx.stroke();
      // Bottom-right inward
      ctx.beginPath();
      ctx.moveTo(cx + o + a, cy + o); ctx.lineTo(cx + o, cy + o); ctx.lineTo(cx + o, cy + o + a);
      ctx.stroke();
    } else {
      // Expand icon: outward corner brackets
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
    ctx.globalAlpha = 0.65;

    // Left button
    const leftActive = state.movingLeft;
    ctx.fillStyle = leftActive ? '#44cc44' : '#444444';
    ctx.strokeStyle = leftActive ? '#66ff66' : '#aaaaaa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(DPAD_LEFT_X - DPAD_SIZE / 2, DPAD_Y - DPAD_SIZE / 2, DPAD_SIZE, DPAD_SIZE, 10);
    ctx.fill();
    ctx.stroke();

    // Left arrow (bigger)
    ctx.fillStyle = leftActive ? '#ffffff' : '#dddddd';
    ctx.beginPath();
    ctx.moveTo(DPAD_LEFT_X - 20, DPAD_Y);
    ctx.lineTo(DPAD_LEFT_X + 14, DPAD_Y - 22);
    ctx.lineTo(DPAD_LEFT_X + 14, DPAD_Y + 22);
    ctx.closePath();
    ctx.fill();

    // Right button
    const rightActive = state.movingRight;
    ctx.fillStyle = rightActive ? '#44cc44' : '#444444';
    ctx.strokeStyle = rightActive ? '#66ff66' : '#aaaaaa';
    ctx.beginPath();
    ctx.roundRect(DPAD_RIGHT_X - DPAD_SIZE / 2, DPAD_Y - DPAD_SIZE / 2, DPAD_SIZE, DPAD_SIZE, 10);
    ctx.fill();
    ctx.stroke();

    // Right arrow (bigger)
    ctx.fillStyle = rightActive ? '#ffffff' : '#dddddd';
    ctx.beginPath();
    ctx.moveTo(DPAD_RIGHT_X + 20, DPAD_Y);
    ctx.lineTo(DPAD_RIGHT_X - 14, DPAD_Y - 22);
    ctx.lineTo(DPAD_RIGHT_X - 14, DPAD_Y + 22);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private drawJumpButton(): void {
    const ctx = this.renderer.ctx;
    const jumping = this.getState().jumpPressed;

    ctx.save();
    ctx.globalAlpha = 0.65;

    ctx.fillStyle = jumping ? '#44cc44' : '#444444';
    ctx.strokeStyle = jumping ? '#66ff66' : '#aaaaaa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(JUMP_X, JUMP_Y, JUMP_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Up arrow icon (bigger)
    ctx.fillStyle = jumping ? '#ffffff' : '#dddddd';
    ctx.beginPath();
    ctx.moveTo(JUMP_X, JUMP_Y - 24);
    ctx.lineTo(JUMP_X - 20, JUMP_Y + 10);
    ctx.lineTo(JUMP_X + 20, JUMP_Y + 10);
    ctx.closePath();
    ctx.fill();

    // Label
    ctx.globalAlpha = 0.8;
    this.renderer.drawText('JUMP', JUMP_X, JUMP_Y + 28, '#dddddd', 13, 'center');

    ctx.restore();
  }

  private drawRadarToggleButton(): void {
    const ctx = this.renderer.ctx;

    ctx.save();
    ctx.globalAlpha = this.radarToggled ? 0.85 : 0.65;

    ctx.fillStyle = this.radarToggled ? '#cc3333' : '#444444';
    ctx.strokeStyle = this.radarToggled ? '#ff6666' : '#aaaaaa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(RADAR_X, RADAR_Y, RADAR_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Radar icon - concentric arcs (bigger)
    ctx.strokeStyle = this.radarToggled ? '#ffffff' : '#dddddd';
    ctx.lineWidth = 2.5;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(RADAR_X, RADAR_Y + 3, i * 9, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();
    }
    // Dot at center
    ctx.fillStyle = this.radarToggled ? '#ffffff' : '#dddddd';
    ctx.beginPath();
    ctx.arc(RADAR_X, RADAR_Y + 3, 4, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.globalAlpha = 0.8;
    this.renderer.drawText('RADAR', RADAR_X, RADAR_Y + 28, this.radarToggled ? '#ff6666' : '#dddddd', 13, 'center');

    ctx.restore();
  }
}
