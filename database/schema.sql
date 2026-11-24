-- ===========================================
-- ARMORY MANAGEMENT SYSTEM - ORACLE DATABASE SCHEMA
-- ===========================================
-- Database: Oracle Database XE
-- Purpose: Manage soldiers, weapons, and weapon issuance
-- Author: Armory Management System
-- Date: 2026
-- ===========================================

-- ===== CLEANUP (Optional - Uncomment to drop existing objects) =====
/*
DROP TABLE weapon_issue CASCADE CONSTRAINTS;
DROP TABLE weapons CASCADE CONSTRAINTS;
DROP TABLE soldiers CASCADE CONSTRAINTS;
DROP TABLE users CASCADE CONSTRAINTS;
DROP PACKAGE weapon_management_pkg;
DROP SEQUENCE weapon_issue_seq;
*/

-- ===== CREATE TABLES =====
BEGIN 
    EXECUTE IMMEDIATE 'DROP TABLE weapon_issue CASCADE CONSTRAINTS';
    EXECUTE IMMEDIATE 'DROP TABLE weapons CASCADE CONSTRAINTS';
    EXECUTE IMMEDIATE 'DROP TABLE soldiers CASCADE CONSTRAINTS';
    EXECUTE IMMEDIATE 'DROP TABLE users CASCADE CONSTRAINTS';
    EXECUTE IMMEDIATE 'DROP PACKAGE weapon_management_pkg';
    EXECUTE IMMEDIATE 'DROP SEQUENCE weapon_issue_seq';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE !=-942 THEN
        RAISE;
    END IF;
END;

-- Users Table (for authentication)
CREATE TABLE users (
    user_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR2(50) UNIQUE NOT NULL,
    password VARCHAR2(255) NOT NULL,
    role VARCHAR2(20) DEFAULT 'ADMIN' NOT NULL,
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
    updated_at TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT chk_role CHECK (role IN ('ADMIN', 'OFFICER', 'USER'))
);

-- Soldiers Table
CREATE TABLE soldiers (
    soldier_id VARCHAR2(20) PRIMARY KEY,
    name VARCHAR2(100) NOT NULL,
    rank VARCHAR2(50) NOT NULL,
    unit VARCHAR2(100) NOT NULL,
    phone VARCHAR2(20),
    email VARCHAR2(100),
    status VARCHAR2(20) DEFAULT 'ACTIVE' NOT NULL,
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
    updated_at TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT chk_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'TRANSFERRED'))
);

-- Weapons Table
CREATE TABLE weapons (
    weapon_id VARCHAR2(20) PRIMARY KEY,
    weapon_type VARCHAR2(50) NOT NULL,
    serial_number VARCHAR2(50) UNIQUE NOT NULL,
    status VARCHAR2(20) DEFAULT 'AVAILABLE' NOT NULL,
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
    updated_at TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT chk_weapon_status CHECK (status IN ('AVAILABLE', 'ISSUED', 'MAINTENANCE', 'RETIRED'))
);

-- Weapon Issue/Return Table
CREATE TABLE weapon_issue (
    issue_id NUMBER PRIMARY KEY,
    soldier_id VARCHAR2(20) NOT NULL,
    weapon_id VARCHAR2(20) NOT NULL,
    issue_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    issued_by VARCHAR2(50) NOT NULL,
    return_date TIMESTAMP,
    returned_by VARCHAR2(50),
    condition VARCHAR2(20),
    remarks VARCHAR2(500),
    CONSTRAINT fk_soldier FOREIGN KEY (soldier_id) REFERENCES soldiers(soldier_id),
    CONSTRAINT fk_weapon FOREIGN KEY (weapon_id) REFERENCES weapons(weapon_id),
    CONSTRAINT chk_condition CHECK (condition IN ('GOOD', 'FAIR', 'DAMAGED', 'NEEDS_REPAIR'))
);

-- Create Sequence for weapon_issue table
CREATE SEQUENCE weapon_issue_seq
    START WITH 1
    INCREMENT BY 1
    NOCACHE
    NOCYCLE;

-- ===== CREATE INDEXES =====
CREATE INDEX idx_soldier_name ON soldiers(name);
CREATE INDEX idx_weapon_serial ON weapons(serial_number);
CREATE INDEX idx_issue_soldier ON weapon_issue(soldier_id);
CREATE INDEX idx_issue_weapon ON weapon_issue(weapon_id);
CREATE INDEX idx_issue_date ON weapon_issue(issue_date);

-- ===== CREATE TRIGGERS =====

-- Trigger to update soldiers.updated_at
CREATE OR REPLACE TRIGGER trg_soldiers_update
BEFORE UPDATE ON soldiers
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

-- Trigger to update weapons.updated_at
CREATE OR REPLACE TRIGGER trg_weapons_update
BEFORE UPDATE ON weapons
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

-- Trigger to update users.updated_at
CREATE OR REPLACE TRIGGER trg_users_update
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

-- ===== CREATE PL/SQL PACKAGE =====

-- Package Specification
CREATE OR REPLACE PACKAGE weapon_management_pkg AS
    -- Issue weapon to soldier
    PROCEDURE issue_weapon(
        p_soldier_id IN VARCHAR2,
        p_weapon_id IN VARCHAR2,
        p_weapon_type IN VARCHAR2,
        p_serial_number IN VARCHAR2,
        p_issued_by IN VARCHAR2
    );
    
    -- Return weapon from soldier
    PROCEDURE return_weapon(
        p_weapon_id IN VARCHAR2,
        p_returned_by IN VARCHAR2,
        p_condition IN VARCHAR2,
        p_remarks IN VARCHAR2
    );
END weapon_management_pkg;
/

-- Package Body
CREATE OR REPLACE PACKAGE BODY weapon_management_pkg AS

    -- Issue Weapon Procedure
    PROCEDURE issue_weapon(
        p_soldier_id IN VARCHAR2,
        p_weapon_id IN VARCHAR2,
        p_weapon_type IN VARCHAR2,
        p_serial_number IN VARCHAR2,
        p_issued_by IN VARCHAR2
    ) IS
        v_weapon_exists NUMBER;
        v_weapon_issued NUMBER;
    BEGIN
        -- Check if weapon exists in weapons table
        SELECT COUNT(*) INTO v_weapon_exists
        FROM weapons
        WHERE weapon_id = p_weapon_id;
        
        -- If weapon doesn't exist, insert it
        IF v_weapon_exists = 0 THEN
            INSERT INTO weapons (weapon_id, weapon_type, serial_number, status)
            VALUES (p_weapon_id, p_weapon_type, p_serial_number, 'ISSUED');
        ELSE
            -- Update weapon status to ISSUED
            UPDATE weapons
            SET status = 'ISSUED',
                updated_at = SYSTIMESTAMP
            WHERE weapon_id = p_weapon_id;
        END IF;
        
        -- Create issue record
        INSERT INTO weapon_issue (
            issue_id, 
            soldier_id, 
            weapon_id, 
            issue_date, 
            issued_by
        ) VALUES (
            weapon_issue_seq.NEXTVAL,
            p_soldier_id,
            p_weapon_id,
            SYSTIMESTAMP,
            p_issued_by
        );
        
        COMMIT;
        
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            RAISE;
    END issue_weapon;
    
    -- Return Weapon Procedure
    PROCEDURE return_weapon(
        p_weapon_id IN VARCHAR2,
        p_returned_by IN VARCHAR2,
        p_condition IN VARCHAR2,
        p_remarks IN VARCHAR2
    ) IS
        v_issue_id NUMBER;
    BEGIN
        -- Find the active issue record
        SELECT issue_id INTO v_issue_id
        FROM weapon_issue
        WHERE weapon_id = p_weapon_id
        AND return_date IS NULL
        AND ROWNUM = 1;
        
        -- Update issue record with return information
        UPDATE weapon_issue
        SET return_date = SYSTIMESTAMP,
            returned_by = p_returned_by,
            condition = p_condition,
            remarks = p_remarks
        WHERE issue_id = v_issue_id;
        
        -- Update weapon status based on condition
        IF p_condition = 'GOOD' OR p_condition = 'FAIR' THEN
            UPDATE weapons
            SET status = 'AVAILABLE',
                updated_at = SYSTIMESTAMP
            WHERE weapon_id = p_weapon_id;
        ELSIF p_condition = 'DAMAGED' OR p_condition = 'NEEDS_REPAIR' THEN
            UPDATE weapons
            SET status = 'MAINTENANCE',
                updated_at = SYSTIMESTAMP
            WHERE weapon_id = p_weapon_id;
        END IF;
        
        COMMIT;
        
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20001, 'No active issue found for weapon: ' || p_weapon_id);
        WHEN OTHERS THEN
            ROLLBACK;
            RAISE;
    END return_weapon;

END weapon_management_pkg;
/

-- ===== INSERT SAMPLE DATA (Optional) =====

-- Insert sample soldiers
INSERT INTO soldiers (soldier_id, name, rank, unit, phone, email)
VALUES ('SOL001', 'John Smith', 'Captain', 'Alpha Company', '+1234567890', 'john.smith@army.mil');

INSERT INTO soldiers (soldier_id, name, rank, unit, phone, email)
VALUES ('SOL002', 'Jane Doe', 'Lieutenant', 'Bravo Company', '+0987654321', 'jane.doe@army.mil');

INSERT INTO soldiers (soldier_id, name, rank, unit, phone, email)
VALUES ('SOL003', 'Mike Johnson', 'Sergeant', 'Charlie Company', '+1122334455', 'mike.johnson@army.mil');


SELECT * FROM soldiers;

-- Commit sample data
COMMIT;

-- ===== GRANT PERMISSIONS (if needed for other users) =====
-- GRANT SELECT, INSERT, UPDATE, DELETE ON users TO armory_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON soldiers TO armory_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON weapons TO armory_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON weapon_issue TO armory_user;
-- GRANT EXECUTE ON weapon_management_pkg TO armory_user;

-- ===== VERIFICATION QUERIES =====

-- View all tables
SELECT table_name FROM user_tables WHERE table_name IN ('USERS', 'SOLDIERS', 'WEAPONS', 'WEAPON_ISSUE');

-- View package status
SELECT object_name, object_type, status FROM user_objects WHERE object_name = 'WEAPON_MANAGEMENT_PKG';

-- View sample soldiers
SELECT * FROM soldiers;

-- Display completion message
BEGIN
    DBMS_OUTPUT.PUT_LINE('============================================');
    DBMS_OUTPUT.PUT_LINE('Armory Management System Schema Created!');
    DBMS_OUTPUT.PUT_LINE('============================================');
    DBMS_OUTPUT.PUT_LINE('Tables Created:');
    DBMS_OUTPUT.PUT_LINE('  - USERS');
    DBMS_OUTPUT.PUT_LINE('  - SOLDIERS');
    DBMS_OUTPUT.PUT_LINE('  - WEAPONS');
    DBMS_OUTPUT.PUT_LINE('  - WEAPON_ISSUE');
    DBMS_OUTPUT.PUT_LINE('');
    DBMS_OUTPUT.PUT_LINE('Procedures Created:');
    DBMS_OUTPUT.PUT_LINE('  - weapon_management_pkg.issue_weapon');
    DBMS_OUTPUT.PUT_LINE('  - weapon_management_pkg.return_weapon');
    DBMS_OUTPUT.PUT_LINE('============================================');
END;
/