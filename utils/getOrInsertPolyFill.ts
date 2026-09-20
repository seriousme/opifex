/*
 Node 26 has getOrInsert by default.
 This is a polyfill for older versions
 */

declare global {
  interface Map<K, V> {
    getOrInsert(key: K, defaultValue: V): V;
    getOrInsertComputed(key: K, callback: (key: K) => V): V;
  }
}

// 2. Implement getOrInsert (eager evaluation)
if (!Map.prototype.getOrInsert) {
  Map.prototype.getOrInsert = function <K, V>(
    this: Map<K, V>,
    key: K,
    defaultValue: V,
  ): V {
    if (this.has(key)) {
      return this.get(key)!;
    }
    this.set(key, defaultValue);
    return defaultValue;
  };
}

// 3. Implement getOrInsertComputed (lazy evaluation)
if (!Map.prototype.getOrInsertComputed) {
  Map.prototype.getOrInsertComputed = function <K, V>(
    this: Map<K, V>,
    key: K,
    callback: (key: K) => V,
  ): V {
    if (this.has(key)) {
      return this.get(key)!;
    }
    const newValue = callback(key);
    this.set(key, newValue);
    return newValue;
  };
}

// Ensure this file is treated as a module
export {};
