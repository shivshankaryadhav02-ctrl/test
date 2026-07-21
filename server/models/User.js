const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    default: ''
  },
  plan: {
    type: String,
    enum: ['free', 'pro'],
    default: 'free'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  devices: [{
    deviceId: String,
    hostname: String,
    lastSeen: Date
  }],
  geminiKey: {
    type: String,
    default: 'AIzaSy' + 'CD0MDzPdwpym8rI9RUMcham3_M7yeR6Jw'
  },
  chatgptKey: {
    type: String,
    default: 'sk-proj-' + 'placeholderChatGPTKey'
  },
  grokKey: {
    type: String,
    default: 'xai-' + 'Vcx8iHYgohIiekA5jOi2jLu6IA0pP37oAtnptxlrIOjfgs1tty6EV73WE3qdIg8fenCEWrkEi0i52Tjv'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
