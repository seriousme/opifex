export interface WebStreamPairEndpoint {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => void;
}

export function createWebStreamPair(): {
  input: WebStreamPairEndpoint;
  output: WebStreamPairEndpoint;
} {
  let aController: ReadableStreamDefaultController | null = null;
  let bController: ReadableStreamDefaultController | null = null;

  let aClosed = false;
  let bClosed = false;
  let aControllerClosed = false;
  let bControllerClosed = false;

  const aReadable = new ReadableStream({
    start(controller) {
      aController = controller;
    },
    cancel(_reason) {
      aClosed = true;
      tryCloseBoth();
    },
  });

  const bReadable = new ReadableStream({
    start(controller) {
      bController = controller;
    },
    cancel(_reason) {
      bClosed = true;
      tryCloseBoth();
    },
  });

  const makeWritable = (
    getPeerController: () => ReadableStreamDefaultController | null,
    markClosed: () => void,
  ) =>
    new WritableStream({
      write(chunk) {
        const peer = getPeerController();
        if (!peer) throw new Error("peer stream not initialized yet");
        peer.enqueue(chunk);
      },
      close() {
        markClosed();
        tryCloseBoth();
      },
      abort(reason) {
        markClosed();
        tryErrorBoth(reason);
      },
    });

  const aWritable = makeWritable(
    () => bController,
    () => {
      aClosed = true;
    },
  );

  const bWritable = makeWritable(
    () => aController,
    () => {
      bClosed = true;
    },
  );

  function closePeerOnce(
    side: "a" | "b",
    controller: ReadableStreamDefaultController | null,
  ) {
    if (!controller) return;
    const isClosed = side === "a" ? aControllerClosed : bControllerClosed;
    if (isClosed) return;
    if (side === "a") {
      aControllerClosed = true;
    } else {
      bControllerClosed = true;
    }
    try {
      controller.close();
    } catch {
      // ignore duplicate shutdown attempts; Node throws if the controller is already closed
    }
  }

  function errorPeerOnce(
    side: "a" | "b",
    controller: ReadableStreamDefaultController | null,
    reason: unknown,
  ) {
    if (!controller) return;
    const isClosed = side === "a" ? aControllerClosed : bControllerClosed;
    if (isClosed) return;
    if (side === "a") {
      aControllerClosed = true;
    } else {
      bControllerClosed = true;
    }
    try {
      controller.error(reason);
    } catch {
      // ignore duplicate shutdown attempts; Node throws if the controller is already closed
    }
  }

  function tryCloseBoth() {
    if (aClosed) {
      closePeerOnce("b", bController);
    }

    if (bClosed) {
      closePeerOnce("a", aController);
    }
  }

  function tryErrorBoth(reason: unknown) {
    errorPeerOnce("a", aController, reason);
    errorPeerOnce("b", bController, reason);
  }

  return {
    input: {
      readable: aReadable,
      writable: aWritable,
      close: () => {
        aReadable.cancel();
      },
    },
    output: {
      readable: bReadable,
      writable: bWritable,
      close: () => {
        bReadable.cancel();
      },
    },
  };
}
