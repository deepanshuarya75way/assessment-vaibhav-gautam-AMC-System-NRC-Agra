const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const { query } = require('../config/db');

const ROLE_TABLES = {
    admin: 'admins',
    user: 'users',
    technician: 'technicians',
};

// Checks the token is valid, then loads the matching user from the correct table
const protect = asyncHandler(async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            const tableName = ROLE_TABLES[decoded.role];
            if (!tableName) {
                return res.status(401).json({ message: 'Not authorized, unknown role in token.' });
            }

            const result = await query(`SELECT id, name, email FROM ${tableName} WHERE id = $1`, [decoded.id]);
            const user = result.rows[0];

            if (!user) {
                return res.status(401).json({ message: 'Not authorized, user not found.' });
            }

            // ONLY CHECK SESSIONS FOR USER AND NOT FOR TECHNICIANS OR ADMINS
            if (decoded.role === 'user') {
                const sessionRes = await query(
                    `SELECT * FROM user_sessions WHERE user_id = $1 AND token = $2`,
                    [decoded.id, token]
                );
                 if (sessionRes.rows.length === 0) {
                    return res.status(401).json({
                        message: 'Sessions invalidated. Please log in again.'
                    });
                }
                await query(
                    `UPDATE user_sessions SET last_active = NOW() WHERE user_id = $1 AND token = $2`,
                    [decoded.id, token]
                );
            }

            req.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: decoded.role,
            };

            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'Not authorized, token expired.' });
            } else if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ message: 'Not authorized, invalid token.' });
            } else {
                return res.status(401).json({ message: 'Not authorized, token verification failed.' });
            }
        }
    } else {
        return res.status(401).json({ message: 'Not authorized, no token provided.' });
    }
});

// Restricts a route to specific roles, e.g. authorize('admin') or authorize('admin', 'technician')
const authorize = (...roles) => {
    const allowedRoles = roles.flat().map(r => String(r).trim());
    return (req, res, next) => {
        const userRole = req.user ? String(req.user.role).trim() : null;

        if (!userRole || !allowedRoles.includes(userRole)) {
            return res.status(403).json({ message: 'Not authorized to access this route. Insufficient permissions.' });
        }
        next();
    };
};

module.exports = { protect, authorize };