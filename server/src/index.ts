import { createServer } from 'http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { AgentService } from './services/AgentService.js';

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

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
