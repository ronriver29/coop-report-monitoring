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
 * /api/auth/authentik/url:
 *   get:
 *     summary: Get Authentik authorization URL
 *     tags: [Auth]
 */
router.get('/authentik/url', (req, res) => {
  const clientId = process.env.AUTHENTIK_CLIENT_ID;
  const authentikUrl = process.env.AUTHENTIK_URL?.replace(/\/$/, '');
  const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).trim().replace(/\/$/, '');

  if (!clientId || !authentikUrl) {
    console.error('Missing Authentik configuration');
    return res.status(500).json({ 
      error: 'OAuth configuration incomplete', 
      message: 'Please ensure AUTHENTIK_CLIENT_ID and AUTHENTIK_URL are set.' 
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/authentik/callback`,
    response_type: 'code',
    scope: 'openid profile email',
  });
  
  const authUrl = `${authentikUrl}/application/o/authorize/?${params.toString()}`;
  res.json({ url: authUrl });
});

/**
 * @swagger
 * /api/auth/authentik/callback:
 *   get:
 *     summary: Authentik OAuth callback
 *     tags: [Auth]
 */
router.get('/authentik/callback', async (req, res) => {
  const code = req.query.code as string;
  const clientId = process.env.AUTHENTIK_CLIENT_ID;
  const clientSecret = process.env.AUTHENTIK_CLIENT_SECRET;
  const authentikUrl = process.env.AUTHENTIK_URL?.replace(/\/$/, '');
  const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).trim().replace(/\/$/, '');

  if (!code || !clientId || !clientSecret || !authentikUrl) {
    return res.status(400).send('Invalid request or configuration');
  }

  try {
    const tokenRes = await fetch(`${authentikUrl}/application/o/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${appUrl}/api/auth/authentik/callback`,
      })
    });
    
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Failed to get token');

    const userInfoRes = await fetch(`${authentikUrl}/application/o/userinfo/`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userInfo = await userInfoRes.json();

    if (!userInfo.email) {
      throw new Error('No email provided by Authentik');
    }

    const normalizedEmail = userInfo.email.trim().toLowerCase();
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      const tempPass = crypto.randomBytes(8).toString('hex');
      const hashedPassword = await bcrypt.hash(tempPass, 10);
      user = await User.create({
        displayName: userInfo.name || userInfo.preferred_username || normalizedEmail,
        email: normalizedEmail,
        role: UserRole.VIEWER,
        password: hashedPassword,
        mustChangePassword: false,
        isActive: true
      });
    } else if (!user.isActive) {
      return res.status(403).send('Account is deactivated');
    }

    const token = generateToken(user._id.toString());
    
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
  } catch (error: any) {
    console.error('Authentik callback error:', error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     description: Authenticates a operator with their registered email address and password, returning a JWT token and user profile details.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@cda.gov.ph
 *               password:
 *                 type: string
 *                 format: password
 *                 example: admin123
 *     responses:
 *       200:
 *         description: Successfully authenticated. Returns JWT token and profile.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT access token for auth
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     displayName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     mustChangePassword:
 *                       type: boolean
 *       400:
 *         description: Bad request (missing email or password)
 *       401:
 *         description: Unauthorized (invalid credentials)
 *       403:
 *         description: Forbidden (account is deactivated)
 *       500:
 *         description: Internal Server Error
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const normalizedEmail = email.trim().toLowerCase().replace(/\.\.+/g, '.');

  try {
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

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
 *     description: Registers a new monitoring operator or evaluator, generates a temporary password, and sends a welcome notification email.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - displayName
 *               - email
 *               - role
 *             properties:
 *               displayName:
 *                 type: string
 *                 example: Juan Dela Cruz
 *               email:
 *                 type: string
 *                 format: email
 *                 example: juan.delacruz@cda.gov.ph
 *               role:
 *                 type: string
 *                 enum: [ADMIN, ANALYST, REGIONAL_ANALYST, VIEWER]
 *                 example: REGIONAL_ANALYST
 *               region:
 *                 type: string
 *                 example: REGION_III
 *     responses:
 *       201:
 *         description: User created and email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 emailSent:
 *                   type: boolean
 *                 tempPassword:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     displayName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     region:
 *                       type: string
 *       400:
 *         description: Bad request (user already exists or missing criteria)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden (requires ADMIN role)
 *       500:
 *         description: Server error during user creation
 */
router.post('/users', protect, restrictTo(UserRole.ADMIN), async (req: any, res) => {
  const { displayName, email, role, region } = req.body;
  const currentUser = req.user;

  if (!displayName || !email || !role) {
    return res.status(400).json({ message: 'Display name, email, and role are required' });
  }

  const normalizedEmail = email.trim().toLowerCase().replace(/\.\.+/g, '.');
  let finalRegion = region;

  try {
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Generate random temporary password
    const tempPass = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPass, 10);

    const newUser = await User.create({
      displayName,
      email: normalizedEmail,
      role,
      region: finalRegion,
      password: hashedPassword,
      mustChangePassword: true
    });

    // Send welcome email
    const emailSent = await sendWelcomeEmail(normalizedEmail, displayName, tempPass);

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
 *     description: Retrieves list of all registered personnel, sorted by registration date.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of registered users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   displayName:
 *                     type: string
 *                   email:
 *                     type: string
 *                   role:
 *                     type: string
 *                   region:
 *                     type: string
 *                   isActive:
 *                     type: boolean
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (requires ADMIN role)
 *       500:
 *         description: Server error retrieving users
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
 *     description: Updates the operational role or regional delegation of a user by their MongoDB ID.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the user record
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [ADMIN, ANALYST, REGIONAL_ANALYST, VIEWER]
 *                 example: ANALYST
 *               region:
 *                 type: string
 *                 example: NCR
 *     responses:
 *       200:
 *         description: Role and regional constraints updated successfully
 *       400:
 *         description: Invalid parameters or role specified
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden (Admin only)
 *       404:
 *         description: User record not found
 *       500:
 *         description: Server error updating role
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
 *     description: Enables or disables a user account, preventing further sign-ins. Users cannot deactivate their own session account.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: User MongoDB ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isActive
 *             properties:
 *               isActive:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Active status updated successfully
 *       400:
 *         description: Bad request or attempt to deactivate self
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden (Admin only)
 *       404:
 *         description: User record not found
 *       500:
 *         description: Server error changing user status
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
 *     description: Permanently removes a personnel record of an operator or analyst from the system registration. A user is prevented from deleting their own account.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: User MongoDB ID
 *     responses:
 *       200:
 *         description: Personnel account deleted successfully
 *       400:
 *         description: Attempt to delete self
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden (Admin only)
 *       404:
 *         description: User record not found
 *       500:
 *         description: Server error deleting user
 */

/**
 * @swagger
 * /api/auth/users/{id}:
 *   patch:
 *     summary: Update user details (Admin Only)
 *     description: Selectively modifies displayName, role, region, and active state of a specific personnel.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: User MongoDB ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *                 example: Juan Cruz
 *               role:
 *                 type: string
 *                 enum: [ADMIN, ANALYST, REGIONAL_ANALYST, VIEWER]
 *               region:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User details updated successfully
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error updating user details
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

/**
 * @swagger
 * /api/auth/users/{id}:
 *   delete:
 *     summary: Delete a user
 *     description: Permanently deletes a user from the system. Requires ADMIN role.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error deleting user
 */
router.delete('/users/:id', protect, restrictTo(UserRole.ADMIN), async (req: any, res) => {
  const { id } = req.params;
  console.log(`[DELETE USER] Attempting to delete user with ID: ${id}`);

  try {
    const user = await User.findById(id);
    if (!user) {
      console.log(`[DELETE USER] User not found: ${id}`);
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === UserRole.ADMIN && user.email === 'admin@cda.gov.ph') {
      console.log(`[DELETE USER] Cannot delete master admin`);
      return res.status(403).json({ message: 'Cannot delete the master admin account' });
    }

    await User.findByIdAndDelete(id);
    console.log(`[DELETE USER] Successfully deleted user: ${id}`);

    // Log the deletion
    await logAction(
      req.user._id.toString(),
      'USER_DELETED',
      `Personnel ${user.email} was permanently deleted`,
      'USER',
      id
    );

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(`[DELETE USER] Error deleting user:`, error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change user password
 *     description: Updates the access password of the currently authenticated user. Required 6+ characters.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 minimum: 6
 *                 example: MyCoolNewSecret123
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Invalid password length
 *       401:
 *         description: Unauthenticated
 *       500:
 *         description: Server error updating password
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
 *     description: Returns the user display credentials, regional bindings, and operational status of the calling JWT session.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     displayName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     region:
 *                       type: string
 *                     mustChangePassword:
 *                       type: boolean
 *       401:
 *         description: Unauthenticated
 *       500:
 *         description: Server retrieval error
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
