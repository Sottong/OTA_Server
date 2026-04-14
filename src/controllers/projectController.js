const projectService = require('../services/projectService');
const deviceService = require('../services/deviceService');
const ApiResponse = require('../utils/apiResponse');

class ProjectController {
  // GET /projects - List semua project
  async listProjects(req, res, next) {
    try {
      const projects = await projectService.getAllProjects();
      res.render('projects/list', { title: 'Projects', projects });
    } catch (err) { next(err); }
  }

  // GET /projects/create - Form create project
  renderCreateProject(req, res) {
    res.render('projects/create', { title: 'Create Project', error: null });
  }

  // POST /projects - Create project
  async createProject(req, res, next) {
    try {
      const { name, description } = req.body;
      await projectService.createProject(name, description);
      res.redirect('/projects');
    } catch (err) {
      if (err.code === 'P2002') {
        return res.render('projects/create', {
          title: 'Create Project',
          error: 'Project name already exists',
        });
      }
      next(err);
    }
  }

  // GET /projects/:id - Detail project
  async getProject(req, res, next) {
    try {
      const project = await projectService.getProjectById(req.params.id);
      if (!project) return res.status(404).render('error', { message: 'Project not found' });

      const deviceStats = await deviceService.getDeviceStats(project.id);
      res.render('projects/detail', { title: project.name, project, deviceStats });
    } catch (err) { next(err); }
  }

  // POST /projects/:id/delete - Delete project
  async deleteProject(req, res, next) {
    try {
      await projectService.deleteProject(req.params.id);
      res.redirect('/projects');
    } catch (err) { next(err); }
  }

  // POST /projects/:id/regenerate-key - Regenerate API Key
  async regenerateApiKey(req, res, next) {
    try {
      await projectService.regenerateApiKey(req.params.id);
      res.redirect(`/projects/${req.params.id}`);
    } catch (err) { next(err); }
  }

  // POST /projects/:id/allowed-macs - Add MAC to whitelist
  async addAllowedMac(req, res, next) {
    try {
      const { macAddress, label } = req.body;
      await projectService.addAllowedMac(req.params.id, macAddress, label);
      res.redirect(`/projects/${req.params.id}`);
    } catch (err) { next(err); }
  }

  // POST /projects/:id/allowed-macs/:macId/delete - Remove MAC from whitelist
  async removeAllowedMac(req, res, next) {
    try {
      await projectService.removeAllowedMac(req.params.macId);
      res.redirect(`/projects/${req.params.id}`);
    } catch (err) { next(err); }
  }
}

module.exports = new ProjectController();
