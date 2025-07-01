from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, File, UploadFile, status, Query, Form, Request
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
import pandas as pd
import csv
import io
import base64
import requests
from io import StringIO
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, PlainTextResponse
import mimetypes
import re 

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
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files directory for serving uploaded images
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Configure Cloudinary
try:
    logger.info(f"Configuring Cloudinary with cloud_name: {Config.CLOUDINARY_CLOUD_NAME}")
    cloudinary.config(
        cloud_name=Config.CLOUDINARY_CLOUD_NAME,
        api_key=Config.CLOUDINARY_API_KEY,
        api_secret=Config.CLOUDINARY_API_SECRET
    )
    logger.info("Cloudinary configuration successful")
except Exception as e:
    logger.error(f"Cloudinary configuration error: {e}")
    logger.error(f"Cloud Name: {Config.CLOUDINARY_CLOUD_NAME}")
    logger.error(f"API Key: {Config.CLOUDINARY_API_KEY}")
    logger.error(f"API Secret: {Config.CLOUDINARY_API_SECRET}")

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

# Email Marketing Models
class EmailListUploadResponse(BaseModel):
    session_id: str
    email_count: int
    preview_emails: List[str]
    message: str

class EmailDraft(BaseModel):
    subject: str
    html_content: str
    text_content: Optional[str] = None
    sender_name: Optional[str] = "HOGIST"
    sender_email: Optional[str] = "support@hogist.com"

class EmailGenerateRequest(BaseModel):
    prompt: str
    tone: Optional[str] = "professional"
    purpose: Optional[str] = "marketing"
    include_images: Optional[bool] = False
    custom_instructions: Optional[str] = None

class EmailSendRequest(BaseModel):
    subject: str
    html_content: str
    text_content: Optional[str] = None
    sender_name: Optional[str] = "HOGIST"
    sender_email: Optional[str] = "support@hogist.com"
    test_send: Optional[bool] = False
    test_email: Optional[str] = None

# Email session storage (in-memory for simplicity)
session_email_storage = {}

# Email verification using MailboxLayer API
async def verify_email_with_brevo(email: str) -> Dict[str, Any]:
    """
    Verify email using basic format validation and check against Brevo logs
    Returns verification data based on simple validation and delivery history
    """
    import re
    
    # Basic email format validation
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    format_valid = bool(re.match(email_regex, email))
    
    # Check common disposable email domains
    disposable_domains = {
        '10minutemail.com', 'tempmail.org', 'guerrillamail.com', 
        'mailinator.com', 'throwaway.email', 'temp-mail.org'
    }
    domain = email.split('@')[1].lower() if '@' in email else ''
    is_disposable = domain in disposable_domains
    
    # Check free email providers
    free_providers = {
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
        'aol.com', 'icloud.com', 'mail.com'
    }
    is_free = domain in free_providers
    
    # Basic MX record check (simplified)
    mx_found = format_valid and not is_disposable  # Assume valid if format is good and not disposable
    
    # Calculate score based on simple rules
    score = 0.0
    if format_valid:
        score += 0.4
    if mx_found:
        score += 0.3
    if not is_disposable:
        score += 0.2
    if domain and len(domain) > 3:  # Reasonable domain length
        score += 0.1
    
    # Determine overall validity
    is_valid = format_valid and not is_disposable and mx_found
    
    # Determine verification status
    if not format_valid:
        verification_status = 'invalid_format'
    elif is_disposable:
        verification_status = 'disposable'
    elif score < 0.5:
        verification_status = 'low_quality'
    else:
        verification_status = 'brevo_validated'
    
    return {
        'email': email,
        'valid': is_valid,
        'verification_status': verification_status,
        'format_valid': format_valid,
        'mx_found': mx_found,
        'smtp_check': True if is_valid else False,  # Simplified
        'disposable': is_disposable,
        'free': is_free,
        'score': score,
        'error_message': None,
        'verified_at': datetime.now(timezone.utc).isoformat()
    }

async def get_brevo_email_logs(limit: int = 50, offset: int = 0) -> Dict[str, Any]:
    """
    Fetch email logs from Brevo's Transactional Email API
    """
    try:
        headers = {
            "accept": "application/json",
            "api-key": Config.BREVO_API_KEY
        }
        
        params = {
            "limit": limit,
            "offset": offset
        }
        
        response = requests.get(
            "https://api.brevo.com/v3/smtp/emails", 
            headers=headers, 
            params=params,
            timeout=10
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            print(f"Brevo API error: {response.status_code} - {response.text}")
            return {"logs": [], "count": 0}
            
    except Exception as e:
        print(f"Error fetching Brevo logs: {e}")
        return {"logs": [], "count": 0}

async def get_brevo_email_logs_by_email(email: str, limit: int = 10) -> Dict[str, Any]:
    """
    Fetch email logs from Brevo's Transactional Email API filtered by email address
    This satisfies Brevo's requirement for at least one filter parameter
    """
    try:
        headers = {
            "accept": "application/json",
            "api-key": Config.BREVO_API_KEY
        }
        
        params = {
            "email": email,  # Filter by email address (required by Brevo)
            "limit": limit,
            "offset": 0
        }
        
        response = requests.get(
            "https://api.brevo.com/v3/smtp/emails", 
            headers=headers, 
            params=params,
            timeout=10
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            print(f"Brevo API error for {email}: {response.status_code} - {response.text}")
            return {"logs": [], "count": 0}
            
    except Exception as e:
        print(f"Error fetching Brevo logs for {email}: {e}")
        return {"logs": [], "count": 0}

async def check_email_delivery_status(email: str) -> Dict[str, Any]:
    """
    Check if an email has been sent through Brevo and its delivery status
    """
    try:
        logs = await get_brevo_email_logs(limit=100)
        
        for log in logs.get('logs', []):
            if log.get('to', [{}])[0].get('email', '').lower() == email.lower():
                return {
                    'email': email,
                    'status': log.get('status', 'unknown'),
                    'subject': log.get('subject', ''),
                    'date': log.get('date', ''),
                    'message_id': log.get('messageId', ''),
                    'found_in_logs': True
                }
        
        return {
            'email': email,
            'status': 'not_sent',
            'found_in_logs': False
        }
        
    except Exception as e:
        print(f"Error checking delivery status for {email}: {e}")
        return {
            'email': email,
            'status': 'error',
            'error': str(e),
            'found_in_logs': False
        }

async def verify_email_list(emails: List[str], batch_size: int = 20) -> List[Dict[str, Any]]:
    """
    Verify a list of emails using Brevo-based validation
    Much faster than external API calls
    """
    verified_emails = []
    
    print(f"Verifying {len(emails)} emails using Brevo validation...")
    
    # Process emails in batches (though this is now much faster)
    for i in range(0, len(emails), batch_size):
        batch = emails[i:i + batch_size]
        
        print(f"Processing verification batch {i//batch_size + 1}/{(len(emails) + batch_size - 1)//batch_size}: {len(batch)} emails")
        
        # Create tasks for concurrent verification
        tasks = [verify_email_with_brevo(email) for email in batch]
        
        try:
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            for j, result in enumerate(batch_results):
                if isinstance(result, Exception):
                    print(f"Verification exception for {batch[j]}: {str(result)}")
                    verified_emails.append({
                        'email': batch[j],
                        'valid': False,
                        'verification_status': 'error',
                        'format_valid': False,
                        'mx_found': False,
                        'smtp_check': False,
                        'disposable': None,
                        'free': None,
                        'score': 0.0,
                        'error_message': f"Verification error: {str(result)}",
                        'verified_at': datetime.now(timezone.utc).isoformat()
                    })
                else:
                    verified_emails.append(result)
                    
        except Exception as e:
            print(f"Batch verification error: {e}")
            # Add default entries for failed batch
            for email in batch:
                verified_emails.append({
                    'email': email,
                    'valid': False,
                    'verification_status': 'batch_error',
                    'format_valid': False,
                    'mx_found': False,
                    'smtp_check': False,
                    'disposable': None,
                    'free': None,
                    'score': 0.0,
                    'error_message': f"Batch error: {str(e)}",
                    'verified_at': datetime.now(timezone.utc).isoformat()
                })
    
    print(f"Email verification completed: {len(verified_emails)} results")
    return verified_emails

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
max_facebook_calls_per_hour = 200  # Increased from 100 to 200 for better real-time performance

def can_make_facebook_call(priority_request=False):
    """Check if we can make a Facebook API call without hitting rate limits"""
    current_time = time.time()
    
    # Reset counter if hour has passed
    if current_time > facebook_api_calls["reset_time"]:
        facebook_api_calls["count"] = 0
        facebook_api_calls["reset_time"] = current_time + 3600
        logger.info("Facebook API rate limit counter reset")
    
    # Allow priority requests (like dashboard) to bypass strict limits
    if priority_request:
        if facebook_api_calls["count"] >= max_facebook_calls_per_hour * 2:  # 400 for priority
            logger.warning("Even priority Facebook API call limit reached")
            return False
        facebook_api_calls["count"] += 1
        return True
    
    # Check if we're under the limit for regular requests
    if facebook_api_calls["count"] >= max_facebook_calls_per_hour:
        logger.warning(f"Facebook API call limit reached for this hour ({facebook_api_calls['count']}/{max_facebook_calls_per_hour})")
        return False
    
    facebook_api_calls["count"] += 1
    return True

def log_facebook_api_call(endpoint: str):
    """Log Facebook API call for monitoring"""
    logger.info(f"Facebook API call to {endpoint} (calls this hour: {facebook_api_calls['count']}/{max_facebook_calls_per_hour})")

@app.get("/api/debug/facebook-rate-limit")
async def debug_facebook_rate_limit():
    """Debug endpoint to check and reset Facebook rate limiting"""
    current_time = time.time()
    time_until_reset = facebook_api_calls["reset_time"] - current_time
    
    return {
        "current_count": facebook_api_calls["count"],
        "max_per_hour": max_facebook_calls_per_hour,
        "time_until_reset_minutes": max(0, time_until_reset / 60),
        "can_make_call": can_make_facebook_call(),
        "reset_time": facebook_api_calls["reset_time"]
    }

@app.post("/api/debug/reset-facebook-rate-limit")
async def reset_facebook_rate_limit():
    """Reset Facebook API rate limiting counter"""
    facebook_api_calls["count"] = 0
    facebook_api_calls["reset_time"] = time.time() + 3600
    logger.info("Facebook API rate limit manually reset")
    return {
        "message": "Facebook API rate limit reset successfully",
        "new_count": facebook_api_calls["count"],
        "reset_time": facebook_api_calls["reset_time"]
    }

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
            current_followers = account_info.get('followers_count', 0)  # Use real follower count or 0 if unavailable
            
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
                "current_followers": 0,  # Changed from hardcoded value
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
            if can_make_facebook_call(priority_request=True):  # Use priority for dashboard requests
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
                
                # Get enhanced follower trend data using the improved method
                try:
                    days = int(period.replace('d', '')) if period.endswith('d') else 30
                    log_facebook_api_call("follower_trend")
                    fb_dates, fb_counts = facebook_analytics.get_follower_count_trend(Config.FACEBOOK_PAGE_ID, min(days, 14))
                    facebook_data["follower_trend"] = {"dates": fb_dates, "counts": fb_counts}
                except Exception as e:
                    logger.warning(f"Could not get enhanced Facebook follower trend: {e}")
                    # Fallback to page insights extraction
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
        # Use actual follower counts from API data
        instagram_followers = instagram_data.get("current_followers", 0)  # Use real Instagram followers
        facebook_followers = facebook_data["follower_trend"]["counts"][-1] if facebook_data["follower_trend"]["counts"] else 0  # Use real Facebook followers
        
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

# Email Marketing Endpoints
@app.post("/api/mailer/test-brevo-api")
async def test_brevo_api():
    """Test Brevo API connection"""
    try:
        # Test Brevo API if configured
        if hasattr(Config, 'BREVO_API_KEY') and Config.BREVO_API_KEY:
            try:
                # Test Brevo API with a simple account info request
                headers = {
                    'accept': 'application/json',
                    'api-key': Config.BREVO_API_KEY
                }
                
                # Use account endpoint to test API key validity
                response = requests.get('https://api.brevo.com/v3/account', headers=headers)
                
                if response.status_code == 200:
                    account_info = response.json()
                    return {
                        "success": True,
                        "message": "✅ Brevo API connected successfully!",
                        "details": {
                            "account_name": f"{account_info.get('firstName', 'Unknown')} {account_info.get('lastName', '')}",
                            "email_credits": account_info.get('plan', {}).get('creditsType', 'Unknown'),
                            "sender_email": getattr(Config, 'DEFAULT_SENDER_EMAIL', 'support@hogist.com'),
                            "sender_name": getattr(Config, 'DEFAULT_SENDER_NAME', 'HOGIST'),
                            "rate_limit": f"{getattr(Config, 'EMAIL_RATE_LIMIT', 10)} emails/minute",
                            "batch_size": f"{getattr(Config, 'EMAIL_BATCH_SIZE', 50)} emails/batch"
                        }
                    }
                else:
                    return {
                        "success": False,
                        "message": f"❌ Brevo API connection failed",
                        "details": f"HTTP {response.status_code}: {response.text}"
                    }
                    
            except Exception as brevo_error:
                return {
                    "success": False,
                    "message": f"❌ Brevo API error: {str(brevo_error)}",
                    "details": "Please check your BREVO_API_KEY configuration"
                }
        else:
            return {
                "success": False,
                "message": "❌ Brevo API not configured",
                "details": "Please set BREVO_API_KEY in your environment variables"
            }
            
    except Exception as e:
        return {
            "success": False,
            "message": f"❌ Brevo API test failed: {str(e)}",
            "details": "Please check your BREVO_API_KEY configuration"
        }

@app.post("/api/mailer/upload-csv")
async def upload_email_csv(file: UploadFile = File(...), session_id: str = Query(...)):
    """Upload CSV file and extract email addresses"""
    try:
        print(f"CSV Upload: Starting upload for session {session_id}")
        print(f"File details: {file.filename}, Size: {file.size}, Type: {file.content_type}")
        
        # Create a temporary session if one doesn't exist
        try:
            session = mongodb.get_session(session_id)
            if not session:
                print(f"CSV Upload: Session {session_id} not found, creating temporary session")
                # Create a temporary session record in memory
                session_email_storage[session_id] = {
                    'temp_session': True,
                    'created_at': datetime.now(timezone.utc).isoformat()
                }
                print(f"CSV Upload: Temporary session created for {session_id}")
        except Exception as session_error:
            print(f"CSV Upload: Session verification error: {str(session_error)}, creating temporary session")
            session_email_storage[session_id] = {
                'temp_session': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
        
        # Validate file
        if not file.filename or not file.filename.lower().endswith('.csv'):
            print(f"CSV Upload: Invalid file type {file.filename}")
            return {
                "success": False,
                "message": "Only CSV files are allowed",
                "details": "Please upload a file with .csv extension",
                "session_id": session_id,
                "email_count": 0
            }
        
        # Validate file size (5MB limit)
        if file.size and file.size > 5 * 1024 * 1024:
            print(f"CSV Upload: File too large {file.size} bytes")
            return {
                "success": False,
                "message": "File size must be less than 5MB",
                "details": f"Your file is {file.size / (1024*1024):.1f}MB. Please reduce the file size.",
                "session_id": session_id,
                "email_count": 0
            }
        
        # Read file content
        try:
            content = await file.read()
            content_str = content.decode('utf-8')
            print(f"CSV Upload: File content read, {len(content_str)} characters")
        except UnicodeDecodeError:
            try:
                # Try with different encoding
                content_str = content.decode('latin-1')
                print(f"CSV Upload: File content read with latin-1 encoding, {len(content_str)} characters")
            except Exception as decode_error:
                print(f"CSV Upload: Decode error {str(decode_error)}")
                return {
                    "success": False,
                    "message": "Failed to read CSV file",
                    "details": "The file encoding is not supported. Please save your CSV file with UTF-8 encoding.",
                    "session_id": session_id,
                    "email_count": 0
                }
        
        # Parse CSV with different encodings if needed
        try:
            csv_data = StringIO(content_str)
            reader = csv.DictReader(csv_data)
            rows = list(reader)
            print(f"CSV Upload: Parsed {len(rows)} rows")
        except Exception as parse_error:
            print(f"CSV Upload: Parse error {str(parse_error)}")
            return {
                "success": False,
                "message": "Failed to parse CSV file",
                "details": f"CSV parsing error: {str(parse_error)}. Please check your CSV format.",
                "session_id": session_id,
                "email_count": 0
            }
        
        if not rows:
            print("CSV Upload: No data rows found")
            return {
                "success": False,
                "message": "CSV file contains no data",
                "details": "The CSV file appears to be empty or contains only headers.",
                "session_id": session_id,
                "email_count": 0
            }
        
        # Extract emails from various column names
        email_columns = ['email', 'emails', 'email_address', 'e-mail', 'mail', 'Email', 'EMAIL', 'Email Address', 'email_addr']
        emails = []
        
        available_columns = list(rows[0].keys())
        print(f"CSV Upload: Available columns: {available_columns}")
        
        # Find email column
        email_column = None
        for col in email_columns:
            if col in rows[0]:
                email_column = col
                break
        
        if not email_column:
            print("CSV Upload: No email column found")
            return {
                "success": False,
                "message": "No email column found in CSV",
                "details": f"Available columns: {', '.join(available_columns)}. Please ensure your CSV has a column named 'email', 'emails', 'email_address', 'e-mail', or 'mail'.",
                "session_id": session_id,
                "email_count": 0,
                "available_columns": available_columns
            }
        
        print(f"CSV Upload: Using email column: {email_column}")
        
        # Extract and validate emails
        import re
        email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
        invalid_emails = []
        
        for i, row in enumerate(rows):
            email = row.get(email_column, '').strip()
            if email:
                if email_pattern.match(email):
                    emails.append(email)
                else:
                    invalid_emails.append(f"Row {i+2}: {email}")
        
        print(f"CSV Upload: Found {len(emails)} valid emails, {len(invalid_emails)} invalid")
        
        if not emails:
            print("CSV Upload: No valid emails found")
            return {
                "success": False,
                "message": "No valid email addresses found",
                "details": f"Found {len(invalid_emails)} invalid email addresses in column '{email_column}'. Please check the email format.",
                "session_id": session_id,
                "email_count": 0,
                "invalid_emails": invalid_emails[:5]  # Show first 5 invalid emails
            }
        
        # Remove duplicates while preserving order
        unique_emails = list(dict.fromkeys(emails))
        duplicates_removed = len(emails) - len(unique_emails)
        # Use Brevo-based email verification
        print(f"CSV Upload: Starting Brevo verification for {len(unique_emails)} emails...")
        
        try:
            verified_email_data = await verify_email_list(unique_emails, batch_size=10)
            
            # Process verification results
            valid_emails = []
            verification_results = {}
            
            for email_data in verified_email_data:
                email = email_data['email']
                verification_results[email] = email_data
                
                # Accept emails that pass Brevo validation
                if email_data['valid']:
                    valid_emails.append(email)
            
            print(f"CSV Upload: Brevo verification completed. {len(valid_emails)} emails passed verification")
            
        except Exception as verification_error:
            print(f"CSV Upload: Brevo verification failed: {str(verification_error)}")
            print("CSV Upload: Falling back to format validation only")
            
            # Fallback to basic format validation
            valid_emails = unique_emails
            verification_results = {}
            
            for email in unique_emails:
                verification_results[email] = {
                    'email': email,
                    'valid': True,
                    'verification_status': 'format_valid_only',
                    'format_valid': True,
                    'mx_found': None,
                    'smtp_check': None,
                    'disposable': None,
                    'free': None,
                    'score': 0.5,
                    'error_message': f'Brevo verification unavailable: {str(verification_error)}',
                    'verified_at': datetime.now(timezone.utc).isoformat()
                }
        
        # Store emails in session storage
        if session_id not in session_email_storage:
            session_email_storage[session_id] = {}
            
        session_email_storage[session_id]['emails'] = valid_emails  # Only store verified valid emails
        session_email_storage[session_id]['all_emails'] = unique_emails  # Store all emails for reporting
        session_email_storage[session_id]['verification_results'] = verification_results  # Store verification details
        session_email_storage[session_id]['uploaded_at'] = datetime.now(timezone.utc).isoformat()
        session_email_storage[session_id]['filename'] = file.filename
        session_email_storage[session_id]['email_column_used'] = email_column
        session_email_storage[session_id]['total_rows'] = len(rows)
        session_email_storage[session_id]['invalid_emails_count'] = len(invalid_emails)
        session_email_storage[session_id]['verified_valid_count'] = len(valid_emails)
        session_email_storage[session_id]['verified_invalid_count'] = len(unique_emails) - len(valid_emails)
        
        # Return comprehensive response
        response_data = {
            "success": True,
            "session_id": session_id,
            "email_count": len(valid_emails),  # Only count verified valid emails
            "preview_emails": valid_emails[:5],  # Show first 5 verified emails as preview
            "filename": file.filename,
            "message": f"✅ Successfully uploaded and verified {len(valid_emails)} email addresses!" if len(valid_emails) > 0 else f"⚠️ CSV uploaded but no emails passed verification. Found {len(unique_emails)} format-valid emails.",
            "details": f"Extracted emails from column '{email_column}' in {file.filename} and verified using Brevo API" if len(valid_emails) > 0 else f"Extracted {len(unique_emails)} emails from column '{email_column}' in {file.filename}. All emails failed verification - please check email quality.",
            "stats": {
                "total_rows": len(rows),
                "valid_emails": len(emails),
                "unique_emails": len(unique_emails),
                "duplicates_removed": duplicates_removed,
                "invalid_emails": len(invalid_emails),
                "email_column": email_column,
                "verified_valid": len(valid_emails),
                "verified_invalid": len(unique_emails) - len(valid_emails),
                "verification_complete": True
            },
            "verification_summary": {
                "total_verified": len(verification_results) if verification_results else len(unique_emails),
                "passed_verification": len(valid_emails),
                "failed_verification": len(unique_emails) - len(valid_emails),
                "verification_rate": round((len(valid_emails) / len(unique_emails) * 100), 2) if unique_emails else 0
            }
        }
        
        # Handle case where no emails pass verification
        if len(valid_emails) == 0:
            response_data["success"] = True  # Still success, but with warnings
            response_data["email_count"] = 0
            response_data["preview_emails"] = []
            
        # Add warnings for invalid emails and verification failures
        warnings = []
        if invalid_emails:
            warnings.append(f"Found {len(invalid_emails)} invalid email addresses (format issues)")
            response_data["invalid_sample"] = invalid_emails[:3]  # Show first 3 invalid emails
        
        failed_verification_count = len(unique_emails) - len(valid_emails)
        if failed_verification_count > 0:
            if len(valid_emails) == 0:
                warnings.append(f"All {failed_verification_count} emails failed verification. This may indicate verification service issues or poor email quality.")
            else:
                warnings.append(f"Found {failed_verification_count} emails that failed verification (disposable, no MX records, etc.)")
            
            # Show sample of failed verification emails
            failed_emails = [email for email in unique_emails if email not in valid_emails]
            response_data["verification_failed_sample"] = failed_emails[:3]
        
        if warnings:
            response_data["warning"] = ". ".join(warnings)
        
        print(f"CSV Upload: Success! {len(valid_emails)} verified emails stored for session {session_id}")
        return response_data
        
    except Exception as e:
        print(f"CSV Upload: Unexpected error {str(e)}")
        logger.error(f"Error uploading CSV: {e}", exc_info=True)
        return {
            "success": False,
            "message": "Unexpected error occurred",
            "details": f"Please try again. Error: {str(e)}",
            "session_id": session_id,
            "email_count": 0
        }

@app.get("/api/mailer/emails")
async def get_session_emails(session_id: str = Query(...)):
    """Get uploaded email addresses for a session"""
    try:
        if session_id not in session_email_storage:
            return {
                "success": False,
                "message": "No emails found for this session",
                "email_count": 0,
                "emails": []
            }
        
        session_data = session_email_storage[session_id]
        emails = session_data.get('emails', [])
        
        return {
            "success": True,
            "session_id": session_id,
            "email_count": len(emails),
            "emails": emails,
            "filename": session_data.get('filename', 'Unknown'),
            "uploaded_at": session_data.get('uploaded_at'),
            "stats": {
                "total_rows": session_data.get('total_rows', 0),
                "invalid_emails": session_data.get('invalid_emails_count', 0),
                "email_column": session_data.get('email_column_used', 'email')
            }
        }
    
    except Exception as e:
        logger.error(f"Error getting session emails: {e}")
        return {
            "success": False,
            "message": f"Error retrieving emails: {str(e)}",
            "email_count": 0,
            "emails": []
        }

@app.post("/api/mailer/generate-email")
async def generate_email_with_ai(request: EmailGenerateRequest, session_id: str = Query(...)):
    """Generate email content using AI"""
    try:
        # Check if Gemini API is configured
        if not hasattr(Config, 'GEMINI_API_KEY') or not Config.GEMINI_API_KEY:
            raise HTTPException(status_code=400, detail="AI service not configured")
        
        # Craft enhanced prompt for HOGIST
        enhanced_prompt = f"""
        Generate a professional email for HOGIST company with the following requirements:
        - Purpose: {request.purpose}
        - Tone: {request.tone}
        - User prompt: {request.prompt}
        - Custom instructions: {request.custom_instructions if request.custom_instructions else 'None'}
        
        Requirements:
        1. Subject line should be engaging and relevant
        2. Include HOGIST branding naturally
        3. Professional but {request.tone} tone
        4. Call-to-action: "Visit Our Website" linking to https://www.hogist.com/
        5. Include appropriate placeholders for images if requested: {request.include_images}
        6. Make it suitable for email marketing
        7. Keep it concise but compelling
        8. Include a professional signature
        
        Return the response in this JSON format:
        {{
            "subject": "Email subject line",
            "html_content": "Full HTML email content with proper styling",
            "text_content": "Plain text version of the email"
        }}
        """
        
        try:
            import google.generativeai as genai
            genai.configure(api_key=Config.GEMINI_API_KEY)
            
            model = genai.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(enhanced_prompt)
            
            # Parse the AI response
            import json
            import re
            
            # Extract JSON from response
            response_text = response.text
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            
            if json_match:
                ai_response = json.loads(json_match.group())
                subject = ai_response.get('subject', 'HOGIST Newsletter')
                html_content = ai_response.get('html_content', '')
                text_content = ai_response.get('text_content', '')
            else:
                # Fallback parsing
                subject = "HOGIST Newsletter"
                html_content = response_text
                text_content = response_text
            
            # Ensure proper HOGIST branding and CTA
            if "Visit Our Website" not in html_content:
                html_content += '''
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://www.hogist.com/" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Visit Our Website</a>
                </div>
                '''
            
            # Add image placeholders if requested
            if request.include_images:
                # Add a note about image upload capability instead of placeholder boxes
                image_note = ('<div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #007bff;">'
                             '<p style="margin: 0; color: #666; font-size: 14px;">'
                             '<strong>💡 Add Images:</strong> You can upload and position images in your email using the image upload feature.'
                             '</p>'
                             '</div>')
                html_content += image_note
            
            # Wrap in proper HTML structure if not already
            if '<html>' not in html_content.lower():
                html_content = f'''
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>{subject}</title>
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #007bff; margin: 0;">HOGIST</h1>
                    </div>
                    {html_content}
                    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
                        <p>Best regards,<br>The HOGIST Team</p>
                        <p>© 2024 HOGIST. All rights reserved.</p>
                    </div>
                </body>
                </html>
                '''
            
            return {
                "success": True,
                "subject": subject,
                "html_content": html_content,
                "text_content": text_content or f"Subject: {subject}\n\n{html_content}",
                "generated_at": datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as ai_error:
            logger.error(f"AI generation error: {ai_error}")
            # Fallback email template
            fallback_subject = f"HOGIST - {request.prompt[:50]}..."
            fallback_html = f'''
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>{fallback_subject}</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #007bff; margin: 0;">HOGIST</h1>
                </div>
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h2 style="color: #333; margin-top: 0;">Hello!</h2>
                    <p style="margin-bottom: 15px;">Thank you for your interest in HOGIST!</p>
                    <p style="margin-bottom: 15px;">{request.prompt}</p>
                    <p>We're excited to share more about our services and how we can help you achieve your goals.</p>
                </div>
                {('<div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #007bff;">'
                '<p style="margin: 0; color: #666; font-size: 14px;">'
                '<strong>💡 Add Images:</strong> You can upload and position images in your email using the image upload feature.'
                '</p>'
                '</div>') if request.include_images else ''}
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://www.hogist.com/" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Visit Our Website</a>
                </div>
                <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
                    <p>Best regards,<br>The HOGIST Team</p>
                    <p>© 2024 HOGIST. All rights reserved.</p>
                </div>
            </body>
            </html>
            '''
            
            return {
                "success": True,
                "subject": fallback_subject,
                "html_content": fallback_html,
                "text_content": f"Subject: {fallback_subject}\n\nHello!\n\nThank you for your interest in HOGIST!\n\n{request.prompt}\n\nWe're excited to share more about our services and how we can help you achieve your goals.\n\nVisit our website: https://www.hogist.com/\n\nBest regards,\nThe HOGIST Team",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "fallback": True,
                "warning": "AI generation failed, using fallback template"
            }
    
    except Exception as e:
        logger.error(f"Error generating email: {e}")
        raise HTTPException(status_code=500, detail=f"Email generation failed: {str(e)}")

@app.post("/api/mailer/upload-image")
async def upload_email_image(file: UploadFile = File(...), session_id: str = Query(...), position: str = Query(default="middle")):
    """Upload image for email template using Cloudinary for public accessibility"""
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith('image/'):
            return {
                "success": False,
                "message": "Only image files are allowed",
                "details": f"Received: {file.content_type}"
            }
        
        # Read image data
        image_data = await file.read()
        
        # Generate unique filename
        import time
        timestamp = str(int(time.time()))
        import hashlib
        file_hash = hashlib.md5(image_data).hexdigest()[:8]
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_filename = f"email_{timestamp}_{file_hash}.{file_extension}"
        
        # Save to uploads directory
        uploads_dir = "uploads"
        os.makedirs(uploads_dir, exist_ok=True)
        file_path = os.path.join(uploads_dir, unique_filename)
        
        with open(file_path, "wb") as f:
            f.write(image_data)
        
        # Use localhost URL for development
        public_url = f"/uploads/{unique_filename}"
        
        # Store in session
        if session_id not in session_email_storage:
            session_email_storage[session_id] = {}
        
        if 'images' not in session_email_storage[session_id]:
            session_email_storage[session_id]['images'] = []
        
        image_info = {
            "filename": file.filename,
            "content_type": file.content_type,
            "public_url": public_url,
            "position": position,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "size": len(image_data)
        }
        
        session_email_storage[session_id]['images'].append(image_info)
        
        return {
            "success": True,
            "message": f"Image '{file.filename}' uploaded successfully",
            "image_info": {
                "filename": file.filename,
                "public_url": public_url,
                "position": position,
                "size": len(image_data),
                "uploaded_at": image_info["uploaded_at"]
            }
        }
        
    except Exception as e:
        logger.error(f"Error uploading image: {e}")
        return {
            "success": False,
            "message": f"Image upload failed: {str(e)}"
        }

@app.get("/api/mailer/images")
async def get_session_images(session_id: str = Query(...)):
    """Get uploaded images for a session"""
    try:
        if session_id not in session_email_storage:
            return {
                "success": True,
                "images": [],
                "count": 0
            }
        
        # Get both regular and hosted images
        images = session_email_storage[session_id].get('images', [])
        hosted_images = session_email_storage[session_id].get('hosted_images', [])
        
        # Return image info without base64 data for listing
        image_list = []
        
        # Process regular images
        for img in images:
            image_list.append({
                "filename": img["filename"],
                "position": img["position"],
                "size": img["size"],
                "uploaded_at": img["uploaded_at"],
                "content_type": img["content_type"]
            })
        
        # Process hosted images
        for img in hosted_images:
            image_list.append({
                "filename": img["filename"],
                "position": img["position"],
                "size": img["size"],
                "uploaded_at": img["uploaded_at"],
                "content_type": img["content_type"],
                "public_url": img["public_url"]
            })
        
        return {
            "success": True,
            "images": image_list,
            "count": len(image_list)
        }
    
    except Exception as e:
        logger.error(f"Error getting images: {e}")
        return {
            "success": False,
            "message": f"Error retrieving images: {str(e)}",
            "images": [],
            "count": 0
        }

@app.post("/api/mailer/send-test")
async def send_test_email(
    request: EmailSendRequest,
    session_id: str = Query(...)
):
    """Send a test email to verify configuration"""
    try:
        if not request.test_email:
            raise HTTPException(status_code=400, detail="Test email address is required")
        
        # Get session images if any (check both 'images' and 'hosted_images' for compatibility)
        images = []
        if session_id in session_email_storage:
            # Get both legacy 'images' and new 'hosted_images'
            legacy_images = session_email_storage[session_id].get('images', [])
            hosted_images = session_email_storage[session_id].get('hosted_images', [])
            
            # Combine both, prioritizing hosted_images
            images = hosted_images + legacy_images
            
            # Convert hosted_images format to expected format for processing
            processed_images = []
            for img in images:
                if 'public_url' in img:  # This is a hosted image
                    processed_images.append({
                        'position': img.get('position', 'middle'),
                        'url': img['public_url'],
                        'filename': img.get('filename', ''),
                        'type': 'hosted'
                    })
                elif 'url' in img:  # This is a legacy image
                    processed_images.append(img)
            
            images = processed_images
            
            logger.info(f"Found {len(images)} images for test email session {session_id}: {[img.get('position', 'unknown') for img in images]}")
        
        # Send email using Brevo API
        result = await send_email_brevo_api(
            recipient=request.test_email,
            subject=request.subject,
            html_content=request.html_content,
            text_content=request.text_content,
            sender_name=request.sender_name,
            sender_email=request.sender_email,
            images=images,
            session_id=session_id
        )
        
        if result["success"]:
            return {
                "success": True,
                "message": f"✅ Test email sent successfully to {request.test_email}!",
                "details": result.get("message", "Email sent via Brevo API")
            }
        else:
            return {
                "success": False,
                "message": f"❌ Failed to send test email: {result.get('message', 'Unknown error')}",
                "details": result.get("details", "Please check your configuration")
            }
    
    except Exception as e:
        logger.error(f"Error sending test email: {e}")
        return {
            "success": False,
            "message": f"❌ Failed to send test email: {str(e)}",
            "details": "Please check your email configuration and try again"
        }

@app.post("/api/mailer/send-campaign")
async def send_email_campaign(
    request: EmailSendRequest,
    session_id: str = Query(...)
):
    """Send email campaign to all uploaded recipients"""
    try:
        # Get recipient list from session
        if session_id not in session_email_storage:
            raise HTTPException(status_code=400, detail="No email list found. Please upload a CSV file first.")
        
        recipients = session_email_storage[session_id].get('emails', [])
        if not recipients:
            raise HTTPException(status_code=400, detail="No email addresses found in session")
        
        # Get session images if any (check both 'images' and 'hosted_images' for compatibility)
        images = []
        if session_id in session_email_storage:
            # Get both legacy 'images' and new 'hosted_images'
            legacy_images = session_email_storage[session_id].get('images', [])
            hosted_images = session_email_storage[session_id].get('hosted_images', [])
            
            # Combine both, prioritizing hosted_images
            images = hosted_images + legacy_images
            
            # Convert hosted_images format to expected format for processing
            processed_images = []
            for img in images:
                if 'public_url' in img:  # This is a hosted image
                    processed_images.append({
                        'position': img.get('position', 'middle'),
                        'url': img['public_url'],
                        'filename': img.get('filename', ''),
                        'type': 'hosted'
                    })
                elif 'url' in img:  # This is a legacy image
                    processed_images.append(img)
            
            images = processed_images
            
            logger.info(f"Found {len(images)} images for campaign session {session_id}: {[img.get('position', 'unknown') for img in images]}")
        
        # Send bulk emails
        results = await send_bulk_emails(
            recipients=recipients,
            subject=request.subject,
            html_content=request.html_content,
            text_content=request.text_content,
            sender_name=request.sender_name,
            sender_email=request.sender_email,
            images=images,
            session_id=session_id
        )
        
        # Calculate success rate
        total = results["sent"] + results["failed"]
        success_rate = (results["sent"] / total * 100) if total > 0 else 0
        
        # Generate campaign report with verification data
        campaign_reports = []
        current_time = datetime.now(timezone.utc).isoformat()
        verification_results = session_email_storage[session_id].get('verification_results', {})
        
        # Process sent emails
        for email in results["success_emails"]:
            verification_data = verification_results.get(email, {})
            campaign_reports.append({
                "recipient_email": email,
                "recipient_name": extract_name_from_email(email),
                "status": "sent",
                "sent_at": current_time,
                "error_message": None,
                "subject": request.subject,
                "sender_name": request.sender_name,
                "sender_email": request.sender_email,
                "verification_status": verification_data.get('verification_status'),
                "format_valid": verification_data.get('format_valid'),
                "mx_found": verification_data.get('mx_found'),
                "smtp_check": verification_data.get('smtp_check'),
                "disposable": verification_data.get('disposable'),
                "free": verification_data.get('free'),
                "verification_score": verification_data.get('score'),
                "verified_at": verification_data.get('verified_at')
            })
        
        # Process failed emails
        for i, email in enumerate(results["failed_emails"]):
            error_msg = results["errors"][i] if i < len(results["errors"]) else "Unknown error"
            verification_data = verification_results.get(email, {})
            campaign_reports.append({
                "recipient_email": email,
                "recipient_name": extract_name_from_email(email),
                "status": "failed",
                "sent_at": None,
                "error_message": str(error_msg),
                "subject": request.subject,
                "sender_name": request.sender_name,
                "sender_email": request.sender_email,
                "verification_status": verification_data.get('verification_status'),
                "format_valid": verification_data.get('format_valid'),
                "mx_found": verification_data.get('mx_found'),
                "smtp_check": verification_data.get('smtp_check'),
                "disposable": verification_data.get('disposable'),
                "free": verification_data.get('free'),
                "verification_score": verification_data.get('score'),
                "verified_at": verification_data.get('verified_at')
            })
        
        # Store campaign report in session
        if 'campaign_reports' not in session_email_storage[session_id]:
            session_email_storage[session_id]['campaign_reports'] = []
        
        session_email_storage[session_id]['campaign_reports'].extend(campaign_reports)

        return {
            "success": True,
            "message": f"✅ Campaign completed! Sent {results['sent']}/{total} emails ({success_rate:.1f}% success rate)",
            "campaign_results": {
                "total_recipients": total,
                "sent": results["sent"],
                "failed": results["failed"],
                "success_rate": round(success_rate, 1),
                "success_emails": results["success_emails"],
                "failed_emails": results["failed_emails"],
                "errors": results["errors"][:10]  # Limit error details
            },
            "report_available": True,
            "total_reports": len(campaign_reports)
        }
    
    except Exception as e:
        logger.error(f"Error sending campaign: {e}")
        return {
            "success": False,
            "message": f"❌ Campaign failed: {str(e)}",
            "details": "Please check your configuration and try again"
        }

@app.get("/api/mailer/status")
async def get_mailer_status(session_id: str = Query(...)):
    """Get current mailer session status"""
    try:
        session_data = session_email_storage.get(session_id, {})
        
        return {
            "session_id": session_id,
            "has_emails": bool(session_data.get('emails')),
            "email_count": len(session_data.get('emails', [])),
            "has_images": bool(session_data.get('images')),
            "image_count": len(session_data.get('images', [])),
            "filename": session_data.get('filename'),
            "uploaded_at": session_data.get('uploaded_at'),
            "brevo_configured": hasattr(Config, 'BREVO_API_KEY') and bool(Config.BREVO_API_KEY)
        }
    
    except Exception as e:
        logger.error(f"Error getting mailer status: {e}")
        return {
            "session_id": session_id,
            "has_emails": False,
            "email_count": 0,
            "has_images": False,
            "image_count": 0,
            "error": str(e)
        }

@app.delete("/api/mailer/clear-session")
async def clear_session_data(session_id: str = Query(...)):
    """Clear all session data"""
    try:
        if session_id in session_email_storage:
            del session_email_storage[session_id]
        
        return {
            "success": True,
            "message": "Session data cleared successfully"
        }
    
    except Exception as e:
        logger.error(f"Error clearing session: {e}")
        return {
            "success": False,
            "message": f"Error clearing session: {str(e)}"
        }

# Email utility functions
def clean_placeholder_texts(content: str) -> str:
    """Remove placeholder texts from content"""
    import re
    
    # Find all image sections with actual images
    image_sections = {}
    for section in ['top', 'middle', 'bottom']:
        pattern = f'<div[^>]*id="{section}ImageSection"[^>]*>\\s*<img[^>]*src="([^"]*)"[^>]*>.*?</div>'
        match = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
        if match:
            image_sections[section] = match.group(0)
    
    # Create a copy of the content to work with
    clean_content = content
    
    # Remove placeholder texts and divs
    patterns = [
        # Remove placeholder text markers
        r'\[IMAGE_SECTION_(?:TOP|MIDDLE|BOTTOM)\]',
        # Remove placeholder divs with background color
        r'<div[^>]*style="[^"]*background-color:\s*#f8f9fa[^>]*>.*?(?:Add|Click).*?(?:Image|image).*?</div>',
        # Remove empty image sections without actual images
        r'<div[^>]*id="(?:top|middle|bottom)ImageSection"[^>]*>(?!\s*<img)[^<]*</div>',
        # Remove specific placeholder texts
        r'(?:📸|🖼️|🎨)?\s*Click\s+"Add\s+Image"\s+and\s+select\s+"(?:Top|Middle|Bottom)"\s+to\s+place\s+an\s+image\s+here',
        r'Add\s+(?:Top|Middle|Bottom)\s+Image',
        r'(?:Header|Content|Footer)\s+Image',
        r'Click\s+to\s+(?:add|change)\s+(?:your\s+)?(?:header|main\s+content|footer)?\s*image',
        # Remove image section markers
        r'\[IMAGE_SECTION_TOP\]',
        r'\[IMAGE_SECTION_MIDDLE\]',
        r'\[IMAGE_SECTION_BOTTOM\]'
    ]
    
    # Apply all patterns
    for pattern in patterns:
        clean_content = re.sub(pattern, '', clean_content, flags=re.IGNORECASE | re.DOTALL)
    
    # Remove any empty divs that might be left
    clean_content = re.sub(r'<div[^>]*>\s*</div>', '', clean_content, flags=re.IGNORECASE | re.DOTALL)
    
    # Remove multiple newlines and whitespace
    clean_content = re.sub(r'\n\s*\n', '\n', clean_content)
    clean_content = re.sub(r'^\s+|\s+$', '', clean_content)
    
    return clean_content

def process_html_content_with_images(html_content: str, images: List[dict] = None) -> str:
    """Process HTML content and replace image placeholders with actual images"""
    import re
    
    if not images:
        # If no images, remove all image section markers and placeholders
        patterns = [
            r'\[IMAGE_SECTION_(?:TOP|MIDDLE|BOTTOM|FLYER)\]',
            r'<div[^>]*id="(?:top|middle|bottom|flyer)ImageSection"[^>]*>.*?</div>',
            r'<div[^>]*id="flyerSection"[^>]*>.*?</div>',
            r'<div[^>]*style="[^"]*background-color:\s*#f8f9fa[^>]*>.*?(?:Add|Click).*?(?:Image|image).*?</div>'
        ]
        processed_content = html_content
        for pattern in patterns:
            processed_content = re.sub(pattern, '', processed_content, flags=re.IGNORECASE | re.DOTALL)
        return processed_content
        
    processed_content = html_content
    logger.info(f"Processing HTML with {len(images)} images: {[img.get('position', 'unknown') for img in images]}")
    
    # Process each image
    for img in images:
        if 'url' not in img or 'position' not in img:
            logger.warning(f"Skipping invalid image: {img}")
            continue
            
        position = img['position'].lower()
        url = img['url']
        
        # Create email-safe image HTML based on position
        if position == 'flyer':
            # Special handling for flyer images - use table-based structure
            img_html = f'''
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="min-height: 800px;">
              <tr>
                <td align="center" valign="middle" style="padding: 0;">
                  <img 
                    src="{url}" 
                    alt="Flyer image" 
                    style="display: block; max-width: 100%; height: auto; border: none; outline: none;"
                    width="100%"
                  />
                </td>
              </tr>
            </table>
            '''
            
            # Replace flyer section
            flyer_patterns = [
                r'<div[^>]*id="flyerSection"[^>]*>.*?</div>',
                r'\[IMAGE_SECTION_FLYER\]'
            ]
            
            for pattern in flyer_patterns:
                if re.search(pattern, processed_content, re.IGNORECASE | re.DOTALL):
                    processed_content = re.sub(
                        pattern,
                        f'<div id="flyerSection" style="background-color: white; border: none; min-height: 800px;">{img_html}</div>',
                        processed_content,
                        flags=re.IGNORECASE | re.DOTALL
                    )
                    logger.info(f"✅ Replaced flyer section with image: {url}")
                    break
        else:
            # Regular image sections (top, middle, bottom) - use table-based structure
            img_html = f'''
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0;">
              <tr>
                <td align="center" style="padding: 0;">
                  <img 
                    src="{url}" 
                    alt="{position} image" 
                    style="display: block; max-width: 100%; height: auto; border: none; outline: none;"
                    width="100%"
                  />
                </td>
              </tr>
            </table>
            '''
            
            # Different patterns we need to replace for regular sections
        patterns = [
            # Replace placeholder markers
            fr'\[IMAGE_SECTION_{position.upper()}\]',
                # Replace sections with existing images
                fr'<div[^>]*id="{position}ImageSection"[^>]*>.*?</div>',
            # Replace sections with placeholder text
            fr'<div[^>]*id="{position}ImageSection"[^>]*>.*?(?:Add|Click).*?(?:Image|image).*?</div>'
        ]
        
        # Apply each pattern
        for pattern in patterns:
            if re.search(pattern, processed_content, re.IGNORECASE | re.DOTALL):
                processed_content = re.sub(
                    pattern,
                        f'<div id="{position}ImageSection" style="margin: 20px 0; text-align: center;">{img_html}</div>',
                    processed_content,
                    flags=re.IGNORECASE | re.DOTALL
                )
                logger.info(f"✅ Replaced {position} section with image: {url}")
                break  # Break after first successful replacement for this position
    
    return processed_content

async def send_email_brevo_api(
    recipient: str,
    subject: str,
    html_content: str,
    text_content: str = None,
    sender_name: str = None,
    sender_email: str = None,
    images: List[dict] = None,
    session_id: str = None
):
    """Send email using Brevo API"""
    try:
        # Use default values from config if not provided
        sender_name = sender_name or getattr(Config, 'DEFAULT_SENDER_NAME', 'HOGIST')
        sender_email = sender_email or getattr(Config, 'DEFAULT_SENDER_EMAIL', 'support@hogist.com')
        
        # Check if Brevo API key is configured
        if not hasattr(Config, 'BREVO_API_KEY') or not Config.BREVO_API_KEY:
            raise Exception("Brevo API key not configured. Please set BREVO_API_KEY in environment variables.")
        
        # First clean the HTML content of all placeholders
        clean_html = clean_placeholder_texts(html_content)
        
        # Then process the cleaned HTML to embed images
        processed_html = process_html_content_with_images(clean_html, images)
        
        # Prepare email data for Brevo API
        email_data = {
            "sender": {
                "name": sender_name,
                "email": sender_email
            },
            "to": [
                {
                    "email": recipient
                }
            ],
            "subject": subject,
            "htmlContent": processed_html
        }
        
        # Add text content if provided
        if text_content:
            # Also clean the text content
            clean_text = clean_placeholder_texts(text_content)
            email_data["textContent"] = clean_text

        # Add attachments if any
        if session_id and session_id in session_email_storage:
            attachments = session_email_storage[session_id].get('attachments', [])
            if attachments:
                email_data["attachment"] = []
                for attachment in attachments:
                    with open(os.path.join("uploads", attachment["unique_filename"]), "rb") as f:
                        content = f.read()
                        email_data["attachment"].append({
                            "name": attachment["filename"],
                            "content": base64.b64encode(content).decode('utf-8')
                        })
        
        # Set up headers for Brevo API
        headers = {
            'accept': 'application/json',
            'api-key': Config.BREVO_API_KEY,
            'content-type': 'application/json'
        }
        
        # Send email via Brevo API
        brevo_url = getattr(Config, 'BREVO_API_URL', 'https://api.brevo.com/v3/smtp/email')
        response = requests.post(
            brevo_url,
            headers=headers,
            data=json.dumps(email_data)
        )
        
        if response.status_code == 201:
            logger.info(f"Email sent successfully via Brevo API to {recipient}")
            return {"success": True, "message": f"Email sent to {recipient} via Brevo API"}
        else:
            error_msg = f"Brevo API error: {response.status_code} - {response.text}"
            logger.error(error_msg)
            return {"success": False, "error": "brevo_api", "message": error_msg}
            
    except Exception as e:
        error_msg = f"Failed to send email via Brevo API: {str(e)}"
        logger.error(error_msg)
        return {"success": False, "error": "general", "message": error_msg}

async def send_bulk_emails(
    recipients: List[str],
    subject: str,
    html_content: str,
    text_content: str = None,
    sender_name: str = None,
    sender_email: str = None,
    images: List[dict] = None,
    batch_size: int = None,
    session_id: str = None
):
    """Send emails to multiple recipients with rate limiting"""
    
    # Use configured batch size or default
    batch_size = batch_size or getattr(Config, 'EMAIL_BATCH_SIZE', 50)
    rate_limit = getattr(Config, 'EMAIL_RATE_LIMIT', 10)  # emails per minute
    
    results = {
        "sent": 0,
        "failed": 0,
        "errors": [],
        "success_emails": [],
        "failed_emails": []
    }
    
    # Process emails in batches
    for i in range(0, len(recipients), batch_size):
        batch = recipients[i:i + batch_size]
        batch_results = []
        
        # Send emails in current batch
        for recipient in batch:
            try:
                result = await send_email_brevo_api(
                    recipient=recipient,
                    subject=subject,
                    html_content=html_content,
                    text_content=text_content,
                    sender_name=sender_name,
                    sender_email=sender_email,
                    images=images,
                    session_id=session_id
                )
                
                if result["success"]:
                    results["sent"] += 1
                    results["success_emails"].append(recipient)
                else:
                    results["failed"] += 1
                    results["failed_emails"].append(recipient)
                    results["errors"].append(f"{recipient}: {result['message']}")
                
                batch_results.append(result)
                
                # Rate limiting - wait between emails
                if len(batch) > 1:
                    await asyncio.sleep(60 / rate_limit)  # Respect rate limit
                    
            except Exception as e:
                results["failed"] += 1
                results["failed_emails"].append(recipient)
                results["errors"].append(f"{recipient}: {str(e)}")
                logger.error(f"Error sending to {recipient}: {str(e)}")
        
        # Wait between batches
        if i + batch_size < len(recipients):
            logger.info(f"Completed batch {i//batch_size + 1}, waiting before next batch...")
            await asyncio.sleep(2)  # 2 second pause between batches
    
    return results

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

@app.get("/api/mailer/debug-config")
async def debug_email_config():
    """Debug email configuration"""
    try:
        config_info = {
            "brevo_api_configured": hasattr(Config, 'BREVO_API_KEY') and bool(Config.BREVO_API_KEY),
            "brevo_api_url": getattr(Config, 'BREVO_API_URL', 'https://api.brevo.com/v3/smtp/email'),
            "default_sender_name": getattr(Config, 'DEFAULT_SENDER_NAME', 'HOGIST'),
            "default_sender_email": getattr(Config, 'DEFAULT_SENDER_EMAIL', 'support@hogist.com'),
            "brevo_api_key_length": len(Config.BREVO_API_KEY) if hasattr(Config, 'BREVO_API_KEY') and Config.BREVO_API_KEY else 0
        }
        
        # Test Brevo API connection
        if config_info["brevo_api_configured"]:
            headers = {
                'accept': 'application/json',
                'api-key': Config.BREVO_API_KEY,
                'content-type': 'application/json'
            }
            
            # Test API connection with account info
            try:
                response = requests.get('https://api.brevo.com/v3/account', headers=headers)
                if response.status_code == 200:
                    account_data = response.json()
                    config_info["brevo_account"] = {
                        "email": account_data.get("email", "Unknown"),
                        "plan": account_data.get("plan", [{}])[0].get("type", "Unknown") if account_data.get("plan") else "Unknown",
                        "credits": account_data.get("plan", [{}])[0].get("creditsLeft", "Unknown") if account_data.get("plan") else "Unknown"
                    }
                else:
                    config_info["brevo_account"] = f"API Error: {response.status_code}"
            except Exception as e:
                config_info["brevo_account"] = f"Connection Error: {str(e)}"
        
        return config_info
        
    except Exception as e:
        return {"error": f"Debug failed: {str(e)}"}

@app.get("/api/mailer/debug-brevo-logs")
async def debug_brevo_logs(limit: int = Query(default=10)):
    """Debug endpoint to check Brevo transactional logs with detailed error information"""
    try:
        print(f"Debug: Testing Brevo transactional logs API...")
        
        # Check if API key is configured
        if not hasattr(Config, 'BREVO_API_KEY') or not Config.BREVO_API_KEY:
            return {
                "success": False,
                "message": "Brevo API key not configured",
                "details": "BREVO_API_KEY environment variable is missing"
            }
        
        # Test API key first
        headers = {
            "accept": "application/json",
            "api-key": Config.BREVO_API_KEY
        }
        
        # Test account endpoint first
        print("Debug: Testing account endpoint...")
        account_response = requests.get("https://api.brevo.com/v3/account", headers=headers, timeout=10)
        print(f"Debug: Account API response: {account_response.status_code}")
        
        if account_response.status_code != 200:
            return {
                "success": False,
                "message": f"Brevo API key invalid or account error: {account_response.status_code}",
                "details": account_response.text,
                "api_key_prefix": Config.BREVO_API_KEY[:10] + "..." if len(Config.BREVO_API_KEY) > 10 else "too_short"
            }
        
        # Now test transactional logs
        print("Debug: Testing transactional logs endpoint...")
        params = {
            "limit": limit,
            "offset": 0
        }
        
        logs_response = requests.get(
            "https://api.brevo.com/v3/smtp/emails", 
            headers=headers, 
            params=params,
            timeout=10
        )
        
        print(f"Debug: Logs API response: {logs_response.status_code}")
        print(f"Debug: Logs API response text: {logs_response.text[:500]}...")
        
        if logs_response.status_code == 200:
            logs_data = logs_response.json()
            return {
                "success": True,
                "message": f"Brevo transactional logs API working",
                "logs_found": len(logs_data.get('logs', [])),
                "total_count": logs_data.get('count', 0),
                "api_response": logs_data,
                "account_info": account_response.json() if account_response.status_code == 200 else None
            }
        else:
            return {
                "success": False,
                "message": f"Brevo transactional logs API error: {logs_response.status_code}",
                "details": logs_response.text,
                "account_working": account_response.status_code == 200
            }
            
    except Exception as e:
        print(f"Debug: Exception in debug endpoint: {e}")
        return {
            "success": False,
            "message": f"Debug endpoint error: {str(e)}",
            "details": "Check server logs for more information"
        }

@app.post("/api/mailer/test-with-verified-sender")
async def test_with_verified_sender(test_email: str, verified_sender: str = None):
    """Test email with a verified sender address"""
    try:
        if not verified_sender:
            # Try to get verified sender from environment or use a common one
            verified_sender = getattr(Config, 'VERIFIED_SENDER_EMAIL', None)
            if not verified_sender:
                return {
                    "success": False,
                    "message": "Please provide a verified sender email address",
                    "instructions": "Use an email that's verified in your Brevo account"
                }
        
        # Simple test email
        test_subject = "HOGIST Email Test - Verified Sender"
        test_html = '''
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Email Test</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #007bff;">HOGIST Email Test</h1>
            <p>This is a test email to verify email delivery.</p>
            <p><strong>Sender:</strong> {}</p>
            <p><strong>Time:</strong> {}</p>
            <p>If you receive this email, your email system is working correctly!</p>
        </body>
        </html>
        '''.format(verified_sender, datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC'))
        
        # Send test email
        result = await send_email_brevo_api(
            recipient=test_email,
            subject=test_subject,
            html_content=test_html,
            sender_name="HOGIST Test",
            sender_email=verified_sender,
            images=None
        )
        
        return {
            "success": result["success"],
            "message": result["message"],
            "sender_used": verified_sender,
            "recipient": test_email,
            "instructions": "Check your inbox, spam folder, and all email tabs"
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"Test failed: {str(e)}"
        }

@app.post("/api/mailer/upload-image-hosted")
async def upload_email_image_hosted(file: UploadFile = File(...), session_id: str = Query(...), position: str = Query(default="middle")):
    """Upload image and create a publicly accessible URL using Cloudinary"""
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith('image/'):
            return {
                "success": False,
                "message": "Only image files are allowed",
                "details": f"Received: {file.content_type}"
            }
        
        # Read image data
        image_data = await file.read()
        
        # Create a unique filename
        import hashlib
        import time
        timestamp = str(int(time.time()))
        file_hash = hashlib.md5(image_data).hexdigest()[:8]
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_filename = f"email_{timestamp}_{file_hash}.{file_extension}"
        
        # Upload to Cloudinary
        try:
            import cloudinary
            import cloudinary.uploader
            
            # Upload to Cloudinary
            upload_result = cloudinary.uploader.upload(
                image_data,
                public_id=f"email_images/{unique_filename}",
                folder="email_images",
                resource_type="image",
                overwrite=True
            )
            
            # Get the secure URL from Cloudinary
            public_url = upload_result['secure_url']
            
            # Store in session with URL
            if session_id not in session_email_storage:
                session_email_storage[session_id] = {}
            
            if 'hosted_images' not in session_email_storage[session_id]:
                session_email_storage[session_id]['hosted_images'] = []
            
            image_info = {
                "filename": file.filename,
                "unique_filename": unique_filename,
                "content_type": file.content_type,
                "public_url": public_url,
                "position": position.lower(),  # Ensure position is lowercase
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "size": len(image_data),
                "cloudinary_public_id": upload_result['public_id']
            }
            
            session_email_storage[session_id]['hosted_images'].append(image_info)
            
            logger.info(f"Image uploaded successfully: {file.filename} -> {public_url} (position: {position})")
            
            return {
                "success": True,
                "message": f"Image '{file.filename}' uploaded and hosted successfully",
                "image_info": {
                    "filename": file.filename,
                    "public_url": public_url,
                    "position": position.lower(),  # Ensure position is lowercase in response
                    "size": len(image_data),
                    "uploaded_at": image_info["uploaded_at"]
                }
            }
            
        except Exception as cloud_error:
            logger.error(f"Cloudinary upload error: {cloud_error}")
            return {
                "success": False,
                "message": f"Failed to upload to Cloudinary: {str(cloud_error)}"
            }
        
    except Exception as e:
        logger.error(f"Error uploading hosted image: {e}")
        return {
            "success": False,
            "message": f"Image upload failed: {str(e)}"
        }

@app.get("/uploads/{filename}")
async def serve_uploaded_file(filename: str):
    """Serve uploaded files"""
    try:
        file_path = os.path.join("uploads", filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")
        
        # Get file mime type
        import mimetypes
        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type:
            mime_type = 'application/octet-stream'
        
        return FileResponse(
            file_path,
            media_type=mime_type,
            filename=filename
        )
    except Exception as e:
        logger.error(f"Error serving file {filename}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def process_html_content_with_hosted_images(html_content: str, images: List[dict] = None):
    """Process HTML content with hosted image URLs instead of base64"""
    import re
    
    # Define placeholder patterns
    placeholder_patterns = [
        r'<div[^>]*style="[^"]*text-align:\s*center[^"]*"[^>]*>\s*📸[^<]*<\/div>',
        r'<div[^>]*style="[^"]*text-align:\s*center[^"]*"[^>]*>\s*🖼️[^<]*<\/div>',
        r'<div[^>]*style="[^"]*text-align:\s*center[^"]*"[^>]*>\s*🎨[^<]*<\/div>',
        r'<div[^>]*>\s*📸[^<]*<\/div>',
        r'<div[^>]*>\s*🖼️[^<]*<\/div>',
        r'<div[^>]*>\s*🎨[^<]*<\/div>',
        r'📸\s*Click[^<]*"Top"[^<]*here',
        r'🖼️\s*Click[^<]*"Middle"[^<]*here',
        r'🎨\s*Click[^<]*"Bottom"[^<]*here'
    ]
    
    placeholder_texts = [
        "📸 Click \"Add Image\" and select \"Top\" to place an image here",
        "🖼️ Click \"Add Image\" and select \"Middle\" to place an image here",
        "🎨 Click \"Add Image\" and select \"Bottom\" to place an image here"
    ]
    
    if not images:
        # Remove all placeholder patterns if no images
        processed_html = html_content
        for pattern in placeholder_patterns:
            processed_html = re.sub(pattern, "", processed_html, flags=re.IGNORECASE | re.DOTALL)
        for placeholder in placeholder_texts:
            processed_html = processed_html.replace(placeholder, "")
        processed_html = re.sub(r'\n\s*\n\s*\n', '\n\n', processed_html)
        return processed_html
    
    # Process hosted images
    processed_html = html_content
    
    # Group images by position
    images_by_position = {'top': [], 'middle': [], 'bottom': []}
    for img in images:
        position = img.get('position', 'middle').lower()
        if position not in images_by_position:
            position = 'middle'
        images_by_position[position].append(img)
    
    # First, try to replace existing placeholders
    placeholder_replaced = False
    for i, img in enumerate(images):
        try:
            public_url = img.get('public_url', '')
            if not public_url:
                continue
                
            position = img.get('position', 'middle').lower()
            if position == 'top':
                placeholder = "📸 Click \"Add Image\" and select \"Top\" to place an image here"
            elif position == 'middle':
                placeholder = "🖼️ Click \"Add Image\" and select \"Middle\" to place an image here"
            else:  # bottom
                placeholder = "🎨 Click \"Add Image\" and select \"Bottom\" to place an image here"
            
            # Create image tag with hosted URL
            img_tag = f'<div style="text-align: center; margin: 20px 0;"><img src="{public_url}" alt="Email Image" style="max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0; display: block;"></div>'
            
            # Replace placeholder
            if placeholder in processed_html:
                processed_html = processed_html.replace(placeholder, img_tag)
                placeholder_replaced = True
            else:
                # Try pattern matching
                for pattern in placeholder_patterns:
                    if (position == 'top' and '📸' in pattern) or \
                       (position == 'middle' and '🖼️' in pattern) or \
                       (position == 'bottom' and '🎨' in pattern):
                        if re.search(pattern, processed_html, flags=re.IGNORECASE | re.DOTALL):
                            processed_html = re.sub(pattern, img_tag, processed_html, flags=re.IGNORECASE | re.DOTALL)
                            placeholder_replaced = True
                            break
            
        except Exception as img_error:
            logger.warning(f"Failed to process hosted image {i}: {str(img_error)}")
    
    # If no placeholders found, intelligently insert images
    if not placeholder_replaced and images:
        body_match = re.search(r'<body[^>]*>(.*?)</body>', processed_html, re.DOTALL | re.IGNORECASE)
        if body_match:
            body_content = body_match.group(1)
            
            # Insert images based on position
            for position, imgs in images_by_position.items():
                for img in imgs:
                    try:
                        public_url = img.get('public_url', '')
                        if not public_url:
                            continue
                            
                        img_tag = f'<div style="text-align: center; margin: 20px 0;"><img src="{public_url}" alt="Email Image" style="max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0; display: block;"></div>'
                        
                        if position == 'top':
                            # Insert after first heading
                            header_pattern = r'(<h[1-6][^>]*>.*?</h[1-6]>|<div[^>]*>.*?</div>)'
                            if re.search(header_pattern, body_content, re.DOTALL | re.IGNORECASE):
                                body_content = re.sub(header_pattern, r'\1' + img_tag, body_content, count=1, flags=re.DOTALL | re.IGNORECASE)
                            else:
                                body_content = img_tag + body_content
                        elif position == 'middle':
                            # Insert in middle of content
                            paragraphs = re.findall(r'<p[^>]*>.*?</p>', body_content, re.DOTALL | re.IGNORECASE)
                            if len(paragraphs) > 1:
                                middle_p = len(paragraphs) // 2
                                target_p = paragraphs[middle_p]
                                body_content = body_content.replace(target_p, target_p + img_tag, 1)
                            else:
                                p_pattern = r'(<p[^>]*>.*?</p>|<div[^>]*>.*?</div>)'
                                body_content = re.sub(p_pattern, r'\1' + img_tag, body_content, count=1, flags=re.DOTALL | re.IGNORECASE)
                        else:  # bottom
                            # Insert before footer
                            footer_patterns = [
                                r'(<div[^>]*style="[^"]*border-top[^"]*"[^>]*>.*?</div>)',
                                r'(<p[^>]*>.*?Best regards.*?</p>)',
                                r'(<p[^>]*>.*?©.*?</p>)',
                                r'(<div[^>]*>.*?Visit Our Website.*?</div>)'
                            ]
                            
                            inserted = False
                            for pattern in footer_patterns:
                                if re.search(pattern, body_content, re.DOTALL | re.IGNORECASE):
                                    body_content = re.sub(pattern, img_tag + r'\1', body_content, count=1, flags=re.DOTALL | re.IGNORECASE)
                                    inserted = True
                                    break
                            
                            if not inserted:
                                body_content = body_content + img_tag
                                
                    except Exception as e:
                        logger.warning(f"Failed to insert hosted image: {e}")
            
            processed_html = processed_html.replace(body_match.group(1), body_content)
    
    # Remove remaining placeholders
    for pattern in placeholder_patterns:
        processed_html = re.sub(pattern, "", processed_html, flags=re.IGNORECASE | re.DOTALL)
    for placeholder in placeholder_texts:
        processed_html = processed_html.replace(placeholder, "")
    processed_html = re.sub(r'\n\s*\n\s*\n', '\n\n', processed_html)
    
    return processed_html

# Mount static files directory
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Add this new model after the existing models
class CampaignReport(BaseModel):
    recipient_email: str
    recipient_name: Optional[str] = None
    status: str  # "sent", "failed", "pending"
    sent_at: Optional[str] = None
    error_message: Optional[str] = None
    subject: str
    sender_name: str
    sender_email: str
    # Email verification fields
    verification_status: Optional[str] = None
    format_valid: Optional[bool] = None
    mx_found: Optional[bool] = None
    smtp_check: Optional[bool] = None
    disposable: Optional[bool] = None
    free: Optional[bool] = None
    verification_score: Optional[float] = None
    verified_at: Optional[str] = None

# Helper function to extract name from email
def extract_name_from_email(email: str) -> str:
    """Extract name from email address"""
    try:
        # Get the part before @
        local_part = email.split('@')[0]
        # Replace dots and underscores with spaces
        name = local_part.replace('.', ' ').replace('_', ' ')
        # Capitalize each word
        return ' '.join(word.capitalize() for word in name.split())
    except:
        return email.split('@')[0] if '@' in email else email

@app.get("/api/mailer/download-simple-csv")
async def download_simple_csv(session_id: str = Query(...)):
    """Download uploaded emails as simple CSV file - direct file approach"""
    try:
        if session_id not in session_email_storage:
            raise HTTPException(status_code=404, detail="No email data found for this session")
        
        # Get all emails from the session
        emails = session_email_storage[session_id].get('emails', [])
        filename = session_email_storage[session_id].get('filename', 'unknown.csv')
        
        if not emails:
            raise HTTPException(status_code=404, detail="No emails found. Please upload a CSV file first.")
        
        # Generate timestamp for filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        csv_filename = f"emails_{timestamp}.csv"
        csv_filepath = f"uploads/{csv_filename}"
        
        # Create uploads directory if it doesn't exist
        import os
        os.makedirs("uploads", exist_ok=True)
        
        # Create CSV content manually and write to file
        with open(csv_filepath, 'w', newline='', encoding='utf-8') as csvfile:
            # Write header
            csvfile.write("email_address,name,source_file,total_emails\n")
            
            # Write email data
            for i, email in enumerate(emails, 1):
                name = extract_name_from_email(email)
                # Escape any commas in the data
                clean_email = email.replace('"', '""')
                clean_name = name.replace('"', '""')
                clean_filename = filename.replace('"', '""')
                
                csvfile.write(f'"{clean_email}","{clean_name}","{clean_filename}","{len(emails)}"\n')
        
        # Serve the file
        from fastapi.responses import FileResponse
        response = FileResponse(
            path=csv_filepath,
            filename=csv_filename,
            media_type="text/csv"
        )
        
        # Clean up the file after sending (optional)
        # Note: In production, you might want to keep files for a while or use a cleanup task
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating simple CSV: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating simple CSV: {str(e)}")

@app.get("/api/mailer/check-brevo-logs")
async def check_brevo_logs(session_id: str = Query(...), limit: int = Query(default=50)):
    """
    Check Brevo email logs to see delivery status of sent emails
    Uses Brevo's Transactional Email API as requested
    """
    try:
        # Get the Brevo logs
        logs_data = await get_brevo_email_logs(limit=limit)
        
        if not logs_data.get('logs'):
            return {
                "success": False,
                "message": "No email logs found in Brevo",
                "logs": [],
                "count": 0
            }
        
        # Process logs for better readability
        processed_logs = []
        for log in logs_data.get('logs', []):
            processed_log = {
                'message_id': log.get('messageId', ''),
                'subject': log.get('subject', ''),
                'recipient': log.get('to', [{}])[0].get('email', '') if log.get('to') else '',
                'status': log.get('status', 'unknown'),
                'date': log.get('date', ''),
                'sender': log.get('from', {}),
                'tags': log.get('tags', []),
                'opens': log.get('opens', 0),
                'clicks': log.get('clicks', 0)
            }
            processed_logs.append(processed_log)
        
        return {
            "success": True,
            "message": f"Retrieved {len(processed_logs)} email logs from Brevo",
            "logs": processed_logs,
            "count": len(processed_logs),
            "total_count": logs_data.get('count', 0)
        }
        
    except Exception as e:
        print(f"Error checking Brevo logs: {e}")
        return {
            "success": False,
            "message": f"Error checking Brevo logs: {str(e)}",
            "logs": [],
            "count": 0
        }

@app.get("/api/mailer/verify-with-brevo")
async def verify_emails_with_brevo(session_id: str = Query(...)):
    """
    Verify session emails using Brevo-based validation (replaces MailboxLayer)
    """
    try:
        if session_id not in session_email_storage:
            return {
                "success": False,
                "message": "No emails found for this session",
                "verification_results": []
            }
        
        session_data = session_email_storage[session_id]
        emails = session_data.get('all_emails', [])
        
        if not emails:
            return {
                "success": False,
                "message": "No emails to verify",
                "verification_results": []
            }
        
        print(f"Verifying {len(emails)} emails using Brevo validation...")
        
        # Use the Brevo verification function
        verification_results = await verify_email_list(emails, batch_size=10)
        
        # Update session storage with new verification results
        session_email_storage[session_id]['verification_results'] = {
            result['email']: result for result in verification_results
        }
        
        # Count valid emails
        valid_count = sum(1 for result in verification_results if result.get('valid', False))
        
        return {
            "success": True,
            "message": f"Verified {len(emails)} emails using Brevo validation. {valid_count} passed verification.",
            "verification_results": verification_results,
            "summary": {
                "total_verified": len(verification_results),
                "passed_verification": valid_count,
                "failed_verification": len(verification_results) - valid_count,
                "verification_rate": round((valid_count / len(verification_results) * 100), 2) if verification_results else 0
            }
        }
        
    except Exception as e:
        print(f"Error verifying emails with Brevo: {e}")
        return {
            "success": False,
            "message": f"Error verifying emails: {str(e)}",
            "verification_results": []
        }

@app.get("/api/mailer/brevo-delivery-status")
async def check_brevo_delivery_status(email: str = Query(...)):
    """
    Check delivery status of a specific email using Brevo logs
    """
    try:
        delivery_status = await check_email_delivery_status(email)
        
        return {
            "success": True,
            "email": email,
            "delivery_data": delivery_status
        }
        
    except Exception as e:
        return {
            "success": False,
            "email": email,
            "error": str(e)
        }

@app.get("/api/mailer/report-summary")
async def get_campaign_report_summary(session_id: str = Query(...)):
    """Get summary statistics for campaign reports"""
    try:
        if session_id not in session_email_storage:
            return {
                "success": False,
                "message": "No campaign data found for this session",
                "total_emails": 0,
                "sent_count": 0,
                "failed_count": 0,
                "success_rate": 0,
                "last_campaign": None
            }
        
        # Get campaign reports from session
        campaign_reports = session_email_storage[session_id].get('campaign_reports', [])
        
        if not campaign_reports:
            return {
                "success": False,
                "message": "No campaigns have been sent yet",
                "total_emails": 0,
                "sent_count": 0,
                "failed_count": 0,
                "success_rate": 0,
                "last_campaign": None
            }
        
        # Calculate summary statistics
        total_emails = len(campaign_reports)
        sent_count = len([r for r in campaign_reports if r.get('status') == 'sent'])
        failed_count = len([r for r in campaign_reports if r.get('status') == 'failed'])
        success_rate = round((sent_count / total_emails * 100), 2) if total_emails > 0 else 0
        
        # Get last campaign info
        last_campaign = None
        if campaign_reports:
            # Sort by sent_at to get the most recent (handle None values safely)
            sorted_reports = sorted(
                campaign_reports, 
                key=lambda x: x.get('sent_at') or '', 
                reverse=True
            )
            if sorted_reports:
                last_report = sorted_reports[0]
                last_campaign = {
                    "subject": last_report.get('subject', 'Unknown'),
                    "sender_name": last_report.get('sender_name', 'Unknown'),
                    "sent_at": last_report.get('sent_at', ''),
                    "status": last_report.get('status', 'unknown')
                }
        
        return {
            "success": True,
            "message": f"Found {total_emails} campaign records",
            "total_emails": total_emails,
            "sent_count": sent_count,
            "failed_count": failed_count,
            "success_rate": success_rate,
            "last_campaign": last_campaign
        }
        
    except Exception as e:
        logger.error(f"Error getting campaign report summary: {e}")
        return {
            "success": False,
            "message": f"Error loading report summary: {str(e)}",
            "total_emails": 0,
            "sent_count": 0,
            "failed_count": 0,
            "success_rate": 0,
            "last_campaign": None
        }

@app.post("/api/mailer/upload-attachment")
async def upload_email_attachment(file: UploadFile = File(...), session_id: str = Query(...)):
    """Upload attachment for email"""
    try:
        # Validate file type
        allowed_types = {
            # PDF
            'application/pdf': ['.pdf'],
            
            # Word documents
            'application/msword': ['.doc'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            
            # Excel spreadsheets
            'application/vnd.ms-excel': ['.xls'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            
            # Text files
            'text/plain': ['.txt'],
            
            # Archives
            'application/zip': ['.zip'],
            'application/x-zip-compressed': ['.zip'],
            'application/x-rar-compressed': ['.rar'],
            'application/octet-stream': ['.rar', '.zip']  # Some browsers send this for binary files
        }
        
        # Get file extension
        file_ext = os.path.splitext(file.filename)[1].lower() if '.' in file.filename else ''
        
        # Check if either content type is allowed or file extension matches an allowed type
        is_allowed = False
        for mime_type, extensions in allowed_types.items():
            if file.content_type == mime_type or file_ext in extensions:
                is_allowed = True
                break
                
        if not is_allowed:
            return {
                "success": False,
                "message": "File type not allowed",
                "details": f"Received: {file.content_type}"
            }
        
        # Read file data
        file_data = await file.read()
        
        # Validate file size (10MB limit)
        if len(file_data) > 10 * 1024 * 1024:
            return {
                "success": False,
                "message": "File too large",
                "details": "Maximum file size is 10MB"
            }
        
        # Create a unique filename
        import hashlib
        import time
        timestamp = str(int(time.time()))
        file_hash = hashlib.md5(file_data).hexdigest()[:8]
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
        unique_filename = f"attachment_{timestamp}_{file_hash}.{file_extension}"
        
        # Save to uploads directory
        uploads_dir = "uploads"
        os.makedirs(uploads_dir, exist_ok=True)
        file_path = os.path.join(uploads_dir, unique_filename)
        
        with open(file_path, "wb") as f:
            f.write(file_data)
        
        # Create public URL
        file_url = f"/uploads/{unique_filename}"
        
        # Store in session
        if session_id not in session_email_storage:
            session_email_storage[session_id] = {}
        
        if 'attachments' not in session_email_storage[session_id]:
            session_email_storage[session_id]['attachments'] = []
        
        attachment_info = {
            "filename": file.filename,
            "unique_filename": unique_filename,
            "content_type": file.content_type,
            "file_url": file_url,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "size": len(file_data)
        }
        
        session_email_storage[session_id]['attachments'].append(attachment_info)
        
        return {
            "success": True,
            "message": f"File '{file.filename}' uploaded successfully",
            "file_url": file_url
        }
        
    except Exception as e:
        logger.error(f"Error uploading attachment: {e}")
        return {
            "success": False,
            "message": f"File upload failed: {str(e)}"
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
