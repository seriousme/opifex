// Managing MQTT 5 topic aliases

// Incoming
export class IncomingAliasManager {
  constructor(private maxIncomingAllowed: number) {}

  private aliases = new Map<number, string>();

  // register an alias and throw if
  registerAlias(alias: number, topic: string): void {
    if (alias < 1 || alias > this.maxIncomingAllowed) {
      throw new Error("Protocol Error: Alias out of reach");
    }
    this.aliases.set(alias, topic);
  }

  getTopic(alias: number): string {
    const topic = this.aliases.get(alias);
    if (!topic) {
      throw new Error("Protocol Error: Unknown alias used by client");
    }
    return topic;
  }
}

// Outgoing
// No fancy stuff, just Roun-Robin
export class OutgoingAliasManager {
  private aliases: string[] = [];
  private nextToReplaceIndex = 0;

  constructor(private maxOutgoingAllowed: number) {}

  getAliasOrAllocate(topic: string): { alias: number; mustSendTopic: boolean } {
    if (this.maxOutgoingAllowed === 0) {
      return { alias: 0, mustSendTopic: true };
    }

    const existingIndex = this.aliases.indexOf(topic);
    if (existingIndex !== -1) {
      return { alias: existingIndex + 1, mustSendTopic: false };
    }

    // Assign or overwrite (Round-Robin)
    const aliasToUse = this.aliases.length < this.maxOutgoingAllowed
      ? this.aliases.push(topic) // push returns new length, prefect as alias (1-based)
      : this.nextToReplaceIndex + 1;

    if (this.aliases.length >= this.maxOutgoingAllowed) {
      this.aliases[this.nextToReplaceIndex] = topic;
      this.nextToReplaceIndex = (this.nextToReplaceIndex + 1) %
        this.maxOutgoingAllowed;
    }

    return { alias: aliasToUse, mustSendTopic: true };
  }
}
