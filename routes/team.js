const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const User = require('../models/User');
const Task = require('../models/Task');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');

// GET /api/team/members - Get all team members
router.get('/members', authenticateJWT, async (req, res) => {
  try {
    const { teamId, departmentId, role, status = 'active' } = req.query;
    
    let filter = { status };
    
    if (teamId) filter.team = teamId;
    if (departmentId) filter.department = departmentId;
    if (role) filter.role = role;

    // Role-based access control
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      // Users can only see members of their own team
      const user = await User.findById(req.user._id).populate('team');
      if (user.team) {
        filter.team = user.team._id;
      } else {
        return res.status(403).json({ message: 'You are not part of any team' });
      }
    }

    const members = await User.find(filter)
      .select('name email avatar role department team status lastActive')
      .populate('team', 'name')
      .populate('department', 'name')
      .sort({ name: 1 });

    res.json({
      message: 'Team members retrieved successfully',
      members,
      total: members.length
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch team members', error: err.message });
  }
});

// GET /api/team/members/:id - Get specific team member
router.get('/members/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    
    const member = await User.findById(id)
      .select('-password')
      .populate('team', 'name description')
      .populate('department', 'name description')
      .populate('roles', 'name permissions');

    if (!member) {
      return res.status(404).json({ message: 'Team member not found' });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      const user = await User.findById(req.user._id).populate('team');
      if (!user.team || user.team._id.toString() !== member.team?._id?.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // Get member's recent activity
    const recentTasks = await Task.find({ assignedTo: id })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('title status progress updatedAt');

    const memberData = {
      ...member.toObject(),
      recentTasks,
      stats: {
        totalTasks: await Task.countDocuments({ assignedTo: id }),
        completedTasks: await Task.countDocuments({ assignedTo: id, status: 'completed' }),
        activeTasks: await Task.countDocuments({ assignedTo: id, status: { $in: ['pending', 'in_progress'] } })
      }
    };

    res.json({
      message: 'Team member retrieved successfully',
      member: memberData
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch team member', error: err.message });
  }
});

// POST /api/team/members - Add new team member
router.post('/members', authenticateJWT, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const { email, teamId, departmentId, role, position } = req.body;
    
    // Check if user already exists
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found with this email' });
    }

    // Check if user is already in a team
    if (user.team) {
      return res.status(400).json({ message: 'User is already part of a team' });
    }

    // Update user's team and role
    user.team = teamId;
    user.department = departmentId;
    user.role = role;
    user.position = position;
    user.status = 'active';
    
    await user.save();

    // Add user to team members list
    await Team.findByIdAndUpdate(teamId, {
      $addToSet: { members: user._id }
    });

    // Emit real-time update
    if (req.io) {
      req.io.to(`team-${teamId}`).emit('member-added', { userId: user._id, user: { name: user.name, email: user.email } });
    }

    res.status(201).json({
      message: 'Team member added successfully',
      member: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        team: teamId,
        department: departmentId
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add team member', error: err.message });
  }
});

// PUT /api/team/members/:id - Update team member
router.put('/members/:id', authenticateJWT, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Team member not found' });
    }

    // Check if user is trying to change their own role to admin
    if (updates.role === 'admin' && req.user._id.toString() === id) {
      return res.status(400).json({ message: 'Cannot change your own role to admin' });
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).populate('team', 'name')
     .populate('department', 'name');

    // Emit real-time update
    if (req.io) {
      req.io.to(`user-${id}`).emit('profile-updated', updatedUser);
      if (updatedUser.team) req.io.to(`team-${updatedUser.team._id}`).emit('member-updated', updatedUser);
    }

    res.json({
      message: 'Team member updated successfully',
      member: updatedUser
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update team member', error: err.message });
  }
});

// DELETE /api/team/members/:id - Remove team member
router.delete('/members/:id', authenticateJWT, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Team member not found' });
    }

    // Check if user is trying to remove themselves
    if (req.user._id.toString() === id) {
      return res.status(400).json({ message: 'Cannot remove yourself from the team' });
    }

    const teamId = user.team;
    
    // Remove user from team
    user.team = null;
    user.department = null;
    user.status = 'inactive';
    await user.save();

    // Remove user from team members list
    if (teamId) {
      await Team.findByIdAndUpdate(teamId, {
        $pull: { members: user._id }
      });
    }

    // Emit real-time update
    if (req.io) {
      req.io.to(`user-${id}`).emit('removed-from-team', { teamId });
      if (teamId) req.io.to(`team-${teamId}`).emit('member-removed', { userId: id, userName: user.name });
    }

    res.json({
      message: 'Team member removed successfully',
      memberId: id
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to remove team member', error: err.message });
  }
});

// GET /api/team/performance - Get team performance metrics
router.get('/performance', authenticateJWT, async (req, res) => {
  try {
    const { teamId, timeframe = 'month' } = req.query;
    
    let filter = {};
    if (teamId) filter.team = teamId;
    
    // Role-based access control
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      const user = await User.findById(req.user._id).populate('team');
      if (user.team) {
        filter.team = user.team._id;
      } else {
        return res.status(403).json({ message: 'You are not part of any team' });
      }
    }

    // Calculate date range
    const now = new Date();
    let startDate;
    switch (timeframe) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), 0, 1);
    }

    // Get team tasks
    const tasks = await Task.find({
      ...filter,
      createdAt: { $gte: startDate }
    });

    // Calculate metrics
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
    const overdueTasks = tasks.filter(t => t.deadline && new Date(t.deadline) < now && t.status !== 'completed').length;

    const performance = {
      overallScore: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      productivity: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      quality: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      collaboration: Math.round(Math.random() * 20 + 80), // Placeholder
      trends: {
        weekly: completedTasks > 0 ? 'improving' : 'stable',
        monthly: completedTasks > 0 ? 'stable' : 'declining'
      },
      metrics: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        overdueTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        averageCompletionTime: '2.5 days' // Placeholder
      }
    };

    res.json({
      message: 'Team performance retrieved successfully',
      performance,
      timeframe
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch team performance', error: err.message });
  }
});

// GET /api/team/productivity - Get team productivity metrics
router.get('/productivity', authenticateJWT, async (req, res) => {
  try {
    const { teamId, period = 'month' } = req.query;
    
    let filter = {};
    if (teamId) filter.team = teamId;
    
    // Role-based access control
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      const user = await User.findById(req.user._id).populate('team');
      if (user.team) {
        filter.team = user.team._id;
      } else {
        return res.status(403).json({ message: 'You are not part of any team' });
      }
    }

    // Get productivity data
    const tasks = await Task.find(filter);
    
    const productivity = {
      tasksCompleted: tasks.filter(t => t.status === 'completed').length,
      totalTasks: tasks.length,
      averageCompletionTime: '2.5 days', // Placeholder
      efficiency: Math.round(Math.random() * 20 + 80), // Placeholder
      bottlenecks: ['code review', 'testing', 'deployment'], // Placeholder
      topPerformers: [], // Placeholder
      areasForImprovement: [
        'Reduce context switching',
        'Improve communication',
        'Streamline approval processes'
      ]
    };

    res.json({
      message: 'Team productivity retrieved successfully',
      productivity
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch team productivity', error: err.message });
  }
});

// GET /api/team/analytics - Get team analytics
router.get('/analytics', authenticateJWT, async (req, res) => {
  try {
    const { teamId, dateRange = '30' } = req.query;
    
    let filter = {};
    if (teamId) filter.team = teamId;
    
    // Role-based access control
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      const user = await User.findById(req.user._id).populate('team');
      if (user.team) {
        filter.team = user.team._id;
      } else {
        return res.status(403).json({ message: 'You are not part of any team' });
      }
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - parseInt(dateRange) * 24 * 60 * 60 * 1000);

    // Get analytics data
    const tasks = await Task.find({
      ...filter,
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const analytics = {
      memberUtilization: Math.round(Math.random() * 20 + 80), // Placeholder
      projectProgress: Math.round(Math.random() * 40 + 60), // Placeholder
      skillGaps: ['DevOps', 'UI/UX', 'Testing'], // Placeholder
      recommendations: [
        'Consider cross-training team members',
        'Implement pair programming sessions',
        'Schedule regular skill development workshops'
      ],
      trends: {
        taskCompletion: 'increasing',
        teamVelocity: 'stable',
        qualityMetrics: 'improving'
      },
      insights: {
        peakProductivityHours: '9:00 AM - 11:00 AM',
        mostProductiveDay: 'Wednesday',
        commonBottlenecks: ['Waiting for feedback', 'Context switching']
      }
    };

    res.json({
      message: 'Team analytics retrieved successfully',
      analytics
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch team analytics', error: err.message });
  }
});

// POST /api/team/reports - Generate team reports
router.post('/reports', authenticateJWT, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const { reportType, timeframe, format = 'pdf', teamId, includeCharts = true } = req.body;
    
    // Validate report type
    const validReportTypes = ['performance', 'productivity', 'workload', 'skills', 'comprehensive'];
    if (!validReportTypes.includes(reportType)) {
      return res.status(400).json({ message: 'Invalid report type' });
    }

    // Generate report (placeholder implementation)
    const report = {
      id: Date.now().toString(),
      type: reportType,
      timeframe,
      format,
      teamId,
      generatedAt: new Date().toISOString(),
      generatedBy: req.user._id,
      downloadUrl: `/api/reports/download/${Date.now()}`,
      summary: {
        totalMembers: 0,
        totalTasks: 0,
        completionRate: 0,
        averageProductivity: 0
      },
      charts: includeCharts ? ['productivity-trend', 'task-distribution', 'member-performance'] : [],
      recommendations: [
        'Focus on high-priority tasks',
        'Improve communication between team members',
        'Consider implementing agile methodologies'
      ]
    };

    // Emit real-time update
    if (req.io && teamId) {
      req.io.to(`team-${teamId}`).emit('report-generated', { reportId: report.id, reportType });
    }

    res.json({
      message: 'Team report generated successfully',
      report
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate team report', error: err.message });
  }
});

// POST /api/manager/assign-task - Manager assign task
router.post('/manager/assign-task', authenticateJWT, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const { taskId, userId, priority, deadline, notes } = req.body;
    
    // Validate task exists
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Validate user exists and is in the same team
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is in the same team as the manager
    if (req.user.role !== 'admin') {
      const manager = await User.findById(req.user._id).populate('team');
      if (manager.team && manager.team._id.toString() !== user.team?.toString()) {
        return res.status(403).json({ message: 'Can only assign tasks to team members' });
      }
    }

    // Update task assignment
    task.assignedTo = userId;
    task.assignedBy = req.user._id;
    task.priority = priority || task.priority;
    task.deadline = deadline || task.deadline;
    task.status = 'assigned';
    
    if (notes) {
      task.comments.push({
        user: req.user._id,
        text: `Task reassigned: ${notes}`,
        type: 'assignment'
      });
    }

    await task.save();

    // Emit real-time update
    if (req.io) {
      req.io.to(`user-${userId}`).emit('task-assigned', task);
      if (task.team) req.io.to(`team-${task.team}`).emit('task-assigned', task);
    }

    res.json({
      message: 'Task assigned successfully',
      assignment: {
        taskId,
        userId,
        assignedBy: req.user._id,
        priority: task.priority,
        deadline: task.deadline,
        assignedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to assign task', error: err.message });
  }
});

// PUT /api/manager/reassign-task - Manager reassign task
router.put('/manager/reassign-task', authenticateJWT, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const { taskId, newUserId, reason } = req.body;
    
    // Validate task exists
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Validate new user exists
    const newUser = await User.findById(newUserId);
    if (!newUser) {
      return res.status(404).json({ message: 'New user not found' });
    }

    // Check permissions
    if (req.user.role !== 'admin') {
      const manager = await User.findById(req.user._id).populate('team');
      if (manager.team && manager.team._id.toString() !== newUser.team?.toString()) {
        return res.status(403).json({ message: 'Can only reassign tasks within your team' });
      }
    }

    const previousUserId = task.assignedTo;
    
    // Update task assignment
    task.assignedTo = newUserId;
    task.assignedBy = req.user._id;
    task.status = 'assigned';
    
    if (reason) {
      task.comments.push({
        user: req.user._id,
        text: `Task reassigned: ${reason}`,
        type: 'reassignment'
      });
    }

    await task.save();

    // Emit real-time updates
    if (req.io) {
      req.io.to(`user-${previousUserId}`).emit('task-removed', { taskId });
      req.io.to(`user-${newUserId}`).emit('task-assigned', task);
      if (task.team) req.io.to(`team-${task.team}`).emit('task-reassigned', task);
    }

    res.json({
      message: 'Task reassigned successfully',
      reassignment: {
        taskId,
        previousUserId,
        newUserId,
        reassignedBy: req.user._id,
        reason,
        reassignedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reassign task', error: err.message });
  }
});

// GET /api/manager/pending-tasks - Get pending tasks for manager
router.get('/manager/pending-tasks', authenticateJWT, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const { teamId, priority, status = 'pending' } = req.query;
    
    let filter = { status };
    if (teamId) filter.team = teamId;
    if (priority) filter.priority = priority;
    
    // Role-based filtering
    if (req.user.role !== 'admin') {
      const manager = await User.findById(req.user._id).populate('team');
      if (manager.team) {
        filter.team = manager.team._id;
      }
    }

    const pendingTasks = await Task.find(filter)
      .populate('assignedTo', 'name email avatar')
      .populate('project', 'name code')
      .sort({ priority: -1, deadline: 1 })
      .limit(50);

    res.json({
      message: 'Pending tasks retrieved successfully',
      pendingTasks,
      total: pendingTasks.length
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch pending tasks', error: err.message });
  }
});

// POST /api/manager/bulk-assign - Bulk assign tasks
router.post('/manager/bulk-assign', authenticateJWT, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const { assignments } = req.body;
    
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ message: 'Assignments array is required' });
    }

    const results = [];
    const errors = [];

    for (const assignment of assignments) {
      try {
        const { taskId, userId, priority, deadline, notes } = assignment;
        
        // Validate task exists
        const task = await Task.findById(taskId);
        if (!task) {
          errors.push({ taskId, error: 'Task not found' });
          continue;
        }

        // Validate user exists
        const user = await User.findById(userId);
        if (!user) {
          errors.push({ taskId, error: 'User not found' });
          continue;
        }

        // Check permissions
        if (req.user.role !== 'admin') {
          const manager = await User.findById(req.user._id).populate('team');
          if (manager.team && manager.team._id.toString() !== user.team?.toString()) {
            errors.push({ taskId, error: 'User not in your team' });
            continue;
          }
        }

        // Update task
        task.assignedTo = userId;
        task.assignedBy = req.user._id;
        task.priority = priority || task.priority;
        task.deadline = deadline || task.deadline;
        task.status = 'assigned';
        
        if (notes) {
          task.comments.push({
            user: req.user._id,
            text: `Bulk assigned: ${notes}`,
            type: 'assignment'
          });
        }

        await task.save();

        // Emit real-time update
        if (req.io) {
          req.io.to(`user-${userId}`).emit('task-assigned', task);
          if (task.team) req.io.to(`team-${task.team}`).emit('task-assigned', task);
        }

        results.push({
          taskId,
          userId,
          status: 'assigned',
          assignedAt: new Date().toISOString()
        });

      } catch (error) {
        errors.push({ taskId: assignment.taskId, error: error.message });
      }
    }

    res.json({
      message: 'Bulk assignment completed',
      results,
      errors,
      successCount: results.length,
      errorCount: errors.length
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to perform bulk assignment', error: err.message });
  }
});

module.exports = router; 