const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['employer', 'employee'], required: true },
  department: { type: String },
  kpis: [{ type: mongoose.Schema.Types.ObjectId, ref: 'KPI' }],
  locale: { type: String, default: 'en' },
  notifications: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Notification' }],
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);