const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authenticateJWT } = require('../middleware/auth');

// Get notifications for current user
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch notifications', error: err.message });
  }
});

// Mark notification as read
router.patch('/:id/read', authenticateJWT, async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    notification.read = true;
    await notification.save();
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update notification', error: err.message });
  }
});

// (Stub) Send notification (for future use)
router.post('/send', authenticateJWT, async (req, res) => {
  // In production, restrict to system/admin or use events
  res.status(501).json({ message: 'Notification sending not implemented yet.' });
});

module.exports = router;