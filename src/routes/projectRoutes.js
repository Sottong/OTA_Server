const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authenticateJWT } = require('../middleware/auth');

// Semua route butuh auth
router.use(authenticateJWT);

router.get('/', projectController.listProjects.bind(projectController));
router.get('/create', projectController.renderCreateProject.bind(projectController));
router.post('/', projectController.createProject.bind(projectController));
router.get('/:id', projectController.getProject.bind(projectController));
router.post('/:id/delete', projectController.deleteProject.bind(projectController));
router.post('/:id/regenerate-key', projectController.regenerateApiKey.bind(projectController));
router.post('/:id/allowed-macs', projectController.addAllowedMac.bind(projectController));
router.post('/:id/allowed-macs/:macId/delete', projectController.removeAllowedMac.bind(projectController));

module.exports = router;
