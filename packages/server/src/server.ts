import { app, createHttpServer } from './index.js';

const hostname = process.env['HOST']?.trim() || '127.0.0.1';
const port = Number(process.env['PORT']) || 8001;

const server = createHttpServer(app);

server.listen(port, hostname, () => {
  console.warn(`Server listening on http://${hostname}:${port}`);
});
