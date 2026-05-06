import express from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { generateToken, protect, restrictTo } from '../middleware/auth.ts';
import User from '../models/User.ts';
import { UserRole } from '../constants.ts';
import { sendWelcomeEmail } from '../services/emailService.ts';
import { logAction } from '../services/auditService.ts';

const router = express.Router();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email }).select('+password');

    if (!user || !user.password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    const token = generateToken(user._id.toString());

    res.json({
      token,
      user: {
        id: user._id.toString(),
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword
      }
    });
  } catch (error: any) {
    console.error('Login Route Error:', error);
    res.status(500).json({ 
      message: 'Authentication failed due to a server error',
      error: error.message 
    });
  }
});

/**
 * @swagger
 * /api/auth/users:
 *   post:
 *     summary: Create a new user (Admin Only)
 *     tags: [Auth]
 */
router.post('/users', protect, restrictTo(UserRole.ADMIN), async (req: any, res) => {
  const { displayName, email, role, region } = req.body;
  const currentUser = req.user;

  if (!displayName || !email || !role) {
    return res.status(400).json({ message: 'Display name, email, and role are required' });
  }

  let finalRegion = region;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Generate random temporary password
    const tempPass = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPass, 10);

    const newUser = await User.create({
      displayName,
      email,
      role,
      region: finalRegion,
      password: hashedPassword,
      mustChangePassword: true
    });

    // Send welcome email
    const emailSent = await sendWelcomeEmail(email, displayName, tempPass);

    await logAction(
      currentUser._id.toString(),
      'USER_CREATED',
      `Created user ${displayName} (${email}) with role ${role}${emailSent ? '' : ' (Welcome email failed to send)'}`,
      'USER',
      newUser._id.toString()
    );

    res.status(201).json({ 
      message: emailSent 
        ? 'User created successfully and notification email sent.' 
        : 'User created successfully, but welcome email failed to send. Please provide credentials manually.',
      emailSent,
      tempPassword: emailSent ? undefined : tempPass, // Fallback if email fails
      user: {
        id: newUser._id.toString(),
        displayName: newUser.displayName,
        email: newUser.email,
        role: newUser.role,
        region: newUser.region
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during user creation' });
  }
});

/**
 * @swagger
 * /api/auth/users:
 *   get:
 *     summary: Get all users (Admin Only)
 *     tags: [Auth]
 */
router.get('/users', protect, restrictTo(UserRole.ADMIN), async (req: any, res) => {
  try {
    const query = {};

    const users = await User.find(query).sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

/**
 * @swagger
 * /api/auth/users/{id}/role:
 *   patch:
 *     summary: Update user role (Admin Only)
 *     tags: [Auth]
 */
router.patch('/users/:id/role', protect, restrictTo(UserRole.ADMIN), async (req: any, res) => {
  const { role, region } = req.body;
  const { id } = req.params;

  if (!role || !Object.values(UserRole).includes(role as UserRole)) {
    return res.status(400).json({ message: 'Valid role is required' });
  }

  try {
    const userToUpdate = await User.findById(id);
    if (!userToUpdate) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updateData: any = { role };
    if (region !== undefined) {
      updateData.region = region;
    }
    
    const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });

    await logAction(
      req.user._id.toString(),
      'USER_ROLE_UPDATED',
      `Updated user ${userToUpdate.displayName} to role ${role}${region ? ` and region ${region}` : ''}`,
      'USER',
      id
    );

    res.json({ message: 'User role updated successfully', user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user role' });
  }
});

/**
 * @swagger
 * /api/auth/users/{id}/status:
 *   patch:
 *     summary: Toggle user active status (Admin Only)
 *     tags: [Auth]
 */
router.patch('/users/:id/status', protect, restrictTo(UserRole.ADMIN), async (req: any, res) => {
  const { isActive } = req.body;
  const { id } = req.params;

  if (isActive === undefined) {
    return res.status(400).json({ message: 'isActive status is required' });
  }

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }

    user.isActive = isActive;
    await user.save();

    await logAction(
      req.user._id.toString(),
      'USER_STATUS_TOGGLED',
      `${isActive ? 'Activated' : 'Deactivated'} user ${user.displayName} (${user.email})`,
      'USER',
      id
    );

    res.json({ message: `User ${isActive ? 'activated' : 'deactivated'} successfully`, user });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user status' });
  }
});

/**
 * @swagger
 * /api/auth/users/{id}:
 *   delete:
 *     summary: Delete a user (Admin Only)
 *     tags: [Auth]
 */
router.delete('/users/:id', protect, restrictTo(UserRole.ADMIN), async (req: any, res) => {
  const { id } = req.params;

  try {
    if (id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await logAction(
      req.user._id.toString(),
      'USER_DELETED',
      `Deleted user ${user.displayName} (${user.email})`,
      'USER',
      id
    );

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

/**
 * @swagger
 * /api/auth/users/{id}:
 *   patch:
 *     summary: Update user details (Admin Only)
 *     tags: [Auth]
 */
router.patch('/users/:id', protect, restrictTo(UserRole.ADMIN), async (req: any, res) => {
  const { displayName, role, region, isActive } = req.body;
  const { id } = req.params;

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const oldData = {
      displayName: user.displayName,
      role: user.role,
      region: user.region,
      isActive: user.isActive
    };

    if (displayName) user.displayName = displayName;
    if (role && Object.values(UserRole).includes(role as UserRole)) user.role = role as UserRole;
    if (region !== undefined) user.region = region;
    if (isActive !== undefined) user.isActive = isActive;

    const changes = [];
    if (displayName && displayName !== oldData.displayName) changes.push(`name to ${displayName}`);
    if (role && role !== oldData.role) changes.push(`role to ${role}`);
    if (region !== undefined && region !== oldData.region) changes.push(`region to ${region}`);
    if (isActive !== undefined && isActive !== oldData.isActive) {
      changes.push(`status to ${isActive ? 'Active' : 'Inactive'}`);
    }

    await user.save();

    if (changes.length > 0) {
      await logAction(
        req.user._id.toString(),
        'USER_UPDATED',
        `Personnel ${user.email} updated: ${changes.join(', ')}`,
        'USER',
        id
      );
    }

    res.json({ message: 'User details updated successfully', user });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user details' });
  }
});

router.get('/google/url', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).trim().replace(/\/$/, '');

  if (!clientId) {
    console.error('Missing Google Client ID');
    return res.status(500).json({ 
      error: 'OAuth configuration incomplete', 
      message: 'Please ensure GOOGLE_CLIENT_ID is set in environment variables.' 
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'profile email',
    access_type: 'offline',
    prompt: 'consent'
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.json({ url: authUrl });
});

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Redirect to Google OAuth (Legacy/Fallback)
 *     tags: [Auth]
 */
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags: [Auth]
 */
router.get(
  ['/google/callback', '/google/callback/'],
  passport.authenticate('google', { session: true, failureRedirect: '/login?error=auth_failed' }),
  (req, res) => {
    // Successfully authenticated
    const user = req.user as any;
    const token = generateToken(user._id.toString());

    // Send success message to parent window (AI Studio iframe handler)
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: '${token}', user: ${JSON.stringify({
                id: user._id.toString(),
                displayName: user.displayName,
                email: user.email,
                role: user.role,
                region: user.region,
                mustChangePassword: user.mustChangePassword
              })} }, '*');
              window.close();
            } else {
              window.location.href = '/dashboard?token=${token}';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  }
);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [Auth]
 */
router.post('/change-password', protect, async (req: any, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(req.user._id, {
      password: hashedPassword,
      mustChangePassword: false
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 */
router.get('/me', protect, async (req: any, res) => {
  res.json({
    user: {
      id: req.user._id.toString(),
      displayName: req.user.displayName,
      email: req.user.email,
      role: req.user.role,
      region: req.user.region,
      mustChangePassword: req.user.mustChangePassword
    }
  });
});

export default router;
