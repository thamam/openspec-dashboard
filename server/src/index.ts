import { createServer } from 'http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { AgentService } from './services/AgentService.js';
import { PtyService } from './services/PtyService.js';
import { corsOptions, isAllowedOrigin } from './cors.js';

const PORT = process.env.PORT || 3011;
// Bind loopback by default: the server exposes shell-spawning endpoints and
// must not be reachable from the LAN. Set HOST=0.0.0.0 to opt out explicitly.
const HOST = process.env.HOST || '127.0.0.1';

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    ...corsOptions,
    methods: ['GET', 'POST']
  },
  // Defense in depth: engine.io applies the cors option to the WS upgrade
  // too; allowRequest additionally rejects disallowed origins at the handshake.
  allowRequest: (req, callback) => {
    callback(null, isAllowedOrigin(req.headers.origin));
  }
});

const agentService = new AgentService(io);
agentService.start();

const ptyService = new PtyService(io);
ptyService.init();

httpServer.listen(Number(PORT), HOST, () => {
  console.log(`Server is running on ${HOST}:${PORT}`);
});
