const express = require('express');
const router = express.Router();
const ChatMessage = require('../models/ChatMessage');
const { authenticateJWT } = require('../middleware/auth');

// Send a chat message within a task
router.post('/:taskId', authenticateJWT, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: 'Message is required.' });
    const chatMsg = new ChatMessage({
      task: req.params.taskId,
      sender: req.user._id,
      message,
    });
    await chatMsg.save();
    res.status(201).json(chatMsg);
  } catch (err) {
    res.status(500).json({ message: 'Failed to send message', error: err.message });
  }
});

// Get all chat messages for a task
router.get('/:taskId', authenticateJWT, async (req, res) => {
  try {
    const messages = await ChatMessage.find({ task: req.params.taskId }).populate('sender', 'name email role');
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch messages', error: err.message });
  }
});

module.exports = router;