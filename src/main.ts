// Main entry point - game loop and initialization

import { Renderer } from './renderer.ts';
import { Game } from './game.ts';
import { SpriteCache } from './sprite-cache.ts';

let game: Game;
let lastTime: number = 0;

function init(): void {
  // Initialize sprite cache first (pre-renders all sprites)
  SpriteCache.getInstance().initialize();

  const renderer = new Renderer('game-canvas');
  game = new Game(renderer);

  // Set up input handlers
  setupInputHandlers(renderer);

  // Start game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function setupInputHandlers(renderer: Renderer): void {
  // Mouse move
  renderer.canvas.addEventListener('mousemove', (event: MouseEvent) => {
    const pos = renderer.getMousePosition(event);
    game.handleMouseMove(pos.x, pos.y);
  });

  // Click
  renderer.canvas.addEventListener('click', () => {
    game.handleClick();
  });

  // Mouse down (left=observe, right=radar)
  renderer.canvas.addEventListener('mousedown', (event: MouseEvent) => {
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
