/**
 * Utility functions for handling date formatting and parsing
 */
import moment from 'moment-timezone';

/**
 * Parse ISO date string with support for various timezone formats
 * Specifically handles the format issue: '2025-06-14T01:30:09+0000'
 * 
 * @param {string} dateString - ISO date string
 * @returns {Date|null} - Parsed date or null if invalid
 */
export const parseISODate = (dateString) => {
  if (!dateString) return null;
  
  try {
    // Handle +0000 timezone format (convert to Z format)
    const normalizedDateString = dateString.replace(/\+0000$/, 'Z');
    return new Date(normalizedDateString);
  } catch (error) {
    console.error('Error parsing ISO date:', error, dateString);
    return null;
  }
};

/**
 * Format a date string to local date and time
 * 
 * @param {string} dateString - ISO date string 
 * @param {object} options - Formatting options (Intl.DateTimeFormat options)
 * @returns {string} - Formatted date string
 */
export const formatLocalDateTime = (dateString, options = {}) => {
  if (!dateString) return 'N/A';
  
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options
  };
  
  try {
    const date = parseISODate(dateString);
    if (!date) return 'Invalid Date';
    return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
  } catch (error) {
    console.error('Error formatting date:', error, dateString);
    return dateString; // Return original string if parsing fails
  }
};

/**
 * Format a date to ISO string compatible with the backend
 * 
 * @param {Date} date - Date object
 * @returns {string} - ISO date string
 */
export const formatToISO = (date) => {
  if (!date) return null;
  
  try {
    return date.toISOString();
  } catch (error) {
    console.error('Error formatting to ISO:', error);
    return null;
  }
};

/**
 * Convert date to IST timezone and format as ISO string
 * 
 * @param {Date} date - Date object
 * @returns {string} - ISO date string in IST timezone
 */
export const formatToISTISO = (date) => {
  if (!date) return null;
  
  try {
    return moment(date).tz('Asia/Kolkata').format();
  } catch (error) {
    console.error('Error formatting to IST ISO:', error);
    return null;
  }
};

/**
 * Get current IST time
 * 
 * @returns {moment.Moment} - Current time in IST
 */
export const getCurrentIST = () => {
  return moment().tz('Asia/Kolkata');
};

/**
 * Convert date to IST and format for display
 * 
 * @param {Date|string} date - Date to format
 * @param {string} format - Format string (default: 'YYYY-MM-DD HH:mm:ss')
 * @returns {string} - Formatted date string in IST
 */
export const formatToIST = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (!date) return 'N/A';
  
  try {
    return moment(date).tz('Asia/Kolkata').format(format);
  } catch (error) {
    console.error('Error formatting to IST:', error);
    return 'Invalid Date';
  }
};

/**
 * Check if a date is in the future (IST timezone)
 * 
 * @param {Date|string} date - Date to check
 * @param {number} marginMinutes - Minutes of margin to consider (default: 0)
 * @returns {boolean} - True if date is in the future
 */
export const isFutureDateIST = (date, marginMinutes = 0) => {
  if (!date) return false;
  
  try {
    const dateIST = moment(date).tz('Asia/Kolkata');
    const nowIST = moment().tz('Asia/Kolkata').subtract(marginMinutes, 'minutes');
    
    return dateIST.isAfter(nowIST);
  } catch (error) {
    console.error('Error checking future date in IST:', error);
    return false;
  }
};

/**
 * Determine if a date is in the future
 * 
 * @param {string|Date} date - Date to check
 * @param {number} marginMinutes - Minutes of margin to consider (default: 0)
 * @returns {boolean} - True if date is in the future
 */
export const isFutureDate = (date, marginMinutes = 0) => {
  if (!date) return false;
  
  try {
    const dateObj = date instanceof Date ? date : parseISODate(date);
    if (!dateObj) return false;
    
    const now = new Date();
    // Add margin minutes to now
    now.setMinutes(now.getMinutes() - marginMinutes);
    
    return dateObj > now;
  } catch (error) {
    console.error('Error checking future date:', error);
    return false;
  }
}; 