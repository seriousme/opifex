import { readerFromIterable } from "./dev_deps.ts";
import { AsyncQueue, nextTick } from "./utils.ts";

export function dummyConn(r: Deno.Reader, w: Deno.Writer): Deno.Conn {
	return {
		rid: -1,
		closeWrite: () => Promise.resolve(),
		read: (x: Uint8Array): Promise<number | null> => r.read(x),
		write: (x: Uint8Array): Promise<number> => w.write(x),
		readable: new ReadableStream({
			type: "bytes",
			async pull(_controller) {},
			cancel() {},
			autoAllocateChunkSize: 1,
		}),
		writable: new WritableStream({
			async write(_chunk, _controller) {},
			close() {},
			abort() {},
		}),
		close: (): void => {},
		localAddr: { transport: "tcp", hostname: "0.0.0.0", port: 0 },
		remoteAddr: { transport: "tcp", hostname: "0.0.0.0", port: 0 },
		ref: () => {},
		unref: () => {},
		[Symbol.dispose]: () => {},
	};
}

export function dummyReader(buffs: Uint8Array[]): Deno.Reader {
	let idx = 0;
	return {
		read(p: Uint8Array): Promise<number | null> {
			const buff = buffs[idx++];
			if (buff instanceof Uint8Array) {
				p.set(buff);
				return Promise.resolve(buff.byteLength);
			}
			return Promise.resolve(null);
		},
	};
}

export function dummyWriter(
	buffs: Uint8Array[],
	isClosed: boolean,
): Deno.Writer {
	return {
		write(p: Uint8Array): Promise<number> {
			if (isClosed) {
				return Promise.reject();
			}
			buffs.push(p);
			return Promise.resolve(p.byteLength);
		},
	};
}

export function dummyQueueReader(queue: AsyncQueue<Uint8Array>): Deno.Reader {
	return readerFromIterable(queue);
}

export function dummyQueueWriter(queue: AsyncQueue<Uint8Array>): Deno.Writer {
	return {
		write(p: Uint8Array): Promise<number> {
			queue.push(p);
			return Promise.resolve(p.byteLength);
		},
	};
}

export function dummyQueueConn(
	r: AsyncQueue<Uint8Array>,
	w: AsyncQueue<Uint8Array>,
	closer = () => {},
): Deno.Conn {
	const writer = dummyQueueWriter(w);

	return {
		rid: -1,
		closeWrite: () => {
			return Promise.resolve();
		},
		read: async (x: Uint8Array): Promise<number | null> => {
			try {
				const buff = await r.next();
				x.set(buff);
				return await Promise.resolve(buff.byteLength);
			} catch {
				await nextTick();
				return await Promise.resolve(null);
			}
		},
		write: (x: Uint8Array): Promise<number> => writer.write(x),
		readable: new ReadableStream({
			type: "bytes",
			async pull(_controller) {},
			cancel() {},
			autoAllocateChunkSize: 1,
		}),
		writable: new WritableStream({
			async write(_chunk, _controller) {},
			close() {},
			abort() {},
		}),
		close: (): void => {
			w.close();
			r.close();
			closer();
		},
		localAddr: { transport: "tcp", hostname: "0.0.0.0", port: 0 },
		remoteAddr: { transport: "tcp", hostname: "0.0.0.0", port: 0 },
		ref: () => {},
		unref: () => {},
		[Symbol.dispose]: () => {},
	};
}
