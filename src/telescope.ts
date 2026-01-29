// GBT telescope model with slew rate mechanics, movement, and jumping

import type { TelescopeState, Point, BeamState, Triangle, WheelState } from './types.ts';
import type { Renderer } from './renderer.ts';
import { drawGBT } from './sprites.ts';

const MAX_SLEW_RATE = 30;  // degrees per second
const BEAM_HALF_ANGLE = 1.5; // degrees - half width of beam cone (3° total)
const BASE_MOVE_SPEED = 200; // pixels per second at full wheels
const JUMP_VELOCITY = -450;  // pixels per second (negative = upward)
const GRAVITY = 1200;        // pixels per second squared
const MIN_X = 100;           // Left boundary
const MAX_X_OFFSET = 300;    // Right boundary offset from screen width

// GBT dimensions for calculating dish position (must match sprites.ts)
const WHEEL_RADIUS = 8;
const BASE_HEIGHT = 15;
const TOWER_HEIGHT = 60;
const TRACK_WIDTH = 180;
const DISH_RADIUS = 50;

export class Telescope {
  state: TelescopeState;
  private renderer: Renderer;
  private targetPoint: Point | null = null; // Where mouse is pointing in the sky

  constructor(renderer: Renderer) {
    this.renderer = renderer;

    const groundY = renderer.getGroundY();

    this.state = {
      commandedElevation: 45,
      actualElevation: 45,
      maxSlewRate: MAX_SLEW_RATE,
      x: 150,
      y: groundY,
      groundY: groundY,
      velocityY: 0,
      isGrounded: true,
      wheels: Array(8).fill(null).map(() => ({ damaged: false })),
      movingLeft: false,
      movingRight: false,
    };
  }

  // Store the target point (mouse position) - beam will always point here
  setTargetPoint(mousePos: Point): void {
    this.targetPoint = mousePos;
  }

  // Calculate elevation to point at target from current dish position
  private updateElevationToTarget(): void {
    if (!this.targetPoint) return;

    // Use telescope base position for angle calculation (more stable than dish position)
    const pivotY = this.state.y - WHEEL_RADIUS * 2 - BASE_HEIGHT - TOWER_HEIGHT;
    const dx = this.targetPoint.x - this.state.x;
    const dy = pivotY - this.targetPoint.y;

    // Calculate angle - atan2 handles all quadrants
    const elevation = Math.atan2(dy, dx) * (180 / Math.PI);

    this.state.commandedElevation = elevation;
    this.state.actualElevation = elevation;
  }

  // Get the position of the dish center (beam origin)
  getDishPosition(): Point {
    const pivotY = this.state.y - WHEEL_RADIUS * 2 - BASE_HEIGHT - TOWER_HEIGHT;
    // Beam emanates from the dish surface (offset from pivot)
    const dishOffset = DISH_RADIUS * 0.4;
    const elevationRad = this.state.actualElevation * (Math.PI / 180);

    return {
      x: this.state.x + Math.cos(elevationRad) * dishOffset,
      y: pivotY - Math.sin(elevationRad) * dishOffset,
    };
  }

  // Get movement speed based on remaining wheels
  getMoveSpeed(): number {
    const activeWheels = this.state.wheels.filter(w => !w.damaged).length;
    if (activeWheels === 0) return 0;
    return BASE_MOVE_SPEED * (activeWheels / 8);
  }

  // Handle jump input
  jump(): void {
    if (this.state.isGrounded) {
      this.state.velocityY = JUMP_VELOCITY;
      this.state.isGrounded = false;
    }
  }

  // Set movement direction
  setMovement(left: boolean, right: boolean): void {
    this.state.movingLeft = left;
    this.state.movingRight = right;
  }

  // Damage a wheel closest to the given x position (returns true if game should end)
  // Also returns the index of the damaged wheel
  damageWheel(targetX?: number): { gameOver: boolean; wheelIndex: number } {
    let wheelIndex = -1;

    if (targetX !== undefined) {
      // Find the closest undamaged wheel to the target position
      const wheelSpacing = TRACK_WIDTH / 7;
      let closestDist = Infinity;

      for (let i = 0; i < this.state.wheels.length; i++) {
        const wheel = this.state.wheels[i];
        if (wheel && !wheel.damaged) {
          const wheelX = this.state.x - TRACK_WIDTH / 2 + i * wheelSpacing;
          const dist = Math.abs(wheelX - targetX);
          if (dist < closestDist) {
            closestDist = dist;
            wheelIndex = i;
          }
        }
      }
    } else {
      // Fall back to first undamaged wheel
      wheelIndex = this.state.wheels.findIndex(w => !w.damaged);
    }

    if (wheelIndex !== -1) {
      const wheel = this.state.wheels[wheelIndex];
      if (wheel) {
        wheel.damaged = true;
      }
    }

    // Return true if all wheels are destroyed
    return {
      gameOver: this.state.wheels.every(w => w.damaged),
      wheelIndex
    };
  }

