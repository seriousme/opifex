import { MemoryPersistence } from "./memory/memoryPersistence.ts";
import { SqlitePersistence } from "./sqlite/sqlitePersistence.ts";
import { runPersistenceTestSuite } from "./persistence.testing.ts";

// Run for Memory
runPersistenceTestSuite({
  name: "MemoryPersistence",
  factory: () => ({
    persistence: new MemoryPersistence(),
    cleanup: () => {},
  }),
});

// Run for Sqlite
runPersistenceTestSuite({
  name: "SqlitePersistence",
  factory: () => {
    const persistence = new SqlitePersistence(":memory:");
    return {
      persistence,
      cleanup: () => persistence.close(),
    };
  },
});
