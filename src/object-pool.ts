// Generic object pool to reduce GC pressure

export class ObjectPool<T> {
  private pool: T[] = [];
  private activeSet: Set<T> = new Set();
  private factory: () => T;
  private reset: (obj: T) => void;

  constructor(factory: () => T, reset: (obj: T) => void, initialSize: number = 20) {
    this.factory = factory;
    this.reset = reset;

    // Pre-allocate objects
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    const obj = this.pool.length > 0 ? this.pool.pop()! : this.factory();
    this.activeSet.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (this.activeSet.delete(obj)) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  getActive(): Set<T> {
    return this.activeSet;
  }

  forEachActive(callback: (obj: T) => void): void {
    for (const obj of this.activeSet) {
      callback(obj);
    }
  }

  releaseAll(): void {
    for (const obj of this.activeSet) {
      this.reset(obj);
      this.pool.push(obj);
    }
    this.activeSet.clear();
  }

  get activeCount(): number {
    return this.activeSet.size;
  }
}
