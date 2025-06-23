import React, { useState, useEffect, useCallback } from 'react';
import { ClockIcon, CheckCircleIcon, XCircleIcon, PlayIcon } from '@heroicons/react/24/outline';
import apiClient from '../api';
import toast from 'react-hot-toast';
import moment from 'moment-timezone';

const ScheduledPosts = () => {
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    try {
      console.log('Fetching scheduled posts...');
      const response = await apiClient.getPosts();
      console.log('Posts response:', response);
      
      // Handle different response formats
      let rawPosts = [];
      if (Array.isArray(response)) {
        rawPosts = response;
      } else if (response && Array.isArray(response.posts)) {
        rawPosts = response.posts;
      }
      
      console.log('Raw posts before grouping:', rawPosts.length);
      
      // Group and structure posts properly
      const structuredPosts = groupAndStructurePosts(rawPosts);
      console.log('Structured posts after grouping:', structuredPosts.length);
      
      // Log any posts with Both platforms to debug
      structuredPosts.forEach(post => {
        if (post.platforms === 'Both') {
          console.log('Both platform post:', {
            id: post.id,
            platforms: post.platforms,
            subPostsCount: post.subPosts.length,
            subPosts: post.subPosts.map(sp => ({ platform: sp.platform, status: sp.status }))
          });
      }
      });
      
      setPosts(structuredPosts);
      
    } catch (error) {
      console.error('Error loading posts:', error);
      toast.error('Failed to load scheduled posts');
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
    // Removed auto-refresh - posts will only reload when user manually refreshes
    // const interval = setInterval(loadPosts, 30000);
    // return () => clearInterval(interval);
  }, [loadPosts]);

  // Group posts by scheduled_time and original platform selection
  const groupAndStructurePosts = (rawPosts) => {
    const grouped = {};
    
    rawPosts.forEach(post => {
      // Create a unique key for grouping posts that were scheduled together
      const timeKey = post.scheduled_time;
      const captionKey = post.caption?.substring(0, 50) || '';
      const groupKey = `${timeKey}_${captionKey}`;
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          id: groupKey,
          scheduled_time: post.scheduled_time,
          caption: post.caption,
          media_urls: post.media_urls,
          media_type: post.media_type,
          platforms: post.platforms, // "Both", "Instagram", or "Facebook"
          created_at: post.created_at,
          subPosts: []
        };
      }
      
      // Determine platform for this specific post
      const platformName = post.is_facebook ? 'Facebook' : 'Instagram';
      
      // Check if this platform is already added to avoid duplicates
      const existingSubPost = grouped[groupKey].subPosts.find(sp => sp.platform === platformName);
      
      if (!existingSubPost) {
        // Add individual platform post to the group only if not already present
        grouped[groupKey].subPosts.push({
          id: post.id,
          platform: platformName,
          status: post.status,
          posting_attempt_at: post.posting_attempt_at,
          error_message: post.error_message
        });
      } else {
        // Update existing subPost with latest information if this post is newer
        const currentPostTime = new Date(post.created_at || post.scheduled_time);
        const existingPostTime = new Date(existingSubPost.created_at || existingSubPost.scheduled_time || 0);
        
        if (currentPostTime > existingPostTime) {
          existingSubPost.id = post.id;
          existingSubPost.status = post.status;
          existingSubPost.posting_attempt_at = post.posting_attempt_at;
          existingSubPost.error_message = post.error_message;
        }
      }
    });
    
    // Convert to array and calculate overall status
    return Object.values(grouped).map(group => {
      // Calculate overall status for the group
      const subStatuses = group.subPosts.map(sp => sp.status);
      let overallStatus = 'scheduled';
      
      if (group.platforms === 'Both') {
        const postedCount = subStatuses.filter(s => s === 'posted').length;
        const failedCount = subStatuses.filter(s => s === 'failed').length;
        const inProgressCount = subStatuses.filter(s => s === 'posting_in_progress').length;
        
        if (postedCount === 2) {
          overallStatus = 'posted'; // Both platforms posted
        } else if (failedCount > 0) {
          overallStatus = 'partial_failed'; // Some failed
        } else if (postedCount > 0) {
          overallStatus = 'partial_posted'; // Some posted
        } else if (inProgressCount > 0) {
          overallStatus = 'posting_in_progress';
        }
      } else {
        // Single platform - use its status
        overallStatus = subStatuses[0] || 'scheduled';
      }
      
      return {
        ...group,
        overallStatus,
        // Get the latest attempt time
        latest_attempt: group.subPosts.reduce((latest, sp) => {
          if (!sp.posting_attempt_at) return latest;
          if (!latest) return sp.posting_attempt_at;
          return moment(sp.posting_attempt_at).isAfter(moment(latest)) ? sp.posting_attempt_at : latest;
        }, null)
      };
    }).sort((a, b) => moment(b.created_at).diff(moment(a.created_at)));
  };

  // Format time properly in IST
  const formatTimeIST = (utcTimeString) => {
    if (!utcTimeString) return 'N/A';
    
    try {
      // Parse UTC time and convert to IST
      const utcMoment = moment.utc(utcTimeString);
      const istMoment = utcMoment.tz('Asia/Kolkata');
      return istMoment.format('MMM DD, YYYY, h:mm A') + ' IST';
    } catch (error) {
      console.error('Error formatting time:', error, utcTimeString);
      return 'Invalid Date';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'scheduled':
        return <ClockIcon className="h-5 w-5 text-blue-500" />;
      case 'posted':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'partial_posted':
        return <CheckCircleIcon className="h-5 w-5 text-yellow-500" />;
      case 'failed':
      case 'partial_failed':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'posting_in_progress':
        return <PlayIcon className="h-5 w-5 text-blue-500 animate-pulse" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'posted':
        return 'bg-green-100 text-green-800';
      case 'partial_posted':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
      case 'partial_failed':
        return 'bg-red-100 text-red-800';
      case 'posting_in_progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status, platforms) => {
    switch (status) {
      case 'scheduled':
        return 'SCHEDULED';
      case 'posted':
        return 'POSTED';
      case 'partial_posted':
        return platforms === 'Both' ? 'PARTIALLY POSTED' : 'POSTED';
      case 'failed':
        return 'FAILED';
      case 'partial_failed':
        return 'PARTIALLY FAILED';
      case 'posting_in_progress':
        return 'POSTING...';
      default:
        return 'SCHEDULED';
    }
  };

  const filteredPosts = posts.filter(post => {
    const platformMatch = filterPlatform === 'All' || post.platforms === filterPlatform || 
                          (filterPlatform === 'Instagram' && post.platforms === 'Both') ||
                          (filterPlatform === 'Facebook' && post.platforms === 'Both');
    const statusMatch = filterStatus === 'All' || post.overallStatus === filterStatus;
    return platformMatch && statusMatch;
  });

  return (
    <div className="space-y-6">
      <style>
        {`
          .scheduled-posts-custom-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            margin-bottom: 2rem !important;
            padding: 20px 0 !important;
            text-align: left !important;
          }
          .scheduled-posts-custom-header-content {
            display: flex !important;
            flex-direction: column !important;
          }
          .scheduled-posts-custom-title {
            font-size: 2.8rem !important;
            font-weight: 700 !important;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            -webkit-background-clip: text !important;
            background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            margin: 0 0 12px 0 !important;
            line-height: 1.3 !important;
            letter-spacing: -0.02em !important;
          }
          .scheduled-posts-custom-subtitle {
            color: #64748b !important;
            font-size: 1.1rem !important;
            margin: 0 !important;
            line-height: 1.5 !important;
          }
        `}
      </style>
      {/* Header with current time display */}
      <div className="scheduled-posts-custom-header">
        <div className="scheduled-posts-custom-header-content">
          <h1 className="scheduled-posts-custom-title">Scheduled Posts</h1>
          <p className="scheduled-posts-custom-subtitle">
            🕒 Current IST Time: {moment().tz('Asia/Kolkata').format('dddd, MMMM Do YYYY, h:mm:ss A')}
          </p>
        </div>
        <button
          onClick={loadPosts}
          className="btn-secondary"
          disabled={isLoading}
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex space-x-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Platform
            </label>
            <select
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
              className="input-field"
            >
              <option value="All">All Platforms</option>
              <option value="Instagram">Instagram</option>
              <option value="Facebook">Facebook</option>
              <option value="Both">Both</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field"
            >
              <option value="All">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="posting_in_progress">In Progress</option>
              <option value="posted">Posted</option>
              <option value="partial_posted">Partially Posted</option>
              <option value="failed">Failed</option>
              <option value="partial_failed">Partially Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Posts List */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-lg font-medium text-gray-600">Loading posts...</div>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="card text-center py-12">
          <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No scheduled posts</h3>
          <a href="/scheduler" className="btn-primary">
            Schedule Your First Post
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => (
            <div key={post.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Status and Platform Info */}
                  <div className="flex items-center space-x-3 mb-3">
                    {getStatusIcon(post.overallStatus)}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(post.overallStatus)}`}>
                      {getStatusText(post.overallStatus, post.platforms)}
                    </span>
                    <span className="text-sm font-medium text-gray-700">
                      {post.platforms}
                    </span>
                    <span className="text-sm text-gray-500">
                      {post.media_type}
                    </span>
                  </div>

                  {/* Caption */}
                  <p className="text-gray-900 mb-3 line-clamp-3">
                    {post.caption}
                  </p>

                  {/* Timing Information */}
                  <div className="space-y-1 text-sm text-gray-600">
                    <div>
                      <strong>Scheduled:</strong> {formatTimeIST(post.scheduled_time)} IST
                    </div>
                    {post.latest_attempt && (
                      <div>
                        <strong>Last Attempt:</strong> {formatTimeIST(post.latest_attempt)} IST
                      </div>
                    )}
                  </div>

                  {/* Platform-specific Status (for Both platform) - Fixed to prevent duplicates */}
                  {post.platforms === 'Both' && post.subPosts.length > 0 && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Platform Status:</h4>
                      <div className="space-y-1">
                        {/* Ensure unique platforms only */}
                        {Array.from(new Set(post.subPosts.map(sp => sp.platform))).map((platform) => {
                          const subPost = post.subPosts.find(sp => sp.platform === platform);
                          return (
                            <div key={platform} className="flex items-center justify-between text-sm">
                              <span className="flex items-center space-x-2">
                                {getStatusIcon(subPost.status)}
                                <span>{platform}</span>
                              </span>
                              <span className={`px-2 py-1 rounded text-xs ${getStatusColor(subPost.status)}`}>
                                {subPost.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Error Messages */}
                  {post.subPosts.some(sp => sp.error_message) && (
                    <div className="mt-3 space-y-1">
                      {/* Show unique error messages only */}
                      {Array.from(new Set(post.subPosts.map(sp => sp.platform))).map((platform) => {
                        const subPost = post.subPosts.find(sp => sp.platform === platform && sp.error_message);
                        if (!subPost) return null;
                        return (
                          <div key={platform} className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                            <strong>{platform} Error:</strong> {subPost.error_message}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Media Preview */}
                {post.media_urls && post.media_urls.length > 0 && (
                  <div className="ml-4 flex-shrink-0">
                    <img
                      src={post.media_urls[0]}
                      alt="Post preview"
                      className="w-20 h-20 object-cover rounded-lg border"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://via.placeholder.com/150?text=Media+Not+Available';
                      }}
                    />
                    {post.media_urls.length > 1 && (
                      <span className="text-xs text-gray-500 mt-1 block text-center">
                        +{post.media_urls.length - 1} more
                      </span>
                    )}
                    <button className="text-xs text-blue-600 hover:text-blue-800 mt-1 block w-full text-center">
                      Post preview
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ScheduledPosts;
