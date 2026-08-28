import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', routes);

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

app.use(errorHandler);

export default app;
