from mongodb_config import mongodb
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_mongodb_connection():
    """Test MongoDB Atlas connection and basic operations"""
    try:
        # Test connection
        if not mongodb.connect():
            logger.error("Failed to connect to MongoDB")
            return False
        
        logger.info("✅ MongoDB Atlas connected successfully!")
        
        # Test database access
        db_name = mongodb.db.name
        logger.info(f"📁 Database: {db_name}")
        
        # List collections
        collections = mongodb.db.list_collection_names()
        logger.info(f"📋 Collections: {collections}")
        
        # Test creating a test user (will be cleaned up)
        test_email = "test@example.com"
        test_password = "hashed_test_password"
        
        # Clean up any existing test user
        mongodb.users_collection.delete_one({"email": test_email})
        
        # Create test user
        user = mongodb.create_user(test_email, test_password)
        if user:
            logger.info(f"✅ Test user created: {user['email']}")
            
            # Test session creation
            session_id = mongodb.create_session(str(user["_id"]))
            if session_id:
                logger.info(f"✅ Session created: {session_id}")
                
                # Test session retrieval
                retrieved_user = mongodb.get_user_by_session(session_id)
                if retrieved_user:
                    logger.info(f"✅ User retrieved by session: {retrieved_user['email']}")
                else:
                    logger.error("❌ Failed to retrieve user by session")
                
                # Test session deletion
                if mongodb.delete_session(session_id):
                    logger.info("✅ Session deleted successfully")
                else:
                    logger.error("❌ Failed to delete session")
            else:
                logger.error("❌ Failed to create session")
            
            # Clean up test user
            mongodb.users_collection.delete_one({"_id": user["_id"]})
            logger.info("🧹 Test user cleaned up")
        else:
            logger.error("❌ Failed to create test user")
        
        # Test cleanup of expired sessions
        cleaned = mongodb.cleanup_expired_sessions()
        logger.info(f"🧹 Cleaned up {cleaned} expired sessions")
        
        logger.info("🎉 All MongoDB tests passed!")
        return True
        
    except Exception as e:
        logger.error(f"❌ MongoDB test failed: {e}")
        return False

if __name__ == "__main__":
    test_mongodb_connection() 