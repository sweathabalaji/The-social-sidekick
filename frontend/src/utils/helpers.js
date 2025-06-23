import moment from 'moment';

// Date formatting utilities
export const formatDate = (date, format = 'YYYY-MM-DD') => {
  return moment(date).format(format);
};

export const formatDateTime = (date) => {
  return moment(date).format('YYYY-MM-DD HH:mm');
};

export const formatRelativeTime = (date) => {
  return moment(date).fromNow();
};

export const isValidDate = (date) => {
  return moment(date).isValid();
};

// Number formatting utility
export const formatNumber = (number) => {
  if (isNaN(number)) return '0';
  return Number(number).toLocaleString();
};

// Text utilities
export const truncateText = (text, maxLength = 100) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

export const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const slugify = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\w ]+/g, '')
    .replace(/ +/g, '-');
};

// Platform utilities
export const getPlatformIcon = (platform) => {
  const icons = {
    instagram: '📷',
    facebook: '📘',
    twitter: '🐦',
    linkedin: '💼',
  };
  return icons[platform.toLowerCase()] || '📱';
};

export const getPlatformColor = (platform) => {
  const colors = {
    instagram: '#E4405F',
    facebook: '#1877F2',
    twitter: '#1DA1F2',
    linkedin: '#0077B5',
  };
  return colors[platform.toLowerCase()] || '#6B7280';
};

// Validation utilities
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateURL = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const validatePhoneNumber = (phone) => {
  const phoneRegex = /^\+?[\d\s-()]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

// File utilities
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getFileExtension = (filename) => {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
};

export const isImageFile = (filename) => {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
  const extension = getFileExtension(filename).toLowerCase();
  return imageExtensions.includes(extension);
};

export const isVideoFile = (filename) => {
  const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'];
  const extension = getFileExtension(filename).toLowerCase();
  return videoExtensions.includes(extension);
};

// Array utilities
export const chunk = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const unique = (array) => {
  return [...new Set(array)];
};

export const sortBy = (array, key, order = 'asc') => {
  return array.sort((a, b) => {
    const aVal = typeof key === 'function' ? key(a) : a[key];
    const bVal = typeof key === 'function' ? key(b) : b[key];
    
    if (order === 'desc') {
      return bVal > aVal ? 1 : -1;
    }
    return aVal > bVal ? 1 : -1;
  });
};

// Local storage utilities
export const setLocalStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
};

export const getLocalStorage = (key, defaultValue = null) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return defaultValue;
  }
};

export const removeLocalStorage = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Error removing from localStorage:', error);
  }
};

// Error handling utilities
export const handleApiError = (error) => {
  if (error.response) {
    return error.response.data.message || 'Server error occurred';
  } else if (error.request) {
    return 'Network error - please check your connection';
  } else {
    return error.message || 'An unexpected error occurred';
  }
};

// Social media utilities
export const extractHashtags = (text) => {
  const hashtags = text.match(/#\w+/g);
  return hashtags ? hashtags.map(tag => tag.substring(1)) : [];
};

export const extractMentions = (text) => {
  const mentions = text.match(/@\w+/g);
  return mentions ? mentions.map(mention => mention.substring(1)) : [];
};

export const generateHashtags = (category) => {
  const hashtagGroups = {
    lifestyle: ['#lifestyle', '#daily', '#inspiration', '#motivation'],
    business: ['#business', '#entrepreneur', '#success', '#marketing'],
    technology: ['#tech', '#innovation', '#digital', '#future'],
    food: ['#food', '#foodie', '#delicious', '#cooking'],
    travel: ['#travel', '#wanderlust', '#adventure', '#explore'],
  };
  
  return hashtagGroups[category.toLowerCase()] || ['#social', '#media', '#content'];
};

// --- Export all as default object to fix eslint "no-anonymous-default-export"
const helpers = {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  isValidDate,
  formatNumber, // ✅ added here
  truncateText,
  capitalizeFirst,
  slugify,
  getPlatformIcon,
  getPlatformColor,
  validateEmail,
  validateURL,
  validatePhoneNumber,
  formatFileSize,
  getFileExtension,
  isImageFile,
  isVideoFile,
  chunk,
  unique,
  sortBy,
  setLocalStorage,
  getLocalStorage,
  removeLocalStorage,
  handleApiError,
  extractHashtags,
  extractMentions,
  generateHashtags,
};

export default helpers;
