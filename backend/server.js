const express = require('express');
const oracledb = require('oracledb');
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Oracle DB Configuration
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SID}`
};

// Initialize Oracle connection pool
let pool;

async function initializeDatabase() {
  try {
    pool = await oracledb.createPool(dbConfig);
    console.log('✓ Oracle Database connection pool created');
    
    // Create admin user if not exists
    await createAdminUser();
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  }
}

// Create default admin user
async function createAdminUser() {
  let connection;
  try {
    connection = await pool.getConnection();
    
    // Check if admin exists
    const result = await connection.execute(
      `SELECT username FROM users WHERE username = :username`,
      [process.env.ADMIN_USERNAME]
    );
    
    if (result.rows.length === 0) {
      // Hash password and create admin
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      await connection.execute(
        `INSERT INTO users (username, password, role) VALUES (:username, :password, :role)`,
        [process.env.ADMIN_USERNAME, hashedPassword, 'ADMIN'],
        { autoCommit: true }
      );
      console.log('✓ Default admin user created');
    } else {
      console.log('✓ Admin user already exists');
    }
  } catch (err) {
    console.error('Error creating admin user:', err.message);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  let connection;
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }
    
    connection = await pool.getConnection();
    
    const result = await connection.execute(
      `SELECT username, password, role FROM users WHERE username = :username`,
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
    
    const user = {
      username: result.rows[0][0],
      password: result.rows[0][1],
      role: result.rows[0][2]
    };
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
    
    res.json({ 
      success: true, 
      message: 'Login successful',
      user: { username: user.username, role: user.role }
    });
    
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login' });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
});

// Register soldier
app.post('/api/register-soldier', async (req, res) => {
  let connection;
  try {
    const { soldier_id, name, rank, unit, phone, email } = req.body;
    
    if (!soldier_id || !name || !rank || !unit) {
      return res.status(400).json({ success: false, message: 'Required fields: soldier_id, name, rank, unit' });
    }
    
    connection = await pool.getConnection();
    
    // Check if soldier exists
    const checkResult = await connection.execute(
      `SELECT soldier_id FROM soldiers WHERE soldier_id = :soldier_id`,
      [soldier_id]
    );
    
    if (checkResult.rows.length > 0) {
      // Update existing soldier
      await connection.execute(
        `UPDATE soldiers 
         SET name = :name, rank = :rank, unit = :unit, phone = :phone, email = :email, updated_at = SYSDATE
         WHERE soldier_id = :soldier_id`,
        [name, rank, unit, phone, email, soldier_id],
        { autoCommit: true }
      );
      
      res.json({ success: true, message: 'Soldier record updated successfully', soldier_id });
    } else {
      // Insert new soldier
      await connection.execute(
        `INSERT INTO soldiers (soldier_id, name, rank, unit, phone, email)
         VALUES (:soldier_id, :name, :rank, :unit, :phone, :email)`,
        [soldier_id, name, rank, unit, phone, email],
        { autoCommit: true }
      );
      
      res.json({ success: true, message: 'Soldier registered successfully', soldier_id });
    }
    
  } catch (err) {
    console.error('Register soldier error:', err);
    res.status(500).json({ success: false, message: 'Error registering soldier: ' + err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
});

// Issue weapon
app.post('/api/issue-weapon', async (req, res) => {
  let connection;
  try {
    const { soldier_id, weapon_id, weapon_type, serial_number, issued_by } = req.body;
    
    if (!soldier_id || !weapon_id || !weapon_type || !serial_number) {
      return res.status(400).json({ success: false, message: 'Required fields: soldier_id, weapon_id, weapon_type, serial_number' });
    }
    
    connection = await pool.getConnection();
    
    // Check if soldier exists
    const soldierCheck = await connection.execute(
      `SELECT soldier_id FROM soldiers WHERE soldier_id = :soldier_id`,
      [soldier_id]
    );
    
    if (soldierCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Soldier not found. Please register the soldier first.' });
    }
    
    // Check if weapon is already issued
    const weaponCheck = await connection.execute(
      `SELECT issue_id FROM weapon_issue WHERE weapon_id = :weapon_id AND return_date IS NULL`,
      [weapon_id]
    );
    
    if (weaponCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Weapon is already issued to another soldier' });
    }
    
    // Call PL/SQL procedure to issue weapon
    await connection.execute(
      `BEGIN
         weapon_management_pkg.issue_weapon(
           p_soldier_id => :soldier_id,
           p_weapon_id => :weapon_id,
           p_weapon_type => :weapon_type,
           p_serial_number => :serial_number,
           p_issued_by => :issued_by
         );
       END;`,
      {
        soldier_id,
        weapon_id,
        weapon_type,
        serial_number,
        issued_by: issued_by || 'ADMIN'
      },
      { autoCommit: true }
    );
    
    res.json({ success: true, message: 'Weapon issued successfully', weapon_id, soldier_id });
    
  } catch (err) {
    console.error('Issue weapon error:', err);
    res.status(500).json({ success: false, message: 'Error issuing weapon: ' + err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
});

// Return weapon
app.post('/api/return-weapon', async (req, res) => {
  let connection;
  try {
    const { weapon_id, returned_by, condition, remarks } = req.body;
    
    if (!weapon_id) {
      return res.status(400).json({ success: false, message: 'Weapon ID is required' });
    }
    
    connection = await pool.getConnection();
    
    // Check if weapon is issued
    const weaponCheck = await connection.execute(
      `SELECT issue_id FROM weapon_issue WHERE weapon_id = :weapon_id AND return_date IS NULL`,
      [weapon_id]
    );
    
    if (weaponCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No active issue found for this weapon' });
    }
    
    // Call PL/SQL procedure to return weapon
    await connection.execute(
      `BEGIN
         weapon_management_pkg.return_weapon(
           p_weapon_id => :weapon_id,
           p_returned_by => :returned_by,
           p_condition => :condition,
           p_remarks => :remarks
         );
       END;`,
      {
        weapon_id,
        returned_by: returned_by || 'ADMIN',
        condition: condition || 'GOOD',
        remarks: remarks || NULL
      },
      { autoCommit: true }
    );
    
    res.json({ success: true, message: 'Weapon returned successfully', weapon_id });
    
  } catch (err) {
    console.error('Return weapon error:', err);
    res.status(500).json({ success: false, message: 'Error returning weapon: ' + err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
});

// Get total issued weapons
app.get('/api/total-issued', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    
    const result = await connection.execute(
      `SELECT COUNT(*) as total FROM weapon_issue WHERE return_date IS NULL`
    );
    
    const total = result.rows[0][0];
    
    res.json({ success: true, total });
    
  } catch (err) {
    console.error('Get total issued error:', err);
    res.status(500).json({ success: false, message: 'Error fetching total issued weapons' });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
});

// Search soldier
app.get('/api/search-soldier/:soldier_id', async (req, res) => {
  let connection;
  try {
    const { soldier_id } = req.params;
    
    connection = await pool.getConnection();
    
    // Get soldier details
    const soldierResult = await connection.execute(
      `SELECT soldier_id, name, rank, unit, phone, email, 
              TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
              TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at
       FROM soldiers 
       WHERE soldier_id = :soldier_id`,
      [soldier_id]
    );
    
    if (soldierResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Soldier not found' });
    }
    
    const soldier = {
      soldier_id: soldierResult.rows[0][0],
      name: soldierResult.rows[0][1],
      rank: soldierResult.rows[0][2],
      unit: soldierResult.rows[0][3],
      phone: soldierResult.rows[0][4],
      email: soldierResult.rows[0][5],
      created_at: soldierResult.rows[0][6],
      updated_at: soldierResult.rows[0][7]
    };
    
    // Get issued weapons
    const weaponsResult = await connection.execute(
      `SELECT w.weapon_id, w.weapon_type, w.serial_number,
              TO_CHAR(wi.issue_date, 'YYYY-MM-DD HH24:MI:SS') as issue_date,
              wi.issued_by,
              TO_CHAR(wi.return_date, 'YYYY-MM-DD HH24:MI:SS') as return_date,
              wi.condition, wi.remarks
       FROM weapon_issue wi
       JOIN weapons w ON wi.weapon_id = w.weapon_id
       WHERE wi.soldier_id = :soldier_id
       ORDER BY wi.issue_date DESC`,
      [soldier_id]
    );
    
    const weapons = weaponsResult.rows.map(row => ({
      weapon_id: row[0],
      weapon_type: row[1],
      serial_number: row[2],
      issue_date: row[3],
      issued_by: row[4],
      return_date: row[5],
      condition: row[6],
      remarks: row[7]
    }));
    
    res.json({ success: true, soldier, weapons });
    
  } catch (err) {
    console.error('Search soldier error:', err);
    res.status(500).json({ success: false, message: 'Error searching soldier' });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
});

// Fetch and issue (combined operation)
app.post('/api/fetch-and-issue', async (req, res) => {
  let connection;
  try {
    const { soldier_id, weapon_id, weapon_type, serial_number, issued_by } = req.body;
    
    if (!soldier_id || !weapon_id || !weapon_type || !serial_number) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    
    connection = await pool.getConnection();
    
    // Check if soldier exists
    const soldierCheck = await connection.execute(
      `SELECT soldier_id, name FROM soldiers WHERE soldier_id = :soldier_id`,
      [soldier_id]
    );
    
    if (soldierCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Soldier not found. Please register the soldier first.' });
    }
    
    const soldierName = soldierCheck.rows[0][1];
    
    // Check if weapon is already issued
    const weaponCheck = await connection.execute(
      `SELECT issue_id FROM weapon_issue WHERE weapon_id = :weapon_id AND return_date IS NULL`,
      [weapon_id]
    );
    
    if (weaponCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Weapon is already issued' });
    }
    
    // Issue weapon using PL/SQL
    await connection.execute(
      `BEGIN
         weapon_management_pkg.issue_weapon(
           p_soldier_id => :soldier_id,
           p_weapon_id => :weapon_id,
           p_weapon_type => :weapon_type,
           p_serial_number => :serial_number,
           p_issued_by => :issued_by
         );
       END;`,
      {
        soldier_id,
        weapon_id,
        weapon_type,
        serial_number,
        issued_by: issued_by || 'ADMIN'
      },
      { autoCommit: true }
    );
    
    res.json({ 
      success: true, 
      message: `Weapon issued to ${soldierName} successfully`,
      soldier_id,
      weapon_id
    });
    
  } catch (err) {
    console.error('Fetch and issue error:', err);
    res.status(500).json({ success: false, message: 'Error: ' + err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`\n🚀 Armory Management System Server`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔗 API endpoint: http://localhost:${PORT}/api`);
  
  try {
    await initializeDatabase();
    console.log('\n✅ Server is ready to accept requests\n');
  } catch (err) {
    console.error('\n❌ Failed to initialize database. Please check Oracle connection.');
    console.error('Error:', err.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\nSIGTERM received. Closing database pool...');
  if (pool) {
    await pool.close();
  }
  process.exit(0);
});
