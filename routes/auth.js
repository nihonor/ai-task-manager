const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const { validateRegistration, validateLogin, handleValidation } = require('../middleware/validate');

// Registration
router.post('/register', validateRegistration, handleValidation, async (req, res) => {
  try {
    const { name, email, password, role, department, locale } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email already in use.' });
    const user = new User({ name, email, password, role, department, locale });
    await user.save();
    res.status(201).json({ message: 'User registered successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed.', error: err.message });
  }
});

// Login
router.post('/login', validateLogin, handleValidation, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials.' });
    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials.' });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: 'Login failed.', error: err.message });
  }
});

module.exports = router;