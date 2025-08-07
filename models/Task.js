const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: String,
  createdAt: { type: Date, default: Date.now },
});

const AttachmentSchema = new mongoose.Schema({
  url: String,
  filename: String,
  uploadedAt: { type: Date, default: Date.now },
});

const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'overdue'], default: 'pending' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  deadline: Date,
  comments: [CommentSchema],
  attachments: [AttachmentSchema],
  blockers: [String],
  aiAssignmentData: { type: Object }, // stub for future AI fields
  industryTemplate: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Task', TaskSchema);