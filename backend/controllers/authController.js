// backend/controllers/authController.js
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const nodemailer   = require('nodemailer');
const { query }    = require('../config/db');
const JWT_SECRET = process.env.JWT_SECRET || 'default_fallback_jwt_secret_key_123';

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass || user.includes('your_') || pass.includes('your_')) {
        console.warn(
            '[email] EMAIL_USER / EMAIL_PASS not configured in .env — ' +
            'registration emails will be skipped.'
        );
        return null;
    }

    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
    });

    return transporter;
}

async function sendEmailSafely(mailOptions) {
    const t = getTransporter();
    if (!t) return;
    try {
        const info = await t.sendMail(mailOptions);
        console.log(`[email] Sent to ${mailOptions.to} — messageId: ${info.messageId}`);
    } catch (err) {
        console.error(`[email] Failed to send to ${mailOptions.to}:`, err.message);
    }
}

function buildRegistrationEmail(name, email, role) {
    const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);
    const year        = new Date().getFullYear();

    return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Account Created Successfully</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f3f4f6;padding:36px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:14px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,0.09);max-width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#0B3B75 0%,#1a5fa8 100%);
                     padding:32px 40px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,215,0,0.18);
                        border-radius:12px;padding:12px 16px;margin-bottom:14px;">
              <span style="font-size:28px;font-weight:700;color:#FFD700;
                           letter-spacing:1px;">NCR</span>
            </div>
            <h1 style="color:#FFD700;font-size:19px;margin:0 0 4px;font-weight:700;">
              North Central Railway
            </h1>
            <p style="color:rgba(255,255,255,0.80);font-size:12.5px;margin:0;">
              AMC Complaint Management System
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 28px;">
            <h2 style="color:#0B3B75;font-size:17px;font-weight:700;margin:0 0 6px;">
              Hello, ${name}!
            </h2>
            <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 26px;">
              Your account has been <strong>successfully created</strong> in the
              North Central Railway AMC Complaint Management System.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f0f5ff;border:1px solid #c7d7f9;
                          border-radius:10px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="color:#0B3B75;font-size:11.5px;font-weight:700;
                             text-transform:uppercase;letter-spacing:0.6px;
                             margin:0 0 14px;">Account Details</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:9px 0;border-bottom:1px solid #dbe4f7;
                                 color:#6b7280;font-size:13px;font-weight:600;width:110px;">
                        Role
                      </td>
                      <td style="padding:9px 0;border-bottom:1px solid #dbe4f7;
                                 color:#111827;font-size:13px;font-weight:700;">
                        ${roleDisplay}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:9px 0;color:#6b7280;font-size:13px;font-weight:600;">
                        Email
                      </td>
                      <td style="padding:9px 0;color:#111827;font-size:13px;">
                        ${email}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#fffbeb;border:1px solid #fde68a;
                          border-radius:10px;margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="color:#92400e;font-size:13px;line-height:1.65;margin:0;">
                    <strong>🔐 Security Notice:</strong> Your password is stored
                    securely and is not included in this email.
                  </p>
                </td>
              </tr>
            </table>
            <p style="color:#374151;font-size:14px;line-height:1.7;margin:0;">
              You can now log in using your registered email address and password.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;
                     padding:18px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
              Regards,<br>
              <strong style="color:#6b7280;">
                North Central Railway AMC Complaint Management System
              </strong><br>
              North Central Railway • Agra Division • Authorized Access Only<br>
              <span style="font-size:11px;">© ${year} North Central Railway. All rights reserved.</span>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Role → DB table mapping ──────────────────────────────────────────────────
const ROLE_TABLES = {
    admin:      'admins',
    user:       'users',
    technician: 'technicians',
};

// ─── JWT helper ───────────────────────────────────────────────────────────────
const generateToken = (id, role, name) =>
    jwt.sign({ id, role, name }, process.env.JWT_SECRET, { expiresIn: '1h' });

// ─── Validation helpers ───────────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[6-9]\d{9}$/;

