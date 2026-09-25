/*
 Node 26 has getOrInsert by default.
 This is a polyfill for older versions
 */

export function getOrInsert<K, V>(map: Map<K, V>, key: K, defaultValue: V): V {
  if (map.has(key)) {
    return map.get(key)!;
  }
  map.set(key, defaultValue);
  return defaultValue;
}
