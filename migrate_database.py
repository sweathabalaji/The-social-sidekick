#!/usr/bin/env python3
"""
Database migration script to add missing columns to scheduled_posts table
"""

import sqlite3
import logging
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_database():
    """Migrate the existing database to add missing columns"""
    db_path = "instagram_automation.db"
    
    if not Path(db_path).exists():
        logger.info("Database doesn't exist yet, no migration needed")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if columns exist
        cursor.execute("PRAGMA table_info(scheduled_posts)")
        columns = [column[1] for column in cursor.fetchall()]
        
        logger.info(f"Existing columns: {columns}")
        
        # Add missing columns
        if 'is_facebook' not in columns:
            logger.info("Adding is_facebook column...")
            cursor.execute("ALTER TABLE scheduled_posts ADD COLUMN is_facebook BOOLEAN DEFAULT 0")
            
        if 'platforms' not in columns:
            logger.info("Adding platforms column...")
            cursor.execute("ALTER TABLE scheduled_posts ADD COLUMN platforms VARCHAR DEFAULT 'Instagram'")
        
        # Update existing records to have proper platform values
        logger.info("Updating existing records...")
        cursor.execute("""
            UPDATE scheduled_posts 
            SET platforms = CASE 
                WHEN is_facebook = 1 THEN 'Facebook' 
                ELSE 'Instagram' 
            END 
            WHERE platforms IS NULL OR platforms = ''
        """)
        
        conn.commit()
        logger.info("Database migration completed successfully!")
        
        # Verify the migration
        cursor.execute("PRAGMA table_info(scheduled_posts)")
        new_columns = [column[1] for column in cursor.fetchall()]
        logger.info(f"New columns: {new_columns}")
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database() 