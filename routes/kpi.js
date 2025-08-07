const express = require('express');
const router = express.Router();
const KPI = require('../models/KPI');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');
const { validateKPI, handleValidation } = require('../middleware/validate');

// Create KPI (Employer only)
router.post('/', authenticateJWT, authorizeRoles('employer'), validateKPI, handleValidation, async (req, res) => {
  try {
    const { name, description, targetValue, assignedTo, period } = req.body;
    const kpi = new KPI({ name, description, targetValue, assignedTo, period });
    await kpi.save();
    res.status(201).json(kpi);
  } catch (err) {
    res.status(500).json({ message: 'KPI creation failed', error: err.message });
  }
});

// Get all KPIs (Employer: all, Employee: own)
router.get('/', authenticateJWT, async (req, res) => {
  try {
    let kpis;
    if (req.user.role === 'employer') {
      kpis = await KPI.find().populate('assignedTo');
    } else {
      kpis = await KPI.find({ assignedTo: req.user._id });
    }
    res.json(kpis);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch KPIs', error: err.message });
  }
});

// Update KPI progress (Employee only)
router.patch('/:id/progress', authenticateJWT, authorizeRoles('employee'), async (req, res) => {
  try {
    const { currentValue } = req.body;
    const kpi = await KPI.findOne({ _id: req.params.id, assignedTo: req.user._id });
    if (!kpi) return res.status(404).json({ message: 'KPI not found' });
    kpi.currentValue = currentValue;
    await kpi.save();
    res.json({ message: 'KPI progress updated', kpi });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update KPI', error: err.message });
  }
});

module.exports = router;