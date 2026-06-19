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

  function tryCloseBoth() {
    if (aClosed && bController) {
      try {
        bController.close();
      } catch (_) {
        // swallow errors
      }
    }

    if (bClosed && aController) {
      try {
        aController?.close();
      } catch (_) {
        // swallow errors
      }
    }
  }

  function tryErrorBoth(reason: unknown) {
    if (aController) {
      try {
        aController.error(reason);
      } catch (_) {}
    }
    if (bController) {
      try {
        bController.error(reason);
      } catch (_) {}
    }
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
