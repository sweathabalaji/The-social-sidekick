import os
from pymongo import MongoClient
from datetime import datetime, timedelta
import uuid
import logging
import ssl

logger = logging.getLogger(__name__)

class MongoDBConfig:
    # MongoDB Atlas connection
    MONGODB_URL = 'mongodb+srv://sweathabalaji03:qrLehjhWc4MP36Ma@socialsidekick.pcltfx0.mongodb.net/'
    DATABASE_NAME = 'social_media_assistant'
    
    def __init__(self):
        self.client = None
        self.db = None
        self.users_collection = None
        self.sessions_collection = None
        self.notifications_collection = None
        self.connect()
    
    def connect(self):
        """Connect to MongoDB Atlas with proper configuration"""
        try:
            # Configure for MongoDB Atlas with TLS settings for macOS
            self.client = MongoClient(
                self.MONGODB_URL,
                serverSelectionTimeoutMS=30000,
                connectTimeoutMS=20000,
                socketTimeoutMS=20000,
                retryWrites=True,
                w='majority',
                tlsAllowInvalidCertificates=True  # Allow invalid certificates for development
            )
            
            self.db = self.client[self.DATABASE_NAME]
            self.users_collection = self.db.users
            self.sessions_collection = self.db.sessions
            self.notifications_collection = self.db.notifications
            
            # Test connection
            self.client.admin.command('ping')
            logger.info("✅ MongoDB Atlas connected successfully")
            return True
        except Exception as e:
            logger.error(f"❌ MongoDB connection failed: {e}")
            return False
    
    def get_user_by_email(self, email: str):
        """Get user from MongoDB by email"""
        try:
            return self.users_collection.find_one({"email": email})
        except Exception as e:
            logger.error(f"Error getting user: {e}")
            return None
    
    def create_user(self, email: str, hashed_password: str):
        """Create a new user in MongoDB - only email and password"""
        try:
            user_doc = {
                "email": email,
                "password": hashed_password,
                "created_at": datetime.utcnow()
            }
            
            result = self.users_collection.insert_one(user_doc)
            user_doc["_id"] = result.inserted_id
            return user_doc
        except Exception as e:
            logger.error(f"Error creating user: {e}")
            return None
    
    def create_session(self, user_id: str):
        """Create a session for the user"""
        try:
            session_id = str(uuid.uuid4())
            session_doc = {
                "session_id": session_id,
                "user_id": user_id,
                "created_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(hours=24)
            }
            
            self.sessions_collection.insert_one(session_doc)
            return session_id
        except Exception as e:
            logger.error(f"Error creating session: {e}")
            return None
    
    def get_user_by_session(self, session_id: str):
        """Get user by session ID"""
        try:
            session = self.sessions_collection.find_one({
                "session_id": session_id,
                "expires_at": {"$gt": datetime.utcnow()}
            })
            
            if not session:
                return None
            
            from bson import ObjectId
            user = self.users_collection.find_one({"_id": ObjectId(session["user_id"])})
            return user
        except Exception as e:
            logger.error(f"Error getting user by session: {e}")
            return None
    
    def delete_session(self, session_id: str):
        """Delete a session (logout)"""
        try:
            self.sessions_collection.delete_one({"session_id": session_id})
            return True
        except Exception as e:
            logger.error(f"Error deleting session: {e}")
            return False
    
    def cleanup_expired_sessions(self):
        """Clean up expired sessions"""
        try:
            result = self.sessions_collection.delete_many({
                "expires_at": {"$lt": datetime.utcnow()}
            })
            logger.info(f"Cleaned up {result.deleted_count} expired sessions")
            return result.deleted_count
        except Exception as e:
            logger.error(f"Error cleaning up sessions: {e}")
            return 0

    # Notification methods
    def create_notification(self, user_id: str, type: str, message: str):
        """Create a new notification for a user"""
        try:
            notification_doc = {
                "user_id": user_id,
                "type": type,
                "message": message,
                "read": False,
                "created_at": datetime.utcnow(),
                "timestamp": datetime.utcnow()
            }
            
            result = self.notifications_collection.insert_one(notification_doc)
            return str(result.inserted_id)
        except Exception as e:
            logger.error(f"Error creating notification: {e}")
            return None

    def get_user_notifications(self, user_id: str, limit: int = 50):
        """Get notifications for a user, sorted by newest first"""
        try:
            notifications = list(self.notifications_collection.find(
                {"user_id": user_id}
            ).sort("created_at", -1).limit(limit))
            
            # Convert ObjectId to string and format response
            for notif in notifications:
                notif["id"] = str(notif["_id"])
                del notif["_id"]
                # Format timestamp for frontend
                if "created_at" in notif:
                    notif["timestamp"] = notif["created_at"]
            
            return notifications
        except Exception as e:
            logger.error(f"Error getting notifications: {e}")
            return []

    def mark_notification_read(self, notification_id: str):
        """Mark a notification as read"""
        try:
            from bson import ObjectId
            result = self.notifications_collection.update_one(
                {"_id": ObjectId(notification_id)},
                {"$set": {"read": True}}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error marking notification as read: {e}")
            return False

    def mark_all_notifications_read(self, user_id: str):
        """Mark all notifications as read for a user"""
        try:
            result = self.notifications_collection.update_many(
                {"user_id": user_id, "read": False},
                {"$set": {"read": True}}
            )
            return result.modified_count
        except Exception as e:
            logger.error(f"Error marking all notifications as read: {e}")
            return 0

    def get_session(self, session_id: str):
        """Get session details"""
        try:
            return self.sessions_collection.find_one({
                "session_id": session_id,
                "expires_at": {"$gt": datetime.utcnow()}
            })
        except Exception as e:
            logger.error(f"Error getting session: {e}")
            return None

    def verify_session(self, session_id: str):
        """Verify if session is valid"""
        try:
            session = self.get_session(session_id)
            return session is not None
        except Exception as e:
            logger.error(f"Error verifying session: {e}")
            return False

# Global MongoDB instance
mongodb = MongoDBConfig() 