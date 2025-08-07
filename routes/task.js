const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const User = require('../models/User');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');
const { validateTask, handleValidation } = require('../middleware/validate');

// Create/Assign Task (Employer only, AI assignment stub)
router.post('/', authenticateJWT, authorizeRoles('employer'), validateTask, handleValidation, async (req, res) => {
  try {
    const { title, description, assignedTo, priority, deadline, industryTemplate } = req.body;
    // AI assignment stub: In future, auto-assign based on AI logic
    const task = new Task({
      title,
      description,
      assignedTo,
      assignedBy: req.user._id,
      priority,
      deadline,
      industryTemplate,
    });
    await task.save();
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ message: 'Task creation failed', error: err.message });
  }
});

// Get all tasks (Employer: all, Employee: own)
router.get('/', authenticateJWT, async (req, res) => {
  try {
    let tasks;
    if (req.user.role === 'employer') {
      tasks = await Task.find().populate('assignedTo assignedBy');
    } else {
      tasks = await Task.find({ assignedTo: req.user._id }).populate('assignedBy');
    }
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch tasks', error: err.message });
  }
});

// Mark task as completed (Employee only)
router.patch('/:id/complete', authenticateJWT, authorizeRoles('employee'), async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, assignedTo: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    task.status = 'completed';
    await task.save();
    res.json({ message: 'Task marked as completed', task });
  } catch (err) {
    res.status(500).json({ message: 'Failed to complete task', error: err.message });
  }
});

// Add comment to task
router.post('/:id/comment', authenticateJWT, async (req, res) => {
  try {
    const { text } = req.body;
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    task.comments.push({ user: req.user._id, text });
    await task.save();
    res.json({ message: 'Comment added', comments: task.comments });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add comment', error: err.message });
  }
});

// Add attachment to task (stub, expects url and filename)
router.post('/:id/attachment', authenticateJWT, async (req, res) => {
  try {
    const { url, filename } = req.body;
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    task.attachments.push({ url, filename });
    await task.save();
    res.json({ message: 'Attachment added', attachments: task.attachments });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add attachment', error: err.message });
  }
});

module.exports = router;