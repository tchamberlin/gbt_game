// Main entry point - game loop and initialization

import { Renderer } from './renderer.ts';
import { Game } from './game.ts';
import { SpriteCache } from './sprite-cache.ts';
import { TouchControls } from './touch-controls.ts';

let game: Game;
let lastTime: number = 0;

function init(): void {
  // Initialize sprite cache first (pre-renders all sprites)
  SpriteCache.getInstance().initialize();

  const renderer = new Renderer('game-canvas');
  game = new Game(renderer);

  // Set up touch controls
  const touchControls = new TouchControls(renderer);
  game.setTouchControls(touchControls);

  // Set up input handlers
  setupInputHandlers(renderer, touchControls);

  // Start game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function setupInputHandlers(renderer: Renderer, touchControls: TouchControls): void {
  // Mouse move
  renderer.canvas.addEventListener('mousemove', (event: MouseEvent) => {
    const pos = renderer.getMousePosition(event);
    game.handleMouseMove(pos.x, pos.y);
  });

  // Click
  renderer.canvas.addEventListener('click', (event: MouseEvent) => {
    const pos = renderer.getMousePosition(event);
    game.handleClick(pos.x, pos.y);
  });

  // Mouse down (left=observe, right=radar)
  renderer.canvas.addEventListener('mousedown', (event: MouseEvent) => {
    event.preventDefault();
    game.handleMouseDown(event.button);
  });

  // Mouse up
  renderer.canvas.addEventListener('mouseup', (event: MouseEvent) => {
    game.handleMouseUp(event.button);
  });

  // Keyboard down
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    game.handleKeyDown(event.key);
  });

  // Keyboard up
  window.addEventListener('keyup', (event: KeyboardEvent) => {
    game.handleKeyUp(event.key);
  });

  // Prevent context menu on right click
  renderer.canvas.addEventListener('contextmenu', (event: Event) => {
    event.preventDefault();
  });

  // Prevent drag behavior
  renderer.canvas.addEventListener('dragstart', (event: Event) => {
    event.preventDefault();
  });

  // Touch events
  renderer.canvas.addEventListener('touchstart', (event: TouchEvent) => {
    event.preventDefault();
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i]!;
      const pos = touchControls.getTouchPosition(touch);
      const type = touchControls.handleTouchStart(touch.identifier, pos.x, pos.y);

      if (type === 'aim') {
        // Forward aim touches as clicks for menus + mouse move for gameplay
        game.handleClick(pos.x, pos.y);
        game.handleMouseMove(pos.x, pos.y);
      } else if (type === 'jump') {
        game.handleTouchJump();
      }
    }
    game.updateFromTouch();
  }, { passive: false });

  renderer.canvas.addEventListener('touchmove', (event: TouchEvent) => {
    event.preventDefault();
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i]!;
      const pos = touchControls.getTouchPosition(touch);
      touchControls.handleTouchMove(touch.identifier, pos.x, pos.y);

      // Update aim position for aim touches
      if (touchControls.getTouchType(touch.identifier) === 'aim') {
        game.handleMouseMove(pos.x, pos.y);
      }
    }
    game.updateFromTouch();
  }, { passive: false });

  renderer.canvas.addEventListener('touchend', (event: TouchEvent) => {
    event.preventDefault();
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i]!;
      touchControls.handleTouchEnd(touch.identifier);
    }
    game.updateFromTouch();
  }, { passive: false });

  renderer.canvas.addEventListener('touchcancel', (event: TouchEvent) => {
    event.preventDefault();
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i]!;
      touchControls.handleTouchEnd(touch.identifier);
    }
    game.updateFromTouch();
  }, { passive: false });
}

function gameLoop(currentTime: number): void {
  const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1); // Cap delta to prevent physics issues
  lastTime = currentTime;

  // Update
  game.update(deltaTime);

  // Draw
  game.draw();

  // Continue loop
  requestAnimationFrame(gameLoop);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
