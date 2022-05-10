type Parts = string[];

export class Trie<T> {
  #value: Array<T>;
  #children: Map<string, Trie<T>>;
  private separator = "/";
  private wildcardOne = "+";
  private wildcardSubtree = "#";
  private reservedPrefix = "$";

  constructor() {
    this.#value = [];
    this.#children = new Map();
  }

  matchChild(child: string, parts: Parts): Array<T> {
    const childNode = this.#children.get(child);
    return childNode ? childNode._match(parts) : [];
  }

  match(key: string) {
    const parts = key.split(this.separator);
    // toplevel wildcards are not allowed to match toplevel reserved topics
    if (parts.length > 0 && parts[0].charAt(0) === this.reservedPrefix) {
      return this._matchPrefix(parts);
    }
    return this._match(parts);
  }

  private _matchPrefix(parts: Parts): Array<T> {
    if (parts.length === 0) {
      return this.#value ? this.#value : [];
    }
    const [first, ...rest] = parts;
    return this.matchChild(first, rest);
  }

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

  add(key: string, value: T) {
    return this._add(key.split(this.separator), value);
  }

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
      const node = new Trie<T>();
      this.#children.set(first, node);
      node._add(rest, value);
    }
    return;
  }

  remove(key: string, value: T) {
    return this._remove(key.split(this.separator), value);
  }

  private _remove(parts: Parts, value: T) {
    if (parts.length === 0) {
      const arr = this.#value || [];
      this.#value = arr.filter((item) => item !== value);
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
}
