import { Router } from 'express';
import authRoutes from './auth.routes.js';
import visitsRoutes from './visits.routes.js';
import movementsRoutes from './movements.routes.js';
import guardRoutes from './guard.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'VisitAPP API', version: '1.0.0' });
});

router.use('/auth', authRoutes);
router.use('/visits', visitsRoutes);
router.use('/movements', movementsRoutes);
router.use('/guard', guardRoutes);
router.use('/admin', adminRoutes);

export default router;
