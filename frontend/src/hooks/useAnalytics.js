import { useState, useEffect } from 'react';
import apiClient from '../api';

// Helper function to parse ISO dates with various timezone formats
const parseDate = (dateString) => {
  if (!dateString) return null;
  
  try {
    // Handle both +0000 and Z timezone formats
    const normalizedDateString = dateString.replace(/\+0000$/, 'Z');
    return new Date(normalizedDateString);
  } catch (error) {
    console.error('Error parsing date:', error, dateString);
    return null;
  }
};

// Process data from the API to handle ISO date formats
const processAnalyticsData = (data) => {
  if (!data) return data;
  
  // Process dates in the data
  if (data.timestamp) {
    data.timestamp = parseDate(data.timestamp);
  }
  
  // Handle nested objects with dates
  if (data.data && typeof data.data === 'object') {
    Object.keys(data.data).forEach(key => {
      const platform = data.data[key];
      
      // Process follower trend dates
      if (platform.follower_trend && Array.isArray(platform.follower_trend.dates)) {
        platform.follower_trend.dates = platform.follower_trend.dates.map(parseDate);
      }
      
      // Process post dates in media insights
      if (platform.media_insights && Array.isArray(platform.media_insights)) {
        platform.media_insights.forEach(post => {
          if (post.timestamp) {
            post.timestamp = parseDate(post.timestamp);
          }
        });
      }
    });
  }
  
  return data;
};

export const useAnalytics = () => {
  const [analytics, setAnalytics] = useState({
    overview: null,
    instagramEngagement: null,
    facebookEngagement: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverviewMetrics = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Fetching overview metrics...');
      const response = await apiClient.getAnalytics();
      console.log('Overview response:', response);
      
      const processedData = processAnalyticsData(response);
      
      setAnalytics(prev => ({
        ...prev,
        overview: processedData.data || {}, 
      }));
    } catch (err) {
      console.error('Failed to fetch overview metrics:', err);
      setError(err.message || 'Failed to fetch overview metrics');
    } finally {
      setLoading(false);
    }
  };

  const fetchInstagramEngagement = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Fetching Instagram engagement...');
      const response = await apiClient.getEngagementStats('instagram');
      console.log('Instagram engagement response:', response);
      
      const processedData = processAnalyticsData(response);
      
      setAnalytics(prev => ({
        ...prev,
        instagramEngagement: processedData.data?.instagram || {}, 
      }));
    } catch (err) {
      console.error('Failed to fetch Instagram engagement:', err);
      setError(err.message || 'Failed to fetch Instagram engagement');
    } finally {
      setLoading(false);
    }
  };

  const fetchFacebookEngagement = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Fetching Facebook engagement...');
      const response = await apiClient.getEngagementStats('facebook');
      console.log('Facebook engagement response:', response);
      
      const processedData = processAnalyticsData(response);
      
      setAnalytics(prev => ({
        ...prev,
        facebookEngagement: processedData.data?.facebook || {}, 
      }));
    } catch (err) {
      console.error('Failed to fetch Facebook engagement:', err);
      setError(err.message || 'Failed to fetch Facebook engagement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewMetrics();
    fetchInstagramEngagement();
    fetchFacebookEngagement();
  }, []);

  return {
    analytics,
    loading,
    error,
    fetchOverviewMetrics,
    fetchInstagramEngagement,
    fetchFacebookEngagement,
  };
};
