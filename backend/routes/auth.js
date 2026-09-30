const express = require('express');
const router = express.Router();
const { loginUser, takeoverSession } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware'); // Ensure protect middleware is imported

// Existing routes
router.post('/login', loginUser);
router.post('/takeover', takeoverSession);

// ADD THIS NEW ROUTE HERE:
router.get('/verify-session', protect, (req, res) => {
    res.json({ success: true, message: 'Session is active.' });
});

module.exports = router;