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

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
