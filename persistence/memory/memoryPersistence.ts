import { MqttPersistence } from "../mqttPersistence.ts";
import { MemoryStorage } from "./memoryStorage.ts";

export class MemoryPersistence extends MqttPersistence {
  constructor() {
    super(new MemoryStorage());
  }
  /**
   * Convenient lifecycle method combining instance creation and initialization.
   */
  static async start(): Promise<MemoryPersistence> {
    const persistence = new MemoryPersistence();
    await persistence.initialize();
    return persistence;
  }
}
