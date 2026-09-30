// frontend/js/common.js
// Define the base URL for your API. Match your backend's PORT.
const API_BASE_URL = 'http://localhost:5000';

// Function to display messages consistently
function showMessage(elementId, text, type) {
    const messageDiv = document.getElementById(elementId);
    if (messageDiv) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`; // 'success' or 'error'
        messageDiv.style.display = 'block';
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000); // Hide after 5 seconds
    }
}

// Global logout function
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user'); // Remove the full user object
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    alert('You have been logged out.');
    window.location.href = '/login.html';
}

// Attach logout listener to button (if present on the page)
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});

// Store authentication data (token, user info) in localStorage
function storeAuthData(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    // Also store individual items as your existing code does
    localStorage.setItem('userName', user.name);
    localStorage.setItem('userRole', user.role);
}

// Clear authentication data from localStorage
function clearAuthData() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
}

// Get JWT token from localStorage
function getToken() {
    return localStorage.getItem('token');
}

// Get user info from localStorage
function getUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

// Helper for authenticated API fetch requests
async function authenticatedFetch(url, options = {}, messageElementId = 'message') {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers, // Allows overriding or adding other headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`; // Add the token to Authorization header
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    // Handle unauthorized/forbidden responses globally
    if (!response.ok && (response.status === 401 || response.status === 403)) {
        showMessage(messageElementId, 'Session expired or unauthorized. Please log in again.', 'error');
        clearAuthData(); // Clear invalid data
        setTimeout(() => {
            window.location.href = 'login.html'; // Redirect to login
        }, 1500);
        throw new Error('Unauthorized or Forbidden'); // Propagate error
    }

    return response;
}

/**
 * Global API Fetch Wrapper
 * Automatically attaches JWT bearer tokens to outbound requests and handles 401 Unauthorized errors.
 */
async function apiFetch(url, options = {}) {
    const token = localStorage.getItem('token');

    // Merge existing headers with Authorization & Content-Type
    options.headers = {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    try {
        const response = await fetch(url, options);

        // If session was invalidated in PostgreSQL (e.g., taken over on another device)
        if (response.status === 401) {
            alert('Your session has been terminated because your account logged in on another device.');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
            return null;
        }

        return response;
    } catch (error) {
        console.error('API Request Network Error:', error);
        throw error;
    }
}

/**
 * Global Session Heartbeat
 * Periodically verifies if the current token is still valid in the database.
 * Kicks off active dashboard users within 10 seconds of session takeover.
 */
function startSessionHeartbeat(intervalMs = 10000) {
    setInterval(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            // Point explicitly to backend port 5000 if running frontend on port 3000
            const apiUrl = window.location.port === '3000' 
                ? 'http://localhost:5000/api/auth/verify-session' 
                : '/api/auth/verify-session';

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                alert('Your session was taken over by another device.');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = 'login.html';
            }
        } catch (err) {
            console.error('Session Heartbeat Check Failed:', err);
        }
    }, intervalMs);
}

/**
 * Utility to get current authenticated user data
 */
function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch {
        return null;
    }
}

/**
 * Global Logout Action
 */
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

// Automatically start session heartbeat check on dashboard pages
document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.pathname.endsWith('login.html')) {
        startSessionHeartbeat();
    }
});
