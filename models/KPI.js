const mongoose = require('mongoose');

const KPISchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  targetValue: Number,
  currentValue: Number,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  period: { type: String, enum: ['weekly', 'monthly', 'quarterly', 'yearly'], default: 'monthly' },
}, { timestamps: true });

module.exports = mongoose.model('KPI', KPISchema);