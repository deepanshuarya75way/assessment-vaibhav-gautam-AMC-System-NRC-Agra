// frontend/js/login.js
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const passwordInput = document.getElementById('password');
    const API_BASE_URL = 'http://localhost:5000';

    // Requirement Elements
    const lengthReq = document.getElementById('length-req');
    const lowercaseReq = document.getElementById('lowercase-req');
    const uppercaseReq = document.getElementById('uppercase-req');
    const numberReq = document.getElementById('number-req');
    const specialReq = document.getElementById('special-req');

    // Function to update the validation list UI
    function validatePasswordUI(password) {
        const rules = {
            length: password.length >= 8,
            lowercase: /[a-z]/.test(password),
            uppercase: /[A-Z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[^A-Za-z0-9]/.test(password)
        };

        // Update classes and icons helper
        const updateClass = (element, isValid, text) => {
            if (isValid) {
                element.className = 'criterion-valid';
                element.textContent = `✓ ${text}`;
            } else {
                element.className = 'criterion-invalid';
                element.textContent = `✕ ${text}`;
            }
        };

        updateClass(lengthReq, rules.length, 'At least 8 characters');
        updateClass(lowercaseReq, rules.lowercase, 'At least 1 lowercase letter');
        updateClass(uppercaseReq, rules.uppercase, 'At least 1 uppercase letter');
        updateClass(numberReq, rules.number, 'At least 1 numeral');
        updateClass(specialReq, rules.special, 'At least 1 special character');

        // Returns true only if all rules pass
        return Object.values(rules).every(val => val === true);
    }

    // Dynamic verification as the user types
    if (passwordInput) {
        passwordInput.addEventListener('input', (e) => {
            validatePasswordUI(e.target.value);
        });
    }

    if (loginForm) {
        async function loginUser(email, password, role) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role })
        });

        const data = await res.json();

        if (!res.ok) {
            // Handle server error message display
            const errorMsg = data.message || 'Login failed. Invalid credentials.';
            showMessage('loginMessage', errorMsg, 'error');
            return;
        }

        // Active session detected -> show session takeover modal
        if (data.requiresTakeover) {
            if (typeof showTakeoverModal === 'function') {
                showTakeoverModal(data.existingSession, data.takeoverToken);
            } else {
                console.warn('Takeover requested, but showTakeoverModal() is missing.');
            }
            return;
        }

        // Standard Login Successful -> Save Auth Tokens
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.user?.name) localStorage.setItem('userName', data.user.name);
        if (data.user?.role) localStorage.setItem('userRole', data.user.role);

        showMessage('loginMessage', data.message || 'Login successful!', 'success');

        // Role-based Redirection
        const userRole = data.user?.role || role;
        if (userRole === 'admin') {
            window.location.href = 'admindashboard.html';
        } else if (userRole === 'technician') {
            window.location.href = 'technicianDashboard.html';
        } else {
            window.location.href = 'userDashboard.html';
        }

    } catch (error) {
        console.error('Error during login fetch:', error);
        showMessage('loginMessage', 'Network error during login. Please ensure the server is running.', 'error');
    }
}

// Form Submission Event Listener
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = passwordInput.value.trim();
        const role = document.getElementById('role').value;

        if (!email || !password) {
            showMessage('loginMessage', 'Please enter both email and password.', 'error');
            return;
        }

        const isPasswordValid = validatePasswordUI(password);
        if (!validatePasswordUI(password)) {
            showMessage('loginMessage', 'Password does not meet the specified complexity guidelines.', 'error');
            return;
        }

        // Execute login
        await loginUser(email, password, role);
    });
}
    }
});


