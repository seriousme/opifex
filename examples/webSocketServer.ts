/**
 * a simple websocket server to verify browser compatibility
 */
import { extname, join, resolve } from "node:path";
import { logger } from "@seriousme/opifex/utils";
import { MqttServer } from "@seriousme/opifex/server";
import { mqttOverWS } from "@seriousme/opifex/wsServer";
import { LogLevel } from "@seriousme/opifex/utils";
import type { RequestHandler } from "@seriousme/opifex/wsServer";

logger.level(LogLevel.info);

// Nodejs does not natively support WebSockets so we only continue running Deno
if (typeof Deno === "undefined") {
  logger.error("Native WebSocket server only supported on Deno");
  process.exit(1);
}
const currentDir = import.meta.dirname || "./";
const PUBLIC_DIR = resolve(join(currentDir, "/public"));
const listenOptions = { port: 8080 };
const mqttOptions = {};
const mqttServer = new MqttServer(mqttOptions);

const mimeTypes = new Map<string, string>([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
]);

function w3cLogger(handler: RequestHandler): RequestHandler {
  return async (req, info) => {
    const res = await handler(req, info);
    const hostname = res.headers.get("upgrade")
      ? "unknown"
      : info.remoteAddr.hostname;
    logger.info(W3CLogLine(req, res, hostname));
    return res;
  };
}

function W3CLogLine(req: Request, res: Response, hostname: string): string {
  const now = new Date();

  // format date to UTC (YYYY-MM-DD en HH:MM:SS)
  const date = now.toISOString().split("T")[0];
  const time = now.toISOString().split("T")[1]?.substring(0, 8);

  const url = new URL(req.url);
  const clientIp = hostname ?? "127.0.0.1";
  const method = req.method;
  const uriStem = url.pathname;
  const uriQuery = url.search ? url.search : "-";
  const status = res.status;
  const bytesSent = res.headers.get("content-length") ?? "-";

  return `${date} ${time} ${clientIp} ${method} ${uriStem} ${uriQuery} ${status} ${bytesSent}`;
}

const requestHandler: RequestHandler = async (req) => {
  const url = new URL(req.url);

  const pathname = url.pathname.endsWith("/")
    ? url.pathname + "index.html"
    : url.pathname;

  const ext = extname(pathname);
  const mimeType = mimeTypes.get(ext) ?? "application/octet-stream";

  const targetPath = resolve(join(PUBLIC_DIR, pathname));
  logger.debug({ targetPath });

  try {
    if (!targetPath.startsWith(PUBLIC_DIR)) {
      // someone is trying to escape the public folder
      return new Response("403 Forbidden", { status: 403 });
    }

    const file = await Deno.readFile(targetPath);
    return new Response(file, {
      status: 200,
      headers: {
        "content-type": mimeType,
      },
    });
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return new Response("404 Not Found", { status: 404 });
    }
    return new Response("500 Internal Server Error", { status: 500 });
  }
};

const server = Deno.serve(
  listenOptions,
  w3cLogger(mqttOverWS(mqttServer, "/mqtt", requestHandler)),
);

await server.finished;