function validatePasswordStrength(pwd) {
    const errors = [];
    if (!pwd || pwd.length < 8)        errors.push('at least 8 characters');
    if (!/[A-Z]/.test(pwd))            errors.push('an uppercase letter');
    if (!/[a-z]/.test(pwd))            errors.push('a lowercase letter');
    if (!/[0-9]/.test(pwd))            errors.push('a number');
    if (!/[^A-Za-z0-9]/.test(pwd))     errors.push('a special character');
    return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════════════════════════════
const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password, role, phone } = req.body;

    // Determine role and whether registering as admin / technician
    const resolvedRole = ROLE_TABLES[role] ? role : 'user';
    const isAdmin      = resolvedRole === 'admin';
    const isTechnician = resolvedRole === 'technician';
    const tableName    = ROLE_TABLES[resolvedRole];

    // ── 1. Basic presence check ───────────────────────────────────────────────
    if (!name || !email || !password) {
        res.status(400);
        throw new Error('Name, email, and password are required.');
    }

    // Phone required only for user and technician
    if (!isAdmin && !phone) {
        res.status(400);
        throw new Error('Phone number is required.');
    }

    // ── 2. Name length ────────────────────────────────────────────────────────
    if (name.trim().length < 2) {
        res.status(400);
        throw new Error('Full name must be at least 2 characters.');
    }

    // ── 3. Email format ───────────────────────────────────────────────────────
    if (!EMAIL_REGEX.test(email.trim())) {
        res.status(400);
        throw new Error('Please provide a valid email address.');
    }

    // Normalize email for explicit authorization checking
    const normalizedEmail = email.trim().toLowerCase();

    // ── HARD LINKED SECURITY LOCK: Limit Admin roles to exactly 2 email addresses ──
    if (isAdmin) {
        const ALLOWED_ADMINS = ['adminagc@gmail.com', 'coadminagc@gmail.com'];
        if (!ALLOWED_ADMINS.includes(normalizedEmail)) {
            res.status(403); // Forbidden
            throw new Error('Unauthorized: This email address is not permitted to register as an Administrator.');
        }
    }

    // ── HARD LINKED SECURITY LOCK: Limit Technician roles to exactly 3 email addresses ──
    if (isTechnician) {
        const ALLOWED_TECHNICIANS = ['amctech01@gmail.com', 'amctech02@gmail.com', 'amctech03@gmail.com'];
        if (!ALLOWED_TECHNICIANS.includes(normalizedEmail)) {
            res.status(403); // Forbidden
            throw new Error('Unauthorized: This email address is not permitted to register as a Technician.');
        }
    }

    // ── 4. Phone validation (skipped for admin) ───────────────────────────────
    const cleanPhone = (!isAdmin && phone) ? String(phone).trim() : null;
    if (!isAdmin && (!cleanPhone || !PHONE_REGEX.test(cleanPhone))) {
        res.status(400);
        throw new Error('Please provide a valid 10-digit Indian mobile number (starting with 6-9).');
    }

    // ── 5. Password strength ──────────────────────────────────────────────────
    const pwdErrors = validatePasswordStrength(password);
    if (pwdErrors.length > 0) {
        res.status(400);
        throw new Error(`Password too weak. It must contain: ${pwdErrors.join(', ')}.`);
    }

    // ── 6. Duplicate email check ──────────────────────────────────────────────
    const existsResult = await query(
        `SELECT id FROM ${tableName} WHERE email = $1`,
        [normalizedEmail]
    );
    if (existsResult.rows.length > 0) {
        res.status(400);
        throw new Error(`An account with this email already exists as a ${resolvedRole}.`);
    }

    // ── 7. Hash password ──────────────────────────────────────────────────────
    const salt           = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // ── 8. INSERT — admin uses 3 columns, user/technician uses 4 (with phone) ─
    let result;
    if (isAdmin) {
        // admins table has NO phone column — do not include it
        result = await query(
            `INSERT INTO admins (name, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, name, email`,
            [name.trim(), normalizedEmail, hashedPassword]
        );
    } else {
        // users and technicians tables have phone column
        result = await query(
            `INSERT INTO ${tableName} (name, email, password_hash, phone)
             VALUES ($1, $2, $3, $4)
             RETURNING id, name, email, phone`,
            [name.trim(), normalizedEmail, hashedPassword, cleanPhone]
        );
    }

    const newUser = result.rows[0];

    if (!newUser) {
        res.status(500);
        throw new Error('Account creation failed. Please try again.');
    }

    // ── 9. Send confirmation email ────────────────────────────────────────────
    const fromAddress = process.env.EMAIL_FROM
        || `NCR AMC Portal <${process.env.EMAIL_USER}>`;

    await sendEmailSafely({
        from:    fromAddress,
        to:      newUser.email,
        subject: 'Account Created Successfully',
        html:    buildRegistrationEmail(newUser.name, newUser.email, resolvedRole),
    });

    // ── 10. Respond ───────────────────────────────────────────────────────────
    res.status(201).json({
        message: `${resolvedRole.charAt(0).toUpperCase() + resolvedRole.slice(1)} registered successfully!`,
        token:   generateToken(newUser.id, resolvedRole, newUser.name),
        user: {
            id:    newUser.id,
            name:  newUser.name,
            email: newUser.email,
            phone: newUser.phone || null,
            role:  resolvedRole,
        },
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400);
        throw new Error('Email and password are required.');
    }

    const result = await query(
        'SELECT * FROM users WHERE email = $1',
        [email]
    );

    if (result.rows.length === 0) {
        res.status(401);
        throw new Error('Invalid email or password.');
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
        res.status(401);
        throw new Error('Invalid email or password.');
    }

    // Get device info from request
    const UAParser = require('ua-parser-js');
    const ua = new UAParser(req.headers['user-agent']);
    const device = ua.getDevice().type || 'Desktop';
    const browser = `${ua.getBrowser().name || 'Unknown'} ${ua.getBrowser().version || ''}`.trim();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';

    // Check existing session
    const existingSession = await query(
        `SELECT * FROM user_sessions WHERE user_id = $1`,
        [user.id]
    );

    if (existingSession.rows.length > 0) {
        const existing = existingSession.rows[0];

        // Return existing session info — frontend will show takeover prompt
        return res.status(200).json({
            requiresTakeover: true,
            existingSession: {
                device: existing.device,
                browser: existing.browser,
                ip_address: existing.ip_address,
                last_active: existing.last_active
            },
            // Send a temp token so frontend can call /takeover
            takeoverToken: Buffer.from(`${user.id}:${email}:${password}`).toString('base64')
        });
    }

    // No existing session — log in normally
    const JWT_SECRET = process.env.JWT_SECRET || 'default_fallback_jwt_secret_key_123';
    const token = jwt.sign(
        { id: user.id, role: user.role || 'user' },
        JWT_SECRET,
        { expiresIn: '8h' }
    );

    await query('DELETE FROM user_sessions WHERE user_id = $1', [user.id]);
    

    // Store session
    await query(
        `INSERT INTO user_sessions (user_id, token, device, browser, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, token, device, browser, ip]
    );

    res.json({
        requiresTakeover: false,
        token,
        user: { id: user.id, name: user.name, email: user.email, role: 'user' }
    });
});
const takeoverSession = asyncHandler(async (req, res) => {
    const { takeoverToken, action } = req.body;

    if (!takeoverToken || !action) {
        return res.status(400).json({ success: false, message: 'takeoverToken and action are required.' });
    }

    if (!['takeover', 'cancel'].includes(action)) {
        return res.status(400).json({ success: false, message: 'action must be "takeover" or "cancel".' });
    }

    if (action === 'cancel') {
        return res.json({ success: true, message: 'Login cancelled. Existing session remains active.' });
    }

    // Decode temp token
    let userId, email, password;
    try {
        const decoded = Buffer.from(takeoverToken, 'base64').toString('utf-8');
        [userId, email, password] = decoded.split(':');
        userId = parseInt(userId, 10);
    } catch {
        return res.status(400).json({ success: false, message: 'Invalid takeover token.' });
    }

    if (!userId || isNaN(userId)) {
        return res.status(400).json({ success: false, message: 'Invalid user ID in takeover token.' });
    }

    // Verify user
    const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const user = result.rows[0];

    // Get device info
    const UAParser = require('ua-parser-js');
    const ua = new UAParser(req.headers['user-agent']);
    const device = ua.getDevice().type || 'Desktop';
    const browser = `${ua.getBrowser().name || 'Unknown'} ${ua.getBrowser().version || ''}`.trim();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';

    // Invalidate old session
    await query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);

    // Create new JWT
    const JWT_SECRET = process.env.JWT_SECRET || 'default_fallback_jwt_secret_key_123';
    const token = jwt.sign(
        { id: user.id, role: user.role || 'user' },
        JWT_SECRET,
        { expiresIn: '8h' }
    );

    // Store new session
    await query(
        `INSERT INTO user_sessions (user_id, token, device, browser, ip_address) 
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, token, device, browser, ip]
    );

    return res.json({
        success: true,
        message: 'Session taken over successfully. Previous session invalidated.',
        token: token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role || 'user'
        }
    });
});

module.exports = {
    // Keep your existing controller exports here, including takeoverSession
    takeoverSession
};


exports.takeoverSession = asyncHandler(async (req, res) => {
    const { takeoverToken, action } = req.body;

    if (action === 'cancel') {
        return res.json({ success: true, message: 'Takeover canceled' });
    }

    if (!takeoverToken) {
        return res.status(400).json({ success: false, message: 'Takeover token missing' });
    }

    // Safely decode base64 token
    const decoded = Buffer.from(takeoverToken, 'base64').toString('utf-8');
    const [userId, email, password] = decoded.split(':');

    if (!userId) {
        return res.status(400).json({ success: false, message: 'Invalid token structure' });
    }

    // Delete existing session rows for this user
    await query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);

    // Sign new JWT token
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_123';
    
    // Fetch user details
    const userResult = await query('SELECT id, name, email, role FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    const token = jwt.sign(
        { id: user.id, role: user.role || 'user' },
        JWT_SECRET,
        { expiresIn: '8h' }
    );

    // Get client info
    const UAParser = require('ua-parser-js');
    const ua = new UAParser(req.headers['user-agent']);
    const device = ua.getDevice().type || 'Desktop';
    const browser = `${ua.getBrowser().name || 'Unknown'} ${ua.getBrowser().version || ''}`.trim();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';

    // Insert fresh session row
    await query(
        `INSERT INTO user_sessions (user_id, token, device, browser, ip_address) 
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, token, device, browser, ip]
    );

    return res.json({
        success: true,
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role || 'user' }
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// FORGOT PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');

const forgotPassword = asyncHandler(async (req, res) => {
    const { email, role } = req.body;

    if (!email) {
        res.status(400);
        throw new Error('Please provide your email address.');
    }

    if (!EMAIL_REGEX.test(email.trim())) {
        res.status(400);
        throw new Error('Please provide a valid email address.');
    }

    const rolesToCheck = ROLE_TABLES[role] ? [role] : Object.keys(ROLE_TABLES);
    let foundUser  = null;
    let foundTable = null;

    for (const r of rolesToCheck) {
        const tableName = ROLE_TABLES[r];
        const result = await query(
            `SELECT id, name, email FROM ${tableName} WHERE email = $1`,
            [email.trim().toLowerCase()]
        );
        if (result.rows.length > 0) {
            foundUser  = result.rows[0];
            foundTable = tableName;
            break;
        }
    }

    if (!foundUser) {
        return res.json({ message: 'If this email is registered, a reset link has been sent.' });
    }

    const resetToken   = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 60 * 60 * 1000);

    await query(
        `UPDATE ${foundTable}
         SET reset_password_token = $1, reset_password_expires = $2
         WHERE id = $3`,
        [resetToken, tokenExpires, foundUser.id]
    );

    const frontendURL = process.env.FRONTEND_URL || 'http://localhost:5500';
    const resetLink   = `${frontendURL}/frontend/reset-password.html?token=${resetToken}&email=${encodeURIComponent(foundUser.email)}`;

    const fromAddress = process.env.EMAIL_FROM || `NCR AMC Portal <${process.env.EMAIL_USER}>`;
    await sendEmailSafely({
        from:    fromAddress,
        to:      foundUser.email,
        subject: 'Password Reset Request — NCR AMC Portal',
        html:    buildPasswordResetEmail(foundUser.name, resetLink),
    });

    res.json({ message: 'If this email is registered, a reset link has been sent.' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESET PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════
const resetPassword = asyncHandler(async (req, res) => {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
        res.status(400);
        throw new Error('Token, email, and new password are all required.');
    }

    const pwdErrors = validatePasswordStrength(newPassword);
    if (pwdErrors.length > 0) {
        res.status(400);
        throw new Error(`Password too weak. It must contain: ${pwdErrors.join(', ')}.`);
    }

    let foundUser  = null;
    let foundTable = null;

    for (const r of Object.keys(ROLE_TABLES)) {
        const tableName = ROLE_TABLES[r];
        const result = await query(
            `SELECT id, name, email FROM ${tableName}
             WHERE email = $1
               AND reset_password_token = $2
               AND reset_password_expires > NOW()`,
            [email.trim().toLowerCase(), token]
        );
        if (result.rows.length > 0) {
            foundUser  = result.rows[0];
            foundTable = tableName;
            break;
        }
    }

    if (!foundUser) {
        res.status(400);
        throw new Error('This reset link is invalid or has expired. Please request a new one.');
    }

    const salt           = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await query(
        `UPDATE ${foundTable}
         SET password_hash = $1,
             reset_password_token = NULL,
             reset_password_expires = NULL
         WHERE id = $2`,
        [hashedPassword, foundUser.id]
    );

    res.json({ message: 'Password reset successfully! You can now log in with your new password.' });
});



// ─── Email template: Password Reset ──────────────────────────────────────────
function buildPasswordResetEmail(name, resetLink) {
    const year = new Date().getFullYear();
    return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Password Reset Request</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f3f4f6;padding:36px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:14px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,0.09);max-width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#0B3B75 0%,#1a5fa8 100%);
                     padding:32px 40px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,215,0,0.18);
                        border-radius:12px;padding:12px 16px;margin-bottom:14px;">
              <span style="font-size:28px;font-weight:700;color:#FFD700;letter-spacing:1px;">NCR</span>
            </div>
            <h1 style="color:#FFD700;font-size:19px;margin:0 0 4px;font-weight:700;">
              North Central Railway
            </h1>
            <p style="color:rgba(255,255,255,0.80);font-size:12.5px;margin:0;">
              AMC Complaint Management System
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 28px;">
            <h2 style="color:#0B3B75;font-size:17px;font-weight:700;margin:0 0 6px;">
              Hello, ${name}!
            </h2>
            <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 24px;">
              We received a request to reset your password.
              Click the button below. This link expires in <strong>1 hour</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center" style="padding:8px 0 28px;">
                  <a href="${resetLink}"
                     style="display:inline-block;padding:14px 36px;
                            background:linear-gradient(135deg,#0B3B75,#1a5fa8);
                            color:#FFD700;text-decoration:none;border-radius:10px;
                            font-size:16px;font-weight:700;">
                    Reset My Password
                  </a>
                </td>
              </tr>
            </table>
            <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 8px;">
              Or copy this link into your browser:
            </p>
            <p style="word-break:break-all;color:#1a5fa8;font-size:13px;margin:0 0 24px;">
              ${resetLink}
            </p>
            <p style="color:#9ca3af;font-size:13px;margin:0;">
              If you did not request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;
                     padding:18px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
              Regards,<br>
              <strong style="color:#6b7280;">North Central Railway AMC Complaint Management System</strong><br>
              North Central Railway • Agra Division • Authorized Access Only<br>
              <span style="font-size:11px;">© ${year} North Central Railway. All rights reserved.</span>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { registerUser, loginUser, forgotPassword, resetPassword, loginUser, takeoverSession};