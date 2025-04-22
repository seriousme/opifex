/**
 * A Trie data structure implementation that supports wildcard matching
 * @template T The type of values stored in the trie
 */
type Parts = string[];

/**
 * Trie class for storing and matching hierarchical key-value pairs with wildcard support
 * @template T The type of values stored in the trie
 */
export class Trie<T> {
  #value: Array<T>;
  #children: Map<string, Trie<T>>;
  private separator = "/";
  private wildcardOne = "+";
  private wildcardSubtree = "#";
  private reservedPrefix = "$";
  private looseCompare: boolean;

  /**
   * Creates a new Trie instance
   * @param looseCompare Whether to use loose comparison for object values
   */
  constructor(looseCompare = false) {
    this.#value = [];
    this.#children = new Map();
    this.looseCompare = looseCompare;
  }

  /**
   * Matches a child node with the given key parts
   * @param child The child node key to match
   * @param parts Remaining parts of the key to match
   * @returns Array of matched values
   */
  matchChild(child: string, parts: Parts): Array<T> {
    const childNode = this.#children.get(child);
    return childNode ? childNode._match(parts) : [];
  }

  /**
   * Matches a key against the trie
   * @param key The key to match
   * @returns Array of matched values
   */
  match(key: string): T[] {
    const parts = key.split(this.separator);
    if (parts.length > 0 && parts[0].charAt(0) === this.reservedPrefix) {
      return this._matchPrefix(parts);
    }
    return this._match(parts);
  }

  /**
   * Internal method to match reserved prefix keys
   * @param parts Parts of the key to match
   * @returns Array of matched values
   */
  private _matchPrefix(parts: Parts): Array<T> {
    if (parts.length === 0) {
      return this.#value ? this.#value : [];
    }
    const [first, ...rest] = parts;
    return this.matchChild(first, rest);
  }

  /**
   * Internal method to match keys with wildcard support
   * @param parts Parts of the key to match
   * @returns Array of matched values
   */
  private _match(parts: Parts): Array<T> {
    if (parts.length === 0) {
      return this.#value ? this.#value : [];
    }
    const [first, ...rest] = parts;
    const exact = this.matchChild(first, rest);
    const single = this.matchChild(this.wildcardOne, rest);
    const subtree = this.matchChild(this.wildcardSubtree, []);
    const results = exact.concat(single, subtree);
    return results;
  }

  /**
   * Adds a value to the trie at the specified key
   * @param key The key to add the value at
   * @param value The value to add
   */
  add(key: string, value: T): void {
    return this._add(key.split(this.separator), value);
  }

  /**
   * Internal method to recursively add a value
   * @param parts Parts of the key to add at
   * @param value The value to add
   */
  private _add(parts: Parts, value: T) {
    if (parts.length === 0) {
      this.#value = this.#value.concat(value);
      return;
    }
    const [first, ...rest] = parts;
    const child = this.#children.get(first);
    if (child instanceof Trie) {
      child._add(rest, value);
    } else {
      const node = new Trie<T>(this.looseCompare);
      this.#children.set(first, node);
      node._add(rest, value);
    }
    return;
  }

  /**
   * Removes a value from the trie at the specified key
   * @param key The key to remove the value from
   * @param value The value to remove
   */
  remove(key: string, value: T): void {
    return this._remove(key.split(this.separator), value);
  }

  /**
   * Internal method to recursively remove a value
   * @param parts Parts of the key to remove from
   * @param value The value to remove
   */
  private _remove(parts: Parts, value: T): void {
    if (parts.length === 0) {
      const arr = this.#value || [];
      this.#value = arr.filter(this.filter(value));
      return;
    }
    const [first, ...rest] = parts;
    const node = this.#children.get(first);
    if (node) {
      node._remove(rest, value);
      if (node.#value.length === 0 && this.#children.size === 0) {
        this.#children.delete(first);
      }
    }
  }

  /**
   * Creates a filter function for removing values
   * @param value The value to filter against
   * @returns Filter function
   */
  private filter(value: T): (value: T, index: number, array: T[]) => boolean {
    if (this.looseCompare && typeof value === "object") {
      return (item) => {
        for (const key in value) {
          if (value[key] !== item[key]) {
            return true;
          }
        }
        return false;
      };
    }
    return (item) => item !== value;
  }
}
