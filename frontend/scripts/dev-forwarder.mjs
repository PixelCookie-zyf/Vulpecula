// Local dev forwarder: lets the workerd runtime reach providers that need a
// system proxy (e.g. Google APIs from regions where direct access is blocked).
// workerd ignores HTTP(S)_PROXY env vars, so it calls this forwarder instead:
//   GET http://127.0.0.1:8787/https://api.example.com/v1/thing
// and the forwarder tunnels the request through your HTTP proxy via CONNECT.
// Zero dependencies. Start with: npm run forwarder
import http from "node:http";
import https from "node:https";
import tls from "node:tls";

const PORT = Number(process.env.FORWARDER_PORT || 8787);
const PROXY_HOST = process.env.FORWARDER_PROXY_HOST || "127.0.0.1";
const PROXY_PORT = Number(process.env.FORWARDER_PROXY_PORT || 6152);

function connectThroughProxy(host, port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: PROXY_HOST,
      port: PROXY_PORT,
      method: "CONNECT",
      path: `${host}:${port}`,
      headers: { host: `${host}:${port}` },
    });
    req.on("connect", (res, socket) => {
      if (res.statusCode === 200) resolve(socket);
      else reject(new Error(`Proxy refused CONNECT (${res.statusCode})`));
    });
    req.on("error", reject);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const match = /^\/(https?):\/\/([^/]+)(\/.*)?$/.exec(req.url ?? "");
  if (!match) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Use /https://host/path" }));
    return;
  }
  const [, scheme, authority, path = "/"] = match;
  const [host, portPart] = authority.split(":");
  const port = Number(portPart) || (scheme === "https" ? 443 : 80);
  try {
    const socket = await connectThroughProxy(host, port);
    const createConnection = () =>
      scheme === "https" ? tls.connect({ socket, servername: host }) : socket;
    const transport = scheme === "https" ? https : http;
    const upstream = transport.request(
      { host, port, method: req.method, path, headers: { ...req.headers, host: authority }, createConnection },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", (err) => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    });
    req.pipe(upstream);
  } catch (err) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[dev-forwarder] http://127.0.0.1:${PORT} -> proxy ${PROXY_HOST}:${PROXY_PORT}`);
});