  // Repair a wheel (returns true if a wheel was repaired)
  repairWheel(): boolean {
    const damagedIndex = this.state.wheels.findIndex(w => w.damaged);
    if (damagedIndex !== -1) {
      const wheel = this.state.wheels[damagedIndex];
      if (wheel) {
        wheel.damaged = false;
        return true;
      }
    }
    return false;
  }

  // Update position and elevation
  update(deltaTime: number): void {
    // Horizontal movement
    const moveSpeed = this.getMoveSpeed();
    if (this.state.movingLeft) {
      this.state.x -= moveSpeed * deltaTime;
    }
    if (this.state.movingRight) {
      this.state.x += moveSpeed * deltaTime;
    }

    // Clamp x position
    const maxX = this.renderer.width - MAX_X_OFFSET;
    this.state.x = Math.max(MIN_X, Math.min(maxX, this.state.x));

    // Jumping physics
    if (!this.state.isGrounded) {
      this.state.velocityY += GRAVITY * deltaTime;
      this.state.y += this.state.velocityY * deltaTime;

      // Land on ground
      if (this.state.y >= this.state.groundY) {
        this.state.y = this.state.groundY;
        this.state.velocityY = 0;
        this.state.isGrounded = true;
      }
    }

    // Always update elevation to point at target (accounts for GBT movement)
    this.updateElevationToTarget();
  }

  // Get beam as a triangle (cone shape)
  getBeamState(): BeamState {
    const dishPos = this.getDishPosition();
    const { actualElevation } = this.state;

    const beamLength = this.renderer.width * 1.5;
    const centerRad = actualElevation * (Math.PI / 180);
    const leftRad = (actualElevation + BEAM_HALF_ANGLE) * (Math.PI / 180);
    const rightRad = (actualElevation - BEAM_HALF_ANGLE) * (Math.PI / 180);

    return {
      triangle: {
        origin: dishPos,
        left: {
          x: dishPos.x + Math.cos(leftRad) * beamLength,
          y: dishPos.y - Math.sin(leftRad) * beamLength,
        },
        right: {
          x: dishPos.x + Math.cos(rightRad) * beamLength,
          y: dishPos.y - Math.sin(rightRad) * beamLength,
        },
      },
    };
  }

  // Draw the telescope
  draw(): void {
    drawGBT(
      this.renderer,
      this.state.x,
      this.state.y,
      this.state.actualElevation,
      this.state.wheels
    );
  }

  // Draw the beam as a triangle (no crosshairs or indicators)
  drawBeamIndicators(isBlanked: boolean = false, isRadarActive: boolean = false): void {
    const beam = this.getBeamState();
    const ctx = this.renderer.ctx;

    // Use red when radar active, grayscale when blanked, green when normal
    let fillColor: string;
    let strokeColor: string;
    if (isRadarActive) {
      fillColor = 'rgba(255, 0, 0, 0.15)';
      strokeColor = 'rgba(255, 0, 0, 0.3)';
    } else if (isBlanked) {
      fillColor = 'rgba(128, 128, 128, 0.08)';
      strokeColor = 'rgba(128, 128, 128, 0.2)';
    } else {
      fillColor = 'rgba(0, 255, 0, 0.08)';
      strokeColor = 'rgba(0, 255, 0, 0.2)';
    }

    // Draw beam triangle (semi-transparent cone)
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(beam.triangle.origin.x, beam.triangle.origin.y);
    ctx.lineTo(beam.triangle.left.x, beam.triangle.left.y);
    ctx.lineTo(beam.triangle.right.x, beam.triangle.right.y);
    ctx.closePath();
    ctx.fill();

    // Draw beam edges (faint lines)
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(beam.triangle.origin.x, beam.triangle.origin.y);
    ctx.lineTo(beam.triangle.left.x, beam.triangle.left.y);
    ctx.moveTo(beam.triangle.origin.x, beam.triangle.origin.y);
    ctx.lineTo(beam.triangle.right.x, beam.triangle.right.y);
    ctx.stroke();
  }

  // Get the GBT's collision bounds (for groundhog collision)
  getBaseBounds(): { x: number; y: number; width: number; height: number } {
    return {
      x: this.state.x - TRACK_WIDTH / 2,
      y: this.state.y - WHEEL_RADIUS * 2 - BASE_HEIGHT,
      width: TRACK_WIDTH,
      height: WHEEL_RADIUS * 2 + BASE_HEIGHT,
    };
  }

  // Get the position of a specific wheel (for explosion effects)
  getWheelPosition(wheelIndex: number): Point | null {
    if (wheelIndex < 0 || wheelIndex >= 8) return null;
    const wheelSpacing = TRACK_WIDTH / 7;
    return {
      x: this.state.x - TRACK_WIDTH / 2 + wheelIndex * wheelSpacing,
      y: this.state.y - WHEEL_RADIUS,
    };
  }
}
