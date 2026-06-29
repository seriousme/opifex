import { SQLitePersistence } from "./sqlite/sqlitePersistence.ts";
import { MemoryPersistence } from "./memory/memoryPersistence.ts";
import { runPersistenceTestSuite } from "./persistence.testing.ts";

// Run voor Memory
runPersistenceTestSuite({
  name: "MemoryPersistence",
  factory: () => ({
    persistence: new MemoryPersistence(),
    cleanup: () => {},
  }),
});

// Run voor SQLite
runPersistenceTestSuite({
  name: "SqlitePersistence",
  factory: () => {
    const persistence = new SQLitePersistence(":memory:");
    return {
      persistence,
      cleanup: () => persistence.close(),
    };
  },
});