// API Endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    VERIFY: '/auth/verify',
  },
  POSTS: {
    BASE: '/posts',
    SCHEDULE: '/posts/schedule',
    SCHEDULED: '/posts/scheduled',
  },
  MEDIA: {
    UPLOAD: '/media/upload',
    CAPTION: '/media/caption',
  },
  ANALYTICS: {
    INSTAGRAM: '/analytics/instagram',
    FACEBOOK: '/analytics/facebook',
    OVERVIEW: '/analytics/overview',
  },
  CALENDAR: {
    BASE: '/calendar',
    GENERATE: '/calendar/generate',
    EXPORT: '/calendar/export',
  },
};

// Platform Constants
export const PLATFORMS = {
  INSTAGRAM: 'instagram',
  FACEBOOK: 'facebook',
  BOTH: 'both',
};

// Media Types
export const MEDIA_TYPES = {
  IMAGE: 'image',
  CAROUSEL: 'carousel',
  REEL: 'reel',
  VIDEO: 'video',
};

// Post Status
export const POST_STATUS = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  PUBLISHED: 'published',
  FAILED: 'failed',
  PROCESSING: 'processing',
};

// File Upload Constants
export const FILE_UPLOAD = {
  MAX_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_IMAGES: ['image/jpeg', 'image/png', 'image/gif'],
  ALLOWED_VIDEOS: ['video/mp4', 'video/mov', 'video/avi'],
  MAX_CAROUSEL_ITEMS: 20,
  MIN_CAROUSEL_ITEMS: 2,
};

// Chart Colors
export const CHART_COLORS = {
  PRIMARY: '#667eea',
  SECONDARY: '#764ba2',
  SUCCESS: '#28a745',
  WARNING: '#ffc107',
  DANGER: '#dc3545',
  INFO: '#17a2b8',
  LIGHT: '#f8f9fa',
  DARK: '#343a40',
};

// Time Formats
export const DATE_FORMATS = {
  DISPLAY: 'MMM dd, yyyy',
  API: 'yyyy-MM-dd',
  TIME: 'HH:mm',
  DATETIME: 'MMM dd, yyyy HH:mm',
};

// Validation Rules
export const VALIDATION = {
  CAPTION_MAX_LENGTH: 2200,
  HASHTAG_MAX_COUNT: 30,
  USERNAME_MIN_LENGTH: 3,
  PASSWORD_MIN_LENGTH: 8,
};

// Social Media Limits
export const SOCIAL_LIMITS = {
  INSTAGRAM: {
    CAPTION_LENGTH: 2200,
    HASHTAGS: 30,
    MENTIONS: 20,
    STORIES_PER_DAY: 100,
  },
  FACEBOOK: {
    POST_LENGTH: 63206,
    LINK_DESCRIPTION: 30,
  },
};

// Analytics Periods
export const ANALYTICS_PERIODS = {
  LAST_7_DAYS: '7d',
  LAST_30_DAYS: '30d',
  LAST_90_DAYS: '90d',
  LAST_YEAR: '1y',
};

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  FILE_TOO_LARGE: 'File size is too large.',
  INVALID_FILE_TYPE: 'Invalid file type.',
};

// Success Messages
export const SUCCESS_MESSAGES = {
  POST_SCHEDULED: 'Post scheduled successfully!',
  POST_PUBLISHED: 'Post published successfully!',
  POST_UPDATED: 'Post updated successfully!',
  POST_DELETED: 'Post deleted successfully!',
  SETTINGS_SAVED: 'Settings saved successfully!',
};

export const API_BASE_URL = 'http://localhost:8000';