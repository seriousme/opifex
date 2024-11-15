export class Trie {
    #value;
    #children;
    separator = "/";
    wildcardOne = "+";
    wildcardSubtree = "#";
    reservedPrefix = "$";
    looseCompare;
    constructor(looseCompare = false) {
        this.#value = [];
        this.#children = new Map();
        this.looseCompare = looseCompare;
    }
    matchChild(child, parts) {
        const childNode = this.#children.get(child);
        return childNode ? childNode._match(parts) : [];
    }
    match(key) {
        const parts = key.split(this.separator);
        // toplevel wildcards are not allowed to match toplevel reserved topics
        if (parts.length > 0 && parts[0].charAt(0) === this.reservedPrefix) {
            return this._matchPrefix(parts);
        }
        return this._match(parts);
    }
    _matchPrefix(parts) {
        if (parts.length === 0) {
            return this.#value ? this.#value : [];
        }
        const [first, ...rest] = parts;
        return this.matchChild(first, rest);
    }
    _match(parts) {
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
    add(key, value) {
        return this._add(key.split(this.separator), value);
    }
    _add(parts, value) {
        if (parts.length === 0) {
            this.#value = this.#value.concat(value);
            return;
        }
        const [first, ...rest] = parts;
        const child = this.#children.get(first);
        if (child instanceof Trie) {
            child._add(rest, value);
        }
        else {
            const node = new Trie(this.looseCompare);
            this.#children.set(first, node);
            node._add(rest, value);
        }
        return;
    }
    remove(key, value) {
        return this._remove(key.split(this.separator), value);
    }
    _remove(parts, value) {
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
    filter(value) {
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
