/**
 * Represents the result of processing an outbound topic name,
 * containing either the original topic name, a topic alias integer, or both.
 */
export interface OutboundTopicAlias {
  /**
   * The topic name.
   * Will be empty (`""`) when a valid alias mapping has already been established.
   */
  topicName: string;

  /**
   * The numeric alias assigned to the topic, if aliases are enabled.
   */
  topicAlias?: number;
}

/**
 * Manages outbound MQTT topic aliases using a Least Recently Used (LRU) caching strategy.
 */
export class OutboundTopicAliasManager {
  /**
   * The maximum number of topic aliases supported by the broker/client.
   */
  private readonly maxAliases: number;

  /**
   * Internal mapping from topic names to assigned aliases.
   * Leverages JavaScript's Map insertion-order behavior to act as an LRU cache.
   */
  private readonly topicToAlias: Map<string, number>;

  /**
   * Creates an instance of `OutboundTopicAliasManager`.
   *
   * @param clientTopicAliasMaximum - The maximum number of topic aliases allowed (defaults to `0`, meaning disabled).
   */
  constructor(clientTopicAliasMaximum: number = 0) {
    this.maxAliases = clientTopicAliasMaximum;
    this.topicToAlias = new Map();
  }

  /**
   * Processes an outbound topic name and returns the appropriate payload metadata
   * (`OutboundTopcAlias`) based on alias availability and caching state.
   *
   * - If aliases are disabled (`maxAliases === 0`), returns only the original `topicName`.
   * - If the topic is already cached (cache hit), refreshes its LRU position and returns the `topicAlias` with an empty `topicName`.
   * - If the topic is not cached (cache miss), assigns a new alias or evicts the least recently used topic alias mapping.
   *
   * @param topic - The outbound MQTT topic name to process.
   * @returns An object containing the formatted `topicName` and optional `topicAlias`.
   */
  public processTopic(topic: string): OutboundTopicAlias {
    if (this.maxAliases === 0) {
      return { topicName: topic };
    }

    // Cache Hit -> Refresh LRU-position in Map
    if (this.topicToAlias.has(topic)) {
      const alias = this.topicToAlias.get(topic)!;
      this.topicToAlias.delete(topic);
      this.topicToAlias.set(topic, alias);

      return {
        topicName: "",
        topicAlias: alias,
      };
    }

    // Cache Miss
    let assignedAlias: number;

    if (this.topicToAlias.size < this.maxAliases) {
      // While there is space, simply assign the next alias (1, 2, 3...)
      assignedAlias = this.topicToAlias.size + 1;
    } else {
      // Cache full: reuse the alias of the least used topic (first key in the Map)
      const lruTopic = this.topicToAlias.keys().next().value;
      assignedAlias = this.topicToAlias.get(lruTopic!)!;

      this.topicToAlias.delete(lruTopic!);
    }

    // Store the new topic
    this.topicToAlias.set(topic, assignedAlias);

    return {
      topicName: topic,
      topicAlias: assignedAlias,
    };
  }

  /**
   * Clears all internal topic alias mappings and releases cached resources.
   */
  public destroy(): void {
    this.topicToAlias.clear();
  }
}
