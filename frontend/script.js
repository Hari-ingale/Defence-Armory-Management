//API Configuration
const API_BASE_URL = 'http://localhost:8001/api';

// State Management
let currentUser = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkAuthStatus();
});

// Setup Event Listeners
function setupEventListeners() {
    // Login Form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Logout Button
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Register Soldier Form
    document.getElementById('registerForm').addEventListener('submit', handleRegisterSoldier);
    
    // Issue Weapon Form
    document.getElementById('issueForm').addEventListener('submit', handleIssueWeapon);
    
    // Return Weapon Form
    document.getElementById('returnForm').addEventListener('submit', handleReturnWeapon);
    
    // Search Soldier Form
    document.getElementById('searchForm').addEventListener('submit', handleSearchSoldier);
}

// Authentication
function checkAuthStatus() {
    const user = localStorage.getItem('armory_user');
    if (user) {
        currentUser = JSON.parse(user);
        showDashboard();
    } else {
        showLogin();
    }
}

function showLogin() {
    loginScreen.classList.add('active');
    dashboardScreen.classList.remove('active');
}

function showDashboard() {
    loginScreen.classList.remove('active');
    dashboardScreen.classList.add('active');
    
    if (currentUser) {
        document.getElementById('loggedInUser').textContent = currentUser.username;
    }
    
    // Load dashboard data
    loadTotalIssued();
}

// Login Handler
async function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const credentials = {
        username: formData.get('username'),
        password: formData.get('password')
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(credentials)
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('armory_user', JSON.stringify(data.user));
            showMessage('loginMessage', data.message, 'success');
            
            setTimeout(() => {
                showDashboard();
            }, 1000);
        } else {
            showMessage('loginMessage', data.message, 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('loginMessage', 'Failed to connect to server. Please try again.', 'error');
    }
}

// Logout Handler
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        currentUser = null;
        localStorage.removeItem('armory_user');
        showLogin();
        hideAllSections();
    }
}

// Register Soldier Handler
async function handleRegisterSoldier(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const soldierData = {
        soldier_id: formData.get('soldier_id'),
        name: formData.get('name'),
        rank: formData.get('rank'),
        unit: formData.get('unit'),
        phone: formData.get('phone') || null,
        email: formData.get('email') || null
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/register-soldier`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(soldierData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('registerMessage', data.message, 'success');
            e.target.reset();
            
            setTimeout(() => {
                hideMessage('registerMessage');
            }, 3000);
        } else {
            showMessage('registerMessage', data.message, 'error');
        }
    } catch (error) {
        console.error('Register error:', error);
        showMessage('registerMessage', 'Failed to register soldier. Please try again.', 'error');
    }
}

// Issue Weapon Handler
async function handleIssueWeapon(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const issueData = {
        soldier_id: formData.get('soldier_id'),
        weapon_id: formData.get('weapon_id'),
        weapon_type: formData.get('weapon_type'),
        serial_number: formData.get('serial_number'),
        issued_by: formData.get('issued_by') || 'ADMIN'
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/issue-weapon`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(issueData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('issueMessage', data.message, 'success');
            e.target.reset();
            loadTotalIssued();
            
            setTimeout(() => {
                hideMessage('issueMessage');
            }, 3000);
        } else {
            showMessage('issueMessage', data.message, 'error');
        }
    } catch (error) {
        console.error('Issue weapon error:', error);
        showMessage('issueMessage', 'Failed to issue weapon. Please try again.', 'error');
    }
}

// Return Weapon Handler
async function handleReturnWeapon(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const returnData = {
        weapon_id: formData.get('weapon_id'),
        condition: formData.get('condition'),
        returned_by: formData.get('returned_by') || 'ADMIN',
        remarks: formData.get('remarks') || null
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/return-weapon`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(returnData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('returnMessage', data.message, 'success');
            e.target.reset();
            loadTotalIssued();
            
            setTimeout(() => {
                hideMessage('returnMessage');
            }, 3000);
        } else {
            showMessage('returnMessage', data.message, 'error');
        }
    } catch (error) {
        console.error('Return weapon error:', error);
        showMessage('returnMessage', 'Failed to return weapon. Please try again.', 'error');
    }
}

// Search Soldier Handler
async function handleSearchSoldier(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const soldierId = formData.get('soldier_id');
    
    try {
        const response = await fetch(`${API_BASE_URL}/search-soldier/${soldierId}`);
        const data = await response.json();
        
        if (data.success) {
            displaySearchResults(data.soldier, data.weapons);
            hideMessage('searchMessage');
        } else {
            showMessage('searchMessage', data.message, 'error');
            document.getElementById('searchResults').innerHTML = '';
        }
    } catch (error) {
        console.error('Search error:', error);
        showMessage('searchMessage', 'Failed to search soldier. Please try again.', 'error');
        document.getElementById('searchResults').innerHTML = '';
    }
}

// Display Search Results
function displaySearchResults(soldier, weapons) {
    const resultsDiv = document.getElementById('searchResults');
    
    let html = `
        <div class=\"soldier-details\">
            <h3><i class=\"fas fa-user\"></i> Soldier Information</h3>
            <div class=\"detail-grid\">
                <div class=\"detail-item\">
                    <label>Soldier ID</label>
                    <span>${soldier.soldier_id}</span>
                </div>
                <div class=\"detail-item\">
                    <label>Name</label>
                    <span>${soldier.name}</span>
                </div>
                <div class=\"detail-item\">
                    <label>Rank</label>
                    <span>${soldier.rank}</span>
                </div>
                <div class=\"detail-item\">
                    <label>Unit</label>
                    <span>${soldier.unit}</span>
                </div>
                ${soldier.phone ? `
                <div class=\"detail-item\">
                    <label>Phone</label>
                    <span>${soldier.phone}</span>
                </div>
                ` : ''}
                ${soldier.email ? `
                <div class=\"detail-item\">
                    <label>Email</label>
                    <span>${soldier.email}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    if (weapons && weapons.length > 0) {
        html += `
            <div class=\"weapons-history\">
                <h3><i class=\"fas fa-history\"></i> Weapon History</h3>
                <div class=\"weapons-table\">
                    <table>
                        <thead>
                            <tr>
                                <th>Weapon ID</th>
                                <th>Type</th>
                                <th>Serial Number</th>
                                <th>Issue Date</th>
                                <th>Issued By</th>
                                <th>Return Date</th>
                                <th>Condition</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        weapons.forEach(weapon => {
            const status = weapon.return_date ? 'returned' : 'issued';
            html += `
                <tr>
                    <td>${weapon.weapon_id}</td>
                    <td>${weapon.weapon_type}</td>
                    <td>${weapon.serial_number}</td>
                    <td>${weapon.issue_date}</td>
                    <td>${weapon.issued_by}</td>
                    <td>${weapon.return_date || '-'}</td>
                    <td>${weapon.condition || '-'}</td>
                    <td><span class=\"status-badge ${status}\">${status}</span></td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } else {
        html += `
            <div class=\"weapons-history\">
                <h3><i class=\"fas fa-history\"></i> Weapon History</h3>
                <p style=\"color: #718096; padding: 20px; text-align: center;\">No weapon records found for this soldier.</p>
            </div>
        `;
    }
    
    resultsDiv.innerHTML = html;
}

// Load Total Issued Weapons
async function loadTotalIssued() {
    try {
        const response = await fetch(`${API_BASE_URL}/total-issued`);
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('totalIssued').textContent = data.total;
        }
    } catch (error) {
        console.error('Error loading total issued:', error);
    }
}

// Show/Hide Sections
function showSection(sectionId) {
    hideAllSections();
    document.getElementById(sectionId).classList.add('active');
}

function hideAllSections() {
    const sections = document.querySelectorAll('.form-section');
    sections.forEach(section => section.classList.remove('active'));
    
    // Clear all messages
    const messages = document.querySelectorAll('.message');
    messages.forEach(msg => {
        msg.classList.remove('success', 'error');
        msg.style.display = 'none';
    });
}

// Message Helpers
function showMessage(elementId, message, type) {
    const messageEl = document.getElementById(elementId);
    messageEl.textContent = message;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
}

function hideMessage(elementId) {
    const messageEl = document.getElementById(elementId);
    messageEl.style.display = 'none';
}
// "