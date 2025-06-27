from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, File, UploadFile, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import json
import logging
import uuid
import os
import tempfile
import cloudinary
import cloudinary.uploader
import pytz
import asyncio
import time
from functools import lru_cache
from passlib.context import CryptContext
from pymongo import MongoClient
from bson import ObjectId
import hashlib
from sqlalchemy.orm import Session

# Import your existing modules
from config import Config
from tasks import (
    get_db, ScheduledPost, generate_captions, schedule_instagram_post,
    load_scheduled_posts, PostStatusHistory
)
from instagram_analytics import InstagramAnalytics
from facebook_analytics import FacebookAnalytics

# Import MongoDB configuration
from mongodb_config import mongodb

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Social Media Assistant API",
    description="API for social media automation and analytics",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://www.hogist.in"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Cloudinary
try:
    cloudinary.config(
        cloud_name=Config.CLOUDINARY_CLOUD_NAME,
        api_key=Config.CLOUDINARY_API_KEY,
        api_secret=Config.CLOUDINARY_API_SECRET
    )
except Exception as e:
    logger.error(f"Cloudinary configuration error: {e}")

# MongoDB is configured in mongodb_config.py

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Authentication Pydantic models
class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class AuthResponse(BaseModel):
    message: str
    session_id: str
    user: Dict[str, Any]

# Helper functions
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# All MongoDB operations are now handled by mongodb_config.py

# Authentication endpoints
@app.post("/auth/register")
async def register(user_data: UserCreate):
    try:
        # Check if user already exists
        existing_user = mongodb.get_user_by_email(user_data.email)
        if existing_user:
            raise HTTPException(
                status_code=400, 
                detail="An account with this email already exists. Please try logging in instead."
            )
        
        # Validate email format (basic validation)
        if not user_data.email or "@" not in user_data.email:
            raise HTTPException(
                status_code=400,
                detail="Please enter a valid email address."
            )
        
        # Validate password strength
        if len(user_data.password) < 6:
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 6 characters long."
            )
        
        # Hash password and create user
        hashed_password = hash_password(user_data.password)
        user = mongodb.create_user(user_data.email, hashed_password)
        
        if not user:
            raise HTTPException(
                status_code=500, 
                detail="Failed to create account. Please try again."
            )
        
        # Create session
        session_id = mongodb.create_session(str(user["_id"]))
        if not session_id:
            raise HTTPException(
                status_code=500, 
                detail="Account created but login failed. Please try logging in manually."
            )
        
        # Return user data without password
        user_response = {
            "id": str(user["_id"]),
            "email": user["email"]
        }
        
        return {
            "message": "Account created successfully! Welcome to The Social Sidekick!",
            "session_id": session_id,
            "user": user_response
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(
            status_code=500, 
            detail="An unexpected error occurred. Please try again later."
        )

@app.post("/auth/login")
async def login(user_data: UserLogin):
    try:
        # Validate input
        if not user_data.email or not user_data.password:
            raise HTTPException(
                status_code=400,
                detail="Please enter both email and password."
            )
        
        # Get user by email
        user = mongodb.get_user_by_email(user_data.email)
        if not user:
            raise HTTPException(
                status_code=401, 
                detail="No account found with this email address. Please check your email or sign up for a new account."
            )
        
        # Verify password
        if not verify_password(user_data.password, user["password"]):
            raise HTTPException(
                status_code=401, 
                detail="Incorrect password. Please check your password and try again."
            )
        
        # Create session
        session_id = mongodb.create_session(str(user["_id"]))
        if not session_id:
            raise HTTPException(
                status_code=500, 
                detail="Login failed due to a server error. Please try again."
            )
        
        # Return user data without password
        user_response = {
            "id": str(user["_id"]),
            "email": user["email"]
        }
        
        return {
            "message": "Welcome back! Login successful.",
            "session_id": session_id,
            "user": user_response
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(
            status_code=500, 
            detail="An unexpected error occurred during login. Please try again later."
        )

@app.get("/auth/verify")
async def verify_session(session_id: str = Query(...)):
    try:
        if not session_id:
            raise HTTPException(
                status_code=401, 
                detail="No session provided. Please log in again."
            )
        
        user = mongodb.get_user_by_session(session_id)
        if not user:
            raise HTTPException(
                status_code=401, 
                detail="Your session has expired or is invalid. Please log in again."
            )
        
        # Return user data without password
        user_response = {
            "id": str(user["_id"]),
            "email": user["email"]
        }
        
        return {
            "message": "Session verified successfully",
            "user": user_response
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Session verification error: {e}")
        raise HTTPException(
            status_code=500, 
            detail="Failed to verify session. Please try logging in again."
        )

@app.post("/auth/logout")
async def logout(session_id: str = Query(...)):
    try:
        if not session_id:
            return {"message": "Already logged out"}
        
        success = mongodb.delete_session(session_id)
        if success:
            return {"message": "Logged out successfully"}
        else:
            return {"message": "Logout completed"}  # Still return success even if session wasn't found
    
    except Exception as e:
        logger.error(f"Logout error: {e}")
        # Even if logout fails, we should return success to the client
        return {"message": "Logout completed"}

# Notification endpoints
@app.post("/api/notifications")
async def create_notification(
    type: str,
    message: str,
    session_id: str = Query(...)
):
    """Create a new notification for the current user"""
    try:
        # Verify session and get user
        if not mongodb.verify_session(session_id):
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        
        session = mongodb.get_session(session_id)
        user_id = session["user_id"]
        
        # Create notification in MongoDB
        notification_id = mongodb.create_notification(user_id, type, message)
        
        if notification_id:
            return {"message": "Notification created", "id": notification_id}
        else:
            raise HTTPException(status_code=500, detail="Failed to create notification")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create notification error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create notification")

@app.get("/api/notifications")
async def get_user_notifications(session_id: str = Query(...)):
    """Get all notifications for the current user"""
    try:
        # Verify session and get user
        if not mongodb.verify_session(session_id):
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        
        session = mongodb.get_session(session_id)
        user_id = session["user_id"]
        
        # Get notifications from MongoDB
        notifications = mongodb.get_user_notifications(user_id)
        
        return {"notifications": notifications}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get notifications error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch notifications")

@app.put("/api/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    session_id: str = Query(...)
):
    """Mark a notification as read"""
    try:
        # Verify session
        if not mongodb.verify_session(session_id):
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        
        # Mark notification as read
        success = mongodb.mark_notification_read(notification_id)
        
        if success:
            return {"message": "Notification marked as read"}
        else:
            raise HTTPException(status_code=404, detail="Notification not found")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Mark notification read error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update notification")

@app.put("/api/notifications/mark-all-read")
async def mark_all_notifications_read(session_id: str = Query(...)):
    """Mark all notifications as read for the current user"""
    try:
        # Verify session and get user
        if not mongodb.verify_session(session_id):
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        
        session = mongodb.get_session(session_id)
        user_id = session["user_id"]
        
        # Mark all notifications as read
        count = mongodb.mark_all_notifications_read(user_id)
        
        return {"message": f"Marked {count} notifications as read", "count": count}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Mark all notifications read error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update notifications")

# Helper function to create notifications from other endpoints
def create_user_notification(user_id: str, type: str, message: str):
    """Helper function to create notifications from other parts of the app"""
    try:
        return mongodb.create_notification(user_id, type, message)
    except Exception as e:
        logger.error(f"Failed to create notification: {e}")
        return None

# Social media API endpoints (with session verification)
@app.get("/api/dashboard")
async def get_dashboard_data(session_id: str = Query(...)):
    # Verify session
    user = mongodb.get_user_by_session(session_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    return {
        "analytics": {
            "instagram": {
                "followers": 874,
                "following": 523,
                "posts": 142,
                "engagement_rate": 3.2
            },
            "facebook": {
                "followers": 1200,
                "likes": 856,
                "posts": 89,
                "reach": 15420
            }
        },
        "recent_posts": [
            {
                "id": 1,
                "platform": "Instagram",
                "content": "Check out our latest product launch! 🚀",
                "status": "Posted",
                "timestamp": "2024-01-15T10:30:00Z",
                "engagement": {"likes": 45, "comments": 12, "shares": 3}
            },
            {
                "id": 2,
                "platform": "Facebook",
                "content": "Behind the scenes of our photo shoot 📸",
                "status": "Posted",
                "timestamp": "2024-01-15T08:15:00Z",
                "engagement": {"likes": 78, "comments": 23, "shares": 15}
            }
        ]
    }

@app.get("/api/scheduled-posts")
async def get_scheduled_posts(session_id: str = Query(...)):
    # Verify session
    user = mongodb.get_user_by_session(session_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    return {
        "posts": [
            {
                "id": 1,
                "content": "Exciting announcement coming soon! Stay tuned 🎉",
                "platforms": ["Instagram", "Facebook"],
                "scheduled_time": "2024-01-16T14:00:00Z",
                "status": "Scheduled"
            },
            {
                "id": 2,
                "content": "Team meeting highlights and key takeaways",
                "platforms": ["Facebook"],
                "scheduled_time": "2024-01-16T16:30:00Z",
                "status": "Scheduled"
            }
        ]
    }

@app.get("/api/ai-content")
async def get_ai_content(session_id: str = Query(...)):
    # Verify session
    user = mongodb.get_user_by_session(session_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    return {
        "suggestions": [
            {
                "id": 1,
                "title": "Product Showcase",
                "content": "Show off your latest products with high-quality images and engaging captions",
                "category": "Marketing",
                "platforms": ["Instagram", "Facebook"]
            },
            {
                "id": 2,
                "title": "Behind the Scenes",
                "content": "Give your audience a peek behind the curtain of your daily operations",
                "category": "Engagement",
                "platforms": ["Instagram", "TikTok"]
            }
        ]
    }

# Pydantic models for request/response
class PostCreate(BaseModel):
    media_urls: List[str]
    media_type: str
    caption: str
    scheduled_time: str
    username: str
    platform: str = "Instagram"
    cloudinary_public_ids: Optional[List[str]] = None
    immediate: Optional[bool] = False  # Flag for immediate posting

class PostUpdate(BaseModel):
    caption: Optional[str] = None
    scheduled_time: Optional[str] = None
    status: Optional[str] = None

class CaptionGenerateRequest(BaseModel):
    media_path: List[str]  # Changed from str to List[str] to match streamlit_app
    media_type: str
    style: str = "high_engagement"
    custom_prompt: Optional[str] = None
    target_audience: Optional[str] = None
    business_goals: Optional[str] = None
    num_variants: int = 3
    # Enhanced caption generation options
    content_tone: Optional[str] = "Friendly & Casual"
    hashtag_preference: Optional[str] = "Medium (10-15 hashtags)"
    include_cta: Optional[bool] = True
    cta_type: Optional[str] = "Like & Share"
    custom_cta: Optional[str] = None
    include_questions: Optional[bool] = True
    post_timing: Optional[str] = "Regular Day"
    location_context: Optional[str] = None
    seasonal_context: Optional[str] = "Current Season"
    brand_voice: Optional[str] = None

class AnalyticsResponse(BaseModel):
    platform: str
    period: str
    data: Dict[str, Any]

# Global cache for analytics data to reduce API calls
analytics_cache = {}
cache_timeout = 300  # 5 minutes

def get_cached_analytics(cache_key: str):
    """Get analytics data from cache if not expired"""
    if cache_key in analytics_cache:
        timestamp, data = analytics_cache[cache_key]
        if time.time() - timestamp < cache_timeout:
            return data
    return None

def set_cached_analytics(cache_key: str, data):
    """Set analytics data in cache"""
    analytics_cache[cache_key] = (time.time(), data)

@lru_cache(maxsize=32)
def get_instagram_analytics():
    return InstagramAnalytics(Config.INSTAGRAM_ACCESS_TOKEN)

@lru_cache(maxsize=32) 
def get_facebook_analytics():
    return FacebookAnalytics(Config.get_effective_facebook_token())

# Global rate limiting for Facebook API
facebook_api_calls = {"count": 0, "reset_time": time.time() + 3600}  # Reset every hour
max_facebook_calls_per_hour = 100  # Conservative limit

def can_make_facebook_call():
    """Check if we can make a Facebook API call without hitting rate limits"""
    current_time = time.time()
    
    # Reset counter if hour has passed
    if current_time > facebook_api_calls["reset_time"]:
        facebook_api_calls["count"] = 0
        facebook_api_calls["reset_time"] = current_time + 3600
    
    # Check if we're under the limit
    if facebook_api_calls["count"] >= max_facebook_calls_per_hour:
        logger.warning("Facebook API call limit reached for this hour")
        return False
    
    facebook_api_calls["count"] += 1
    return True

def log_facebook_api_call(endpoint: str):
    """Log Facebook API call for monitoring"""
    logger.info(f"Facebook API call to {endpoint} (calls this hour: {facebook_api_calls['count']}/{max_facebook_calls_per_hour})")

# Health check endpoint
@app.get("/")
async def root():
    return {"message": "Social Media Assistant API", "status": "running"}

@app.get("/health")
async def health_check():
    try:
        # Test MongoDB connection
        mongodb.client.admin.command('ping')
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}

# File upload endpoint
@app.post("/api/upload-media")
async def upload_media(file: UploadFile = File(...)):
    """Upload media to Cloudinary"""
    try:
        logger.info(f"Received upload request for file: {file.filename}")
        
        # Create a temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False)
        temp_file_path = temp_file.name
        
        try:
            # Write the file content to the temporary file
            content = await file.read()
            with open(temp_file_path, "wb") as f:
                f.write(content)
            
            # Determine resource type based on content type
            resource_type = "video" if file.content_type and file.content_type.startswith("video/") else "image"
            
            # Upload to Cloudinary
            logger.info(f"Uploading to Cloudinary as {resource_type}: {temp_file_path}")
            upload_result = cloudinary.uploader.upload(
                temp_file_path,
                folder="instagram_posts",
                resource_type=resource_type
            )
            
            logger.info(f"Upload successful: {upload_result['secure_url']}")
            return {
                "url": upload_result["secure_url"],
                "public_id": upload_result["public_id"],
                "resource_type": resource_type
            }
            
        finally:
            # Clean up the temporary file
            temp_file.close()
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
    except Exception as e:
        logger.error(f"Error uploading media: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Media upload failed: {str(e)}")

# Analytics endpoints
@app.get("/api/analytics", response_model=Dict[str, Any])
async def get_analytics(platform: str = "all", period: str = "30d"):
    """Get analytics data for specified platform and period"""
    try:
        days = int(period.replace('d', '')) if period.endswith('d') else 30
        analytics_data = {}

        if platform in ["all", "instagram"]:
            try:
                instagram_analytics = get_instagram_analytics()
                instagram_id = instagram_analytics.get_instagram_account_id(Config.FACEBOOK_PAGE_ID)
                
                # Get Instagram metrics
                follower_dates, follower_counts = instagram_analytics.get_follower_count_trend(instagram_id, days)
                media_insights = instagram_analytics.get_media_insights(instagram_id, limit=50)
                
                analytics_data["instagram"] = {
                    "follower_trend": {
                        "dates": follower_dates,
                        "counts": follower_counts
                    },
                    "media_insights": media_insights,
                    "total_posts": len(media_insights),
                    "avg_engagement_rate": sum(post.get('engagement_rate', 0) for post in media_insights) / len(media_insights) if media_insights else 0,
                    "total_reach": sum(post.get('reach', 0) for post in media_insights),
                    "total_engagement": sum(post.get('engagement', 0) for post in media_insights)
                }
            except Exception as e:
                logger.error(f"Error getting Instagram analytics: {e}")
                analytics_data["instagram"] = {"error": str(e)}

        if platform in ["all", "facebook"]:
            try:
                facebook_analytics = get_facebook_analytics()
                
                # Get Facebook metrics
                growth_metrics = facebook_analytics.get_growth_metrics(Config.FACEBOOK_PAGE_ID, days)
                posts_data = facebook_analytics.get_page_posts(Config.FACEBOOK_PAGE_ID, limit=50)
                
                analytics_data["facebook"] = {
                    "growth_metrics": growth_metrics,
                    "posts_data": posts_data,
                    "total_posts": len(posts_data),
                    "avg_engagement_rate": sum(post.get('engagement_rate', 0) for post in posts_data) / len(posts_data) if posts_data else 0,
                    "total_engagement": sum(post.get('engagement', 0) for post in posts_data),
                    "total_reactions": sum(post.get('reactions', 0) for post in posts_data)
                }
            except Exception as e:
                logger.error(f"Error getting Facebook analytics: {e}")
                analytics_data["facebook"] = {"error": str(e)}

        return {
            "platform": platform,
            "period": period,
            "data": analytics_data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        logger.error(f"Error in get_analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/engagement")
async def get_engagement_analytics(platform: str = "all", period: str = "30d"):
    """Get engagement-specific analytics with caching to reduce API calls"""
    try:
        # Check cache first to reduce API calls
        cache_key = f"engagement_{platform}_{period}"
        cached_data = get_cached_analytics(cache_key)
        if cached_data:
            logger.info(f"Returning cached engagement data for {platform}")
            return cached_data

        days = int(period.replace('d', '')) if period.endswith('d') else 30
        engagement_data = {}

        if platform in ["all", "instagram"]:
            try:
                instagram_analytics = get_instagram_analytics()
                instagram_id = instagram_analytics.get_instagram_account_id(Config.FACEBOOK_PAGE_ID)
                
                # Reduce API calls by limiting data fetch
                limit = min(30, 50)  # Reduce from 50 to 30 for rate limiting
                media_insights = instagram_analytics.get_media_insights(instagram_id, limit=limit)
                
                # Calculate engagement metrics
                engagement_by_hour = {}
                for post in media_insights:
                    try:
                        # Handle different timestamp formats from Instagram API
                        timestamp_str = post['timestamp']
                        if timestamp_str.endswith('Z'):
                            timestamp_str = timestamp_str.replace('Z', '+00:00')
                        elif timestamp_str.endswith('+0000'):
                            timestamp_str = timestamp_str.replace('+0000', '+00:00')
                        
                        post_time = datetime.fromisoformat(timestamp_str)
                        hour = post_time.hour
                        if hour not in engagement_by_hour:
                            engagement_by_hour[hour] = []
                        engagement_by_hour[hour].append(post.get('engagement_rate', 0))
                    except Exception as timestamp_error:
                        logger.warning(f"Error parsing timestamp {post.get('timestamp', 'N/A')}: {timestamp_error}")
                        continue

                # Calculate best times
                best_times = instagram_analytics.get_best_times(json.dumps(media_insights))
                
                engagement_data["instagram"] = {
                    "engagement_by_hour": engagement_by_hour,
                    "best_times": best_times,
                    "avg_engagement_rate": sum(post.get('engagement_rate', 0) for post in media_insights) / len(media_insights) if media_insights else 0,
                    "top_performing_posts": sorted(media_insights, key=lambda x: x.get('engagement_rate', 0), reverse=True)[:5]
                }
            except Exception as e:
                logger.error(f"Error getting Instagram engagement: {e}")
                engagement_data["instagram"] = {"error": str(e)}

        if platform in ["all", "facebook"]:
            try:
                facebook_analytics = get_facebook_analytics()
                
                # Reduce Facebook API calls by limiting posts and using cache
                limit = min(10, 25)  # Reduce from 50 to 10 for rate limiting
                posts_data = facebook_analytics.get_page_posts(Config.FACEBOOK_PAGE_ID, limit=limit)
                
                # Calculate best times for Facebook
                best_times = facebook_analytics.get_best_times(posts_data)
                
                engagement_data["facebook"] = {
                    "best_times": best_times,
                    "avg_engagement_rate": sum(post.get('engagement_rate', 0) for post in posts_data) / len(posts_data) if posts_data else 0,
                    "top_performing_posts": sorted(posts_data, key=lambda x: x.get('engagement', 0), reverse=True)[:5]
                }
            except Exception as e:
                logger.error(f"Error getting Facebook engagement: {e}")
                engagement_data["facebook"] = {"error": str(e)}

        result = {
            "platform": platform,
            "period": period,
            "data": engagement_data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # Cache the result to reduce future API calls
        set_cached_analytics(cache_key, result)
        return result

    except Exception as e:
        logger.error(f"Error in get_engagement_analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/reach")
async def get_reach_analytics(platform: str = "all", period: str = "30d"):
    """Get reach-specific analytics with caching to reduce API calls"""
    try:
        # Check cache first to reduce API calls
        cache_key = f"reach_{platform}_{period}"
        cached_data = get_cached_analytics(cache_key)
        if cached_data:
            logger.info(f"Returning cached reach data for {platform}")
            return cached_data

        days = int(period.replace('d', '')) if period.endswith('d') else 30
        reach_data = {}

        if platform in ["all", "instagram"]:
            try:
                instagram_analytics = get_instagram_analytics()
                instagram_id = instagram_analytics.get_instagram_account_id(Config.FACEBOOK_PAGE_ID)
                
                # Reduce API calls by limiting data fetch
                limit = min(25, 50)  # Reduce from 50 to 25 for rate limiting
                media_insights = instagram_analytics.get_media_insights(instagram_id, limit=limit)
                
                reach_data["instagram"] = {
                    "total_reach": sum(post.get('reach', 0) for post in media_insights),
                    "avg_reach": sum(post.get('reach', 0) for post in media_insights) / len(media_insights) if media_insights else 0,
                    "top_reach_posts": sorted(media_insights, key=lambda x: x.get('reach', 0), reverse=True)[:5]
                }
            except Exception as e:
                logger.error(f"Error getting Instagram reach: {e}")
                reach_data["instagram"] = {"error": str(e)}

        if platform in ["all", "facebook"]:
            try:
                facebook_analytics = get_facebook_analytics()
                
                # Reduce Facebook API calls significantly
                limit = min(10, 25)  # Reduce from 50 to 10 for rate limiting
                posts_data = facebook_analytics.get_page_posts(Config.FACEBOOK_PAGE_ID, limit=limit)
                
                reach_data["facebook"] = {
                    "total_reach": sum(post.get('reach', 0) for post in posts_data),
                    "avg_reach": sum(post.get('reach', 0) for post in posts_data) / len(posts_data) if posts_data else 0,
                    "top_reach_posts": sorted(posts_data, key=lambda x: x.get('reach', 0), reverse=True)[:5]
                }
            except Exception as e:
                logger.error(f"Error getting Facebook reach: {e}")
                reach_data["facebook"] = {"error": str(e)}

        result = {
            "platform": platform,
            "period": period,
            "data": reach_data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # Cache the result to reduce future API calls
        set_cached_analytics(cache_key, result)
        return result

    except Exception as e:
        logger.error(f"Error in get_reach_analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/summary")
async def get_analytics_summary(period: str = "30d"):
    """Get comprehensive analytics summary with optimized performance"""
    try:
        days = int(period.replace('d', '')) if period.endswith('d') else 30
        
        # Get Instagram data (primary platform)
        instagram_data = {}
        try:
            instagram_analytics = get_instagram_analytics()
            instagram_id = instagram_analytics.get_instagram_account_id(Config.FACEBOOK_PAGE_ID)
            
            # Get actual account info including follower count
            account_info = instagram_analytics.get_account_info(instagram_id)
            current_followers = account_info.get('followers_count', 874)  # Your actual IG followers
            
            # Get Instagram metrics with reduced API calls for speed
            follower_dates, follower_counts = instagram_analytics.get_follower_count_trend(instagram_id, min(days, 14))
            media_insights = instagram_analytics.get_media_insights(instagram_id, limit=20)  # Reduced for speed
            
            # Calculate best times for Instagram
            best_times = {}
            if media_insights:
                best_times = instagram_analytics.get_best_times(json.dumps(media_insights))
            
            instagram_data = {
                "follower_trend": {"dates": follower_dates, "counts": follower_counts},
                "current_followers": current_followers,  # Add actual follower count
                "total_engagement": sum(post.get('engagement', 0) for post in media_insights),
                "avg_engagement_rate": sum(post.get('engagement_rate', 0) for post in media_insights) / len(media_insights) if media_insights else 0,
                "total_reach": sum(post.get('reach', 0) for post in media_insights),
                "total_posts": len(media_insights),
                "top_posts": sorted(media_insights, key=lambda x: x.get('engagement', 0), reverse=True)[:3],
                "best_times": best_times,
                "media_insights": media_insights[:10]  # First 10 for detailed view
            }
        except Exception as e:
            logger.error(f"Instagram analytics error: {e}")
            # Provide fallback data for Instagram
            instagram_data = {
                "follower_trend": {"dates": [], "counts": []},
                "total_engagement": 0,
                "avg_engagement_rate": 0,
                "total_reach": 0,
                "total_posts": 0,
                "top_posts": [],
                "best_times": {},
                "media_insights": [],
                "error": "Instagram data temporarily unavailable"
            }
        
        # Get Facebook data using the same token with rate limiting
        facebook_data = {}
        try:
            if can_make_facebook_call():
                facebook_analytics = get_facebook_analytics()
                
                # Get Facebook page insights with valid metrics (minimal call)
                log_facebook_api_call("page_insights")
                page_insights = facebook_analytics.get_page_insights(
                    Config.FACEBOOK_PAGE_ID, 
                    ['page_fans'], 
                    'day'
                )
                
                # Get Facebook posts with reduced limit
                log_facebook_api_call("page_posts")
                posts_data = facebook_analytics.get_page_posts(Config.FACEBOOK_PAGE_ID, limit=5)  # Reduced from 10 to 5
                
                # Calculate best times for Facebook only if we have data
                best_times = {}
                if posts_data:
                    best_times = facebook_analytics.get_best_times(posts_data)
                
                facebook_data = {
                    "total_engagement": sum(post.get('engagement', 0) for post in posts_data),
                    "avg_engagement_rate": sum(post.get('engagement_rate', 0) for post in posts_data) / len(posts_data) if posts_data else 0,
                    "total_reach": sum(post.get('reach', 0) for post in posts_data),
                    "total_posts": len(posts_data),
                    "follower_trend": {"dates": [], "counts": []},  # Will be populated from insights
                    "top_posts": sorted(posts_data, key=lambda x: x.get('engagement', 0), reverse=True)[:3],
                    "best_times": best_times,
                    "posts_data": posts_data[:5]  # Reduced from 10 to 5
                }
                
                # Extract follower data from page insights
                if page_insights and 'data' in page_insights:
                    for metric in page_insights['data']:
                        if metric['name'] == 'page_fans':
                            dates = [value['end_time'][:10] for value in metric.get('values', [])]
                            counts = [value['value'] for value in metric.get('values', [])]
                            facebook_data["follower_trend"] = {"dates": dates, "counts": counts}
                            break
            else:
                logger.warning("Skipping Facebook API calls due to rate limiting")
                facebook_data = {
                    "total_engagement": 0,
                    "avg_engagement_rate": 0,
                    "total_reach": 0,
                    "total_posts": 0,
                    "follower_trend": {"dates": [], "counts": []},
                    "top_posts": [],
                    "best_times": {},
                    "posts_data": [],
                    "note": "Facebook data skipped due to rate limiting"
                }
                        
        except Exception as e:
            logger.error(f"Facebook analytics error: {e}")
            # Provide fallback data for Facebook instead of error status
            facebook_data = {
                "total_engagement": 0,
                "avg_engagement_rate": 0,
                "total_reach": 0,
                "total_posts": 0,
                "follower_trend": {"dates": [], "counts": []},
                "top_posts": [],
                "best_times": {},
                "posts_data": [],
                "note": "Facebook analytics temporarily unavailable - this is normal during development"
            }
        
        # Calculate overview metrics with real follower counts
        # Use your actual follower counts: 874 Instagram, 1200 Facebook
        instagram_followers = instagram_data.get("current_followers", 874)  # Your actual IG followers
        facebook_followers = facebook_data["follower_trend"]["counts"][-1] if facebook_data["follower_trend"]["counts"] else 1200  # Your actual FB followers
        
        follower_growth = 0
        if len(instagram_data["follower_trend"]["counts"]) > 1:
            follower_growth = instagram_data["follower_trend"]["counts"][-1] - instagram_data["follower_trend"]["counts"][0]
        
        # Get engagement data for both platforms
        engagement_data = {}
        try:
            engagement_response = await get_engagement_analytics(platform="all", period=period)
            engagement_data = engagement_response.get("data", {})
        except Exception as e:
            logger.error(f"Error fetching engagement data: {e}")
            engagement_data = {}

        return {
            "period": period,
            "summary": {
                "overview": {
                    "total_followers": instagram_followers + facebook_followers,
                    "follower_growth": follower_growth,
                    "total_engagement": instagram_data["total_engagement"] + facebook_data["total_engagement"],
                    "avg_engagement_rate": (instagram_data["avg_engagement_rate"] + facebook_data["avg_engagement_rate"]) / 2,
                    "total_reach": instagram_data["total_reach"] + facebook_data["total_reach"],
                    "total_posts": instagram_data["total_posts"] + facebook_data["total_posts"]
                },
                "platforms": {
                    "instagram": {
                        "status": "connected" if not instagram_data.get("error") else "error",
                        "followers": instagram_followers,
                        "engagement_rate": instagram_data["avg_engagement_rate"]
                    },
                    "facebook": {
                        "status": "connected" if not facebook_data.get("note") else "limited",
                        "followers": facebook_followers,
                        "engagement_rate": facebook_data["avg_engagement_rate"]
                    }
                }
            },
            "instagram": instagram_data,
            "facebook": facebook_data,
            "engagement": engagement_data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        logger.error(f"Error in get_analytics_summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/growth-comparison")
async def get_growth_comparison(period: str = "30d"):
    """Get growth comparison between Instagram and Facebook with shared token"""
    try:
        days = int(period.replace('d', '')) if period.endswith('d') else 30
        
        # Get Instagram growth data
        try:
            instagram_analytics = get_instagram_analytics()
            instagram_id = instagram_analytics.get_instagram_account_id(Config.FACEBOOK_PAGE_ID)
            instagram_dates, instagram_counts = instagram_analytics.get_follower_count_trend(instagram_id, min(days, 14))
            
            # Calculate growth rates
            instagram_growth_rate = 0
            if len(instagram_counts) > 1 and instagram_counts[0] > 0:
                instagram_growth_rate = ((instagram_counts[-1] - instagram_counts[0]) / instagram_counts[0]) * 100
        except Exception as e:
            logger.error(f"Instagram growth data error: {e}")
            instagram_dates, instagram_counts = [], []
            instagram_growth_rate = 0
        
        # Get Facebook growth data using the same token
        try:
            facebook_analytics = get_facebook_analytics()
            facebook_dates, facebook_counts = facebook_analytics.get_follower_count_trend(Config.FACEBOOK_PAGE_ID, min(days, 14))
            
            facebook_growth_rate = 0
            if len(facebook_counts) > 1 and facebook_counts[0] > 0:
                facebook_growth_rate = ((facebook_counts[-1] - facebook_counts[0]) / facebook_counts[0]) * 100
        except Exception as e:
            logger.error(f"Facebook growth data error: {e}")
            # Use Instagram dates as fallback for consistency
            facebook_dates = instagram_dates if instagram_dates else []
            facebook_counts = [0] * len(instagram_dates) if instagram_dates else []
            facebook_growth_rate = 0
        
        # Prepare comparison data
        comparison_data = {
            "instagram": {
                "dates": instagram_dates,
                "follower_counts": instagram_counts,
                "growth_rate": instagram_growth_rate,
                "total_gained": instagram_counts[-1] - instagram_counts[0] if len(instagram_counts) > 1 else 0,
                "current_followers": instagram_counts[-1] if instagram_counts else 0,
                "status": "Connected"
            },
            "facebook": {
                "dates": facebook_dates,
                "follower_counts": facebook_counts,
                "growth_rate": facebook_growth_rate,
                "total_gained": facebook_counts[-1] - facebook_counts[0] if len(facebook_counts) > 1 else 0,
                "current_followers": facebook_counts[-1] if facebook_counts else 0,
                "status": "Connected" if facebook_counts else "Limited data in development"
            },
            "comparison": {
                "better_performing_platform": "instagram" if instagram_growth_rate > facebook_growth_rate else "facebook" if facebook_growth_rate > 0 else "instagram",
                "growth_difference": abs(instagram_growth_rate - facebook_growth_rate),
                "combined_growth": instagram_growth_rate + facebook_growth_rate
            }
        }
        
        return {
            "period": period,
            "data": comparison_data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in get_growth_comparison: {e}")
        # Return mock data
        return {
            "period": period,
            "data": {
                "instagram": {"dates": [], "follower_counts": [], "growth_rate": 0, "total_gained": 0, "current_followers": 0, "status": "Initializing..."},
                "facebook": {"dates": [], "follower_counts": [], "growth_rate": 0, "total_gained": 0, "current_followers": 0, "status": "Initializing..."},
                "comparison": {"better_performing_platform": "none", "growth_difference": 0, "combined_growth": 0}
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

# Posts endpoints
@app.get("/api/posts")
async def get_posts(db: Session = Depends(get_db)):
    """Get all scheduled posts"""
    try:
        posts = load_scheduled_posts()
        return {
            "posts": posts,
            "total": len(posts),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting posts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/posts")
async def create_post(post_data: PostCreate, background_tasks: BackgroundTasks, session_id: str = Query(...), db: Session = Depends(get_db)):
    """Create and schedule a new post with IST timezone support"""
    try:
        # Verify session first
        if not mongodb.verify_session(session_id):
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        
        session = mongodb.get_session(session_id)
        user_id = session["user_id"]
        
        IST = pytz.timezone('Asia/Kolkata')
        
        logger.info(f"Creating post: {post_data.media_type} for {post_data.platform}")
        
        # Parse scheduled time and handle IST timezone
        try:
            # Parse the incoming datetime
            scheduled_datetime = datetime.fromisoformat(post_data.scheduled_time.replace('Z', '+00:00'))
            
            # If timezone info is missing, assume IST and convert to UTC
            if scheduled_datetime.tzinfo is None:
                scheduled_datetime = IST.localize(scheduled_datetime)
                scheduled_datetime = scheduled_datetime.astimezone(timezone.utc)
            elif scheduled_datetime.tzinfo != timezone.utc:
                # Convert to UTC if not already
                scheduled_datetime = scheduled_datetime.astimezone(timezone.utc)
                
            logger.info(f"Scheduled time (UTC): {scheduled_datetime}")
        except ValueError as ve:
            logger.error(f"Invalid datetime format: {post_data.scheduled_time}")
            raise HTTPException(status_code=400, detail=f"Invalid datetime format: {ve}")

        # Check if scheduled time is in the future (allow up to 5 minutes in the past for immediate posting)
        current_time = datetime.now(timezone.utc)
        time_diff = (scheduled_datetime - current_time).total_seconds()
        
        if time_diff < -300:  # More than 5 minutes in the past
            raise HTTPException(
                status_code=400, 
                detail="Cannot schedule posts in the past. Please select a future time."
            )

        # Determine platforms to post to
        platforms = []
        platform_display = post_data.platform
        if post_data.platform == "Both":
            platforms = ["Instagram", "Facebook"]
            platform_display = "Both"
        else:
            platforms = [post_data.platform]

        created_posts = []
        
        # Create a post record for each platform
        for target_platform in platforms:
            is_facebook = target_platform == "Facebook"
            
            # Create post record
            post_record = ScheduledPost(
                media_urls=post_data.media_urls,
                media_type=post_data.media_type,
                caption=post_data.caption,
                scheduled_time=scheduled_datetime,
                username=post_data.username,
                status='scheduled',
                cloudinary_public_ids=post_data.cloudinary_public_ids,
                is_facebook=is_facebook,
                platforms=platform_display
            )
            
            db.add(post_record)
            db.commit()
            db.refresh(post_record)
            
            # Schedule the posting task
            task = schedule_instagram_post.delay(
                media_url=post_data.media_urls,
                media_type=post_data.media_type,
                caption=post_data.caption,
                scheduled_time_str=scheduled_datetime.isoformat(),
                username=post_data.username,
                cloudinary_public_id=post_data.cloudinary_public_ids,
                is_facebook=is_facebook
            )
            
            # Update post record with task ID
            post_record.celery_task_id = task.id
            db.commit()
            
            created_posts.append(post_record.to_dict())
            logger.info(f"Created post {post_record.id} for {target_platform} with task {task.id}")

        # Determine message based on immediate posting or scheduling
        if post_data.immediate or time_diff <= 60:  # If immediate or within 1 minute
            message = f"Post(s) published immediately to {platform_display}!"
            notification_message = f"Your post has been published to {platform_display}"
            notification_type = "success"
        else:
            scheduled_time_ist = scheduled_datetime.astimezone(IST).strftime('%B %d, %Y at %I:%M %p IST')
            message = f"Post(s) scheduled successfully for {platform_display}"
            notification_message = f"Post scheduled for {scheduled_time_ist} on {platform_display}"
            notification_type = "success"
        
        # Create notification for the user
        try:
            create_user_notification(user_id, notification_type, notification_message)
        except Exception as e:
            logger.error(f"Failed to create notification: {e}")
            # Don't fail the post creation if notification fails
        
        return {
            "message": message,
            "posts": created_posts,
            "total_posts": len(created_posts),
            "scheduled_time_ist": scheduled_datetime.astimezone(IST).strftime('%Y-%m-%d %I:%M %p IST'),
            "immediate": post_data.immediate or time_diff <= 60,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating post: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/posts/{post_id}")
async def update_post(post_id: str, post_update: PostUpdate, db: Session = Depends(get_db)):
    """Update a scheduled post"""
    try:
        post = db.query(ScheduledPost).filter(ScheduledPost.id == post_id).first()
        
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")

        # Update fields if provided
        if post_update.caption is not None:
            post.caption = post_update.caption
        if post_update.scheduled_time is not None:
            post.scheduled_time = datetime.fromisoformat(post_update.scheduled_time)
        if post_update.status is not None:
            post.status = post_update.status

        post.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(post)

        return {
            "message": "Post updated successfully",
            "post": post.to_dict(),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        logger.error(f"Error updating post: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/posts/{post_id}")
async def delete_post(post_id: str, db: Session = Depends(get_db)):
    """Delete a scheduled post"""
    try:
        post = db.query(ScheduledPost).filter(ScheduledPost.id == post_id).first()
        
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")

        # Cancel the Celery task if it exists and is still pending
        if post.celery_task_id and post.status == 'scheduled':
            from celery_app import celery_app
            celery_app.control.revoke(post.celery_task_id, terminate=True)

        db.delete(post)
        db.commit()

        return {
            "message": "Post deleted successfully",
            "post_id": post_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        logger.error(f"Error deleting post: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# Additional utility endpoints
# Content Calendar Generation
class ContentCalendarRequest(BaseModel):
    month: int
    year: int
    num_days: int
    food_style: List[str]
    promotion_focus: Optional[str] = None

@app.post("/api/generate-calendar")
async def generate_content_calendar(request: ContentCalendarRequest):
    """Generate AI-powered content calendar for food delivery service"""
    try:
        import google.generativeai as genai
        import calendar
        import re
        
        if not Config.GEMINI_API_KEY:
            raise HTTPException(status_code=400, detail="Gemini API key not configured")
        
        # Configure Gemini
        genai.configure(api_key=Config.GEMINI_API_KEY)
        
        # Validate request
        if request.month < 1 or request.month > 12:
            raise HTTPException(status_code=400, detail="Month must be between 1 and 12")
        
        if request.num_days < 7 or request.num_days > 31:
            raise HTTPException(status_code=400, detail="Number of days must be between 7 and 31")
        
        if not request.food_style:
            raise HTTPException(status_code=400, detail="At least one food style must be selected")
        
        # Generate content calendar using Gemini AI
        food_style_str = ", ".join(request.food_style)
        month_name = calendar.month_name[request.month]
        
        prompt = f"""
        Generate a {request.num_days}-day social media content calendar for a food delivery service focusing on {food_style_str} cuisine for {month_name}, {request.year}.
        Include topics, post ideas, and suggested Instagram features (e.g., Reel, Story, Carousel, Static Post).
        Consider the following:
        - Promotions/Themes: {request.promotion_focus if request.promotion_focus else 'None'}
        - Include a mix of engaging, informative, and promotional content.
        - Suggest relevant hashtags.
        - Structure the output as a JSON array of daily entries, with each entry having 'date', 'topic', 'post_idea', 'instagram_feature', 'hashtags'.
        - Example format:
        ```json
        [
          {{
            "date": "YYYY-MM-DD",
            "topic": "Topic Name",
            "post_idea": "Detailed post description",
            "instagram_feature": "Reel/Story/Carousel/Static Post",
            "hashtags": "#food #delivery #delicious"
          }}
        ]
        ```
        Ensure the dates are correct for the specified month and year, starting from the 1st of the month.
        Make sure each post idea is unique and engaging, with varied Instagram features.
        """

        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(prompt)
        response_text = response.text

        # Parse the JSON response
        try:
            # Try to extract JSON from markdown code block
            json_match = re.search(r'```json\n(.*)\n```', response_text, re.DOTALL)
            if json_match:
                calendar_data = json.loads(json_match.group(1))
            else:
                # Try to parse the entire response as JSON
                calendar_data = json.loads(response_text)

            if not isinstance(calendar_data, list):
                raise ValueError("AI response is not a valid JSON array")

            # Validate the calendar data structure
            for item in calendar_data:
                required_fields = ['date', 'topic', 'post_idea', 'instagram_feature', 'hashtags']
                if not all(field in item for field in required_fields):
                    logger.warning(f"Calendar item missing required fields: {item}")

            logger.info(f"Successfully generated calendar with {len(calendar_data)} items")
            
            return {
                "success": True,
                "calendar": calendar_data,
                "message": f"Generated {len(calendar_data)} days of content for {month_name} {request.year}"
            }

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {e}")
            logger.error(f"Raw response: {response_text}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to parse AI response. Please try again. Error: {str(e)}"
            )

    except Exception as e:
        logger.error(f"Error generating content calendar: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Content calendar generation failed: {str(e)}")

@app.post("/api/generate-captions")
async def generate_post_captions(request: CaptionGenerateRequest):
    """Enhanced caption generation with detailed options"""
    try:
        logger.info(f"Generating captions for media: {request.media_path}")
        
        # Ensure media_path is a list
        media_paths = request.media_path
        if not isinstance(media_paths, list):
            media_paths = [media_paths]
            
        # Validate media paths
        if not media_paths or not all(media_paths):
            error_msg = "No valid media paths provided"
            logger.error(error_msg)
            raise HTTPException(status_code=400, detail=error_msg)
            
        # Log the media paths for debugging
        logger.info(f"Media paths for caption generation: {media_paths}")
        
        # Build enhanced custom prompt if not provided
        enhanced_prompt = request.custom_prompt
        if not enhanced_prompt and request.style != 'custom':
            enhanced_prompt = f"""
            Target Audience: {request.target_audience or 'General audience'}
            Business Goals: {request.business_goals or 'Increase engagement'}
            Content Tone: {request.content_tone or 'Friendly & Casual'}
            Hashtag Strategy: {request.hashtag_preference or 'Medium (10-15 hashtags)'}
            Call-to-Action: {'Yes' if request.include_cta else 'No'}
            {f'CTA Type: {request.cta_type}' if request.include_cta else ''}
            {f'Custom CTA: {request.custom_cta}' if request.include_cta and request.custom_cta else ''}
            Engagement Questions: {'Yes' if request.include_questions else 'No'}
            Post Timing: {request.post_timing or 'Regular Day'}
            {f'Location: {request.location_context}' if request.location_context else ''}
            Seasonal Context: {request.seasonal_context or 'Current Season'}
            {f'Brand Voice: {request.brand_voice}' if request.brand_voice else ''}
            
            Create captions that:
            1. Hook the audience in the first line
            2. Include relevant emojis naturally based on content tone
            3. Add appropriate call-to-action elements
            4. Use hashtag strategy as specified
            5. Encourage engagement through questions if requested
            6. Match the target audience's interests and language
            7. Align with the business goals
            8. Reflect the brand voice if provided
            """
        
        try:
            # Call the Celery task to generate captions with enhanced prompt
            task = generate_captions.delay(
                media_path=media_paths,
                media_type=request.media_type,
                style=request.style,
                custom_prompt=enhanced_prompt,
                target_audience=request.target_audience,
                business_goals=request.business_goals,
                num_variants=request.num_variants
            )
            
            # Get the result with a timeout
            result = task.get(timeout=180)
            logger.info(f"Caption generation result: {result}")
            
            if not result:
                raise ValueError("Empty result from caption generation task")
                
            if 'error' in result:
                raise ValueError(f"Error in caption generation: {result['error']}")
                
            if not result.get('captions'):
                raise ValueError("No captions were generated")
            
            return {
                "captions": result.get('captions', []),
                "enhanced_features": True,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        except Exception as task_error:
            logger.error(f"Task execution error: {task_error}")
            
            # Provide enhanced fallback captions based on request parameters
            audience_specific_hashtags = {
                "Food Lovers": "#foodie #delicious #yummy #tasty #foodporn #instafood #foodstagram #cooking #recipe #dining",
                "Young Adults (18-25)": "#trending #viral #lifestyle #mood #aesthetic #vibe #goals #lit #fire #bestlife",
                "Professionals (25-35)": "#success #motivation #business #professional #career #networking #goals #hustle #growth #leadership",
                "Parents": "#family #parenting #kids #love #blessed #familytime #memories #grateful #momlife #dadlife",
                "Fitness Enthusiasts": "#fitness #workout #health #gym #strong #fitlife #wellness #motivation #training #exercise"
            }
            
            default_hashtags = "#amazing #content #engagement #socialmedia #love #instagood #photooftheday #follow #like"
            hashtags = audience_specific_hashtags.get(request.target_audience, default_hashtags)
            
            cta_text = ""
            if request.include_cta:
                if request.cta_type == "Like & Share":
                    cta_text = "Double tap if you agree and share with someone who needs to see this! 💫"
                elif request.cta_type == "Visit Website":
                    cta_text = "Check out our website for more amazing content! 🌐"
                elif request.cta_type == "Order Now":
                    cta_text = "Order now and experience the difference! 🛒"
                elif request.cta_type == "Follow for More":
                    cta_text = "Follow us for more amazing content like this! ➡️"
                elif request.cta_type == "Save Post":
                    cta_text = "Save this post for later reference! 📌"
                elif request.cta_type == "Comment Below":
                    cta_text = "Drop your thoughts in the comments below! 💬"
                elif request.cta_type == "Tag Friends":
                    cta_text = "Tag your friends who need to see this! 👥"
                elif request.custom_cta:
                    cta_text = request.custom_cta
            
            question_text = ""
            if request.include_questions:
                question_text = "What's your take on this? Let us know in the comments! 🤔"
            
            fallback_captions = [
                {
                    "text": f"🌟 Creating something special just for {request.target_audience or 'you'}! {question_text} {cta_text} {hashtags[:150]}",
                    "engagement_score": 85,
                    "hashtags": hashtags
                },
                {
                    "text": f"✨ When passion meets purpose... 🚀 Working towards: {request.business_goals or 'amazing results'} 💪 {cta_text} {hashtags[:150]}",
                    "engagement_score": 80,
                    "hashtags": hashtags
                },
                {
                    "text": f"💫 Every moment tells a story. What's yours? Perfect for {request.target_audience or 'everyone'} who appreciates quality content! 🙌 {cta_text} {hashtags[:150]}",
                    "engagement_score": 82,
                    "hashtags": hashtags
                }
            ]
            
            return {
                "captions": fallback_captions,
                "fallback": True,
                "enhanced_features": True,
                "warning": "Generated enhanced fallback captions due to processing error",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

    except ValueError as ve:
        logger.error(f"Caption generation value error: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Caption generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Caption generation failed: {str(e)}")

@app.get("/api/posts/{post_id}/history")
async def get_post_history(post_id: str, db: Session = Depends(get_db)):
    """Get status history for a specific post"""
    try:
        history = db.query(PostStatusHistory).filter(
            PostStatusHistory.post_id == post_id
        ).order_by(PostStatusHistory.created_at.desc()).all()

        return {
            "post_id": post_id,
            "history": [
                {
                    "id": h.id,
                    "previous_status": h.previous_status,
                    "new_status": h.new_status,
                    "error_message": h.error_message,
                    "media_id": h.media_id,
                    "created_at": h.created_at.isoformat() if h.created_at else None
                }
                for h in history
            ],
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        logger.error(f"Error getting post history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/config/status")
async def get_config_status():
    """Get configuration status"""
    try:
        config_status = {
            "instagram_configured": bool(Config.INSTAGRAM_ACCESS_TOKEN and Config.INSTAGRAM_BUSINESS_ACCOUNT_ID),
            "facebook_configured": bool(Config.FACEBOOK_PAGE_ID and Config.INSTAGRAM_ACCESS_TOKEN),
            "cloudinary_configured": bool(Config.CLOUDINARY_CLOUD_NAME and Config.CLOUDINARY_API_KEY),
            "gemini_configured": bool(Config.GEMINI_API_KEY),
            "redis_configured": bool(Config.REDIS_URL),
        }

        return {
            "config": config_status,
            "all_configured": all(config_status.values()),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        logger.error(f"Error getting config status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for better error reporting"""
    logger.error(f"Global exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error": str(exc),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5000,
        reload=True,
        log_level="info"
    )
 
