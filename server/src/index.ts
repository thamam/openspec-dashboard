import { createServer } from 'http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { AgentService } from './services/AgentService.js';
import { PtyService } from './services/PtyService.js';

const PORT = process.env.PORT || 3011;

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const agentService = new AgentService(io);
agentService.start();

const ptyService = new PtyService(io);
ptyService.init();

const server = httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

const gracefulShutdown = (signal: string) => {
  console.log(`Received ${signal}. Shutting down server gracefully...`);
  try {
    agentService.stop();
    ptyService.destroy();
    io.close();
    if ('closeAllConnections' in server && typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    server.close();
  } catch (e) {}
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
