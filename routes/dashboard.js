const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const User = require('../models/User');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');

// Get dashboard stats (Employer only)
router.get('/stats', authenticateJWT, authorizeRoles('employer'), async (req, res) => {
  try {
    const totalTasks = await Task.countDocuments();
    const completed = await Task.countDocuments({ status: 'completed' });
    const overdue = await Task.countDocuments({ status: 'overdue' });
    const byDepartment = await Task.aggregate([
      { $lookup: { from: 'users', localField: 'assignedTo', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $group: { _id: '$user.department', count: { $sum: 1 } } }
    ]);
    const byRole = await Task.aggregate([
      { $lookup: { from: 'users', localField: 'assignedTo', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $group: { _id: '$user.role', count: { $sum: 1 } } }
    ]);
    res.json({ totalTasks, completed, overdue, byDepartment, byRole });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch dashboard stats', error: err.message });
  }
});

// Get top/bottom performers (stub for now)
router.get('/performers', authenticateJWT, authorizeRoles('employer'), async (req, res) => {
  // TODO: Implement AI-based analytics in future
  res.json({ top: [], bottom: [] });
});

// Get recent activity (last 10 tasks)
router.get('/recent', authenticateJWT, authorizeRoles('employer'), async (req, res) => {
  try {
    const recentTasks = await Task.find().sort({ updatedAt: -1 }).limit(10).populate('assignedTo assignedBy');
    res.json(recentTasks);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch recent activity', error: err.message });
  }
});

module.exports = router;