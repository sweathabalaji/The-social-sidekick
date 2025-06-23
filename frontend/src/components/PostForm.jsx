import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import moment from 'moment-timezone';
import {
  PhotoIcon,
  SparklesIcon,
  ClockIcon,
  FilmIcon,
  ViewfinderCircleIcon,
  PlusIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import apiClient from '../api';
import SuccessDialog from './SuccessDialog';
import { useNotifications } from '../hooks/useNotifications';

const PostForm = () => {
  const { addNotification } = useNotifications();

  // Form state
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaType, setMediaType] = useState('image'); // 'image', 'carousel', 'reel'
  const [caption, setCaption] = useState('');
  const [generatedCaptions, setGeneratedCaptions] = useState([]);
  const [platform, setPlatform] = useState('Instagram'); // Instagram, Facebook, Both
  const [scheduledTime, setScheduledTime] = useState(() => {
    // Set default time to 1 hour from now in IST, but convert to local time for DatePicker
    const istTime = moment().tz('Asia/Kolkata').add(1, 'hour');
    // Convert IST time to local time for DatePicker display
    const localTime = moment.tz(istTime.format('YYYY-MM-DD HH:mm:ss'), 'YYYY-MM-DD HH:mm:ss', 'Asia/Kolkata').local();
    return localTime.toDate();
  });
  
  // Enhanced Caption Generation State
  const [targetAudience, setTargetAudience] = useState('Food Lovers');
  const [businessGoals, setBusinessGoals] = useState('Increase Engagement');
  const [contentTone, setContentTone] = useState('Friendly & Casual');
  const [hashtagPreference, setHashtagPreference] = useState('Medium (10-15 hashtags)');
  const [includeCta, setIncludeCta] = useState(true);
  const [ctaType, setCtaType] = useState('Like & Share');
  const [customCta, setCustomCta] = useState('');
  const [includeQuestions, setIncludeQuestions] = useState(true);
  const [postTiming, setPostTiming] = useState('Regular Day');
  const [locationContext, setLocationContext] = useState('');
  const [seasonalContext, setSeasonalContext] = useState('Current Season');
  const [brandVoice, setBrandVoice] = useState('');
  const [numVariants, setNumVariants] = useState(3);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  
  // UI state
  const [loading, setLoading] = useState({
    upload: false,
    generate: false,
    schedule: false,
    immediate: false
  });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [previewUrls, setPreviewUrls] = useState([]);
  const [uploadedMediaUrls, setUploadedMediaUrls] = useState([]);
  const [selectedImageForPreview, setSelectedImageForPreview] = useState(null);
  const [selectedVideoForPreview, setSelectedVideoForPreview] = useState(null);
  
  // Success dialog state
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successDialogData, setSuccessDialogData] = useState({
    scheduledTime: null,
    platforms: '',
    isImmediate: false
  });

  // Handle file upload
  const onDrop = useCallback(acceptedFiles => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      // Determine media type based on files
      const isVideo = acceptedFiles[0].type.includes('video');
      const isCarousel = !isVideo && (mediaType === 'carousel' || acceptedFiles.length > 1);
      
      if (isVideo) {
        setMediaType('reel');
        // For reels, only use the first file
        const videoFile = acceptedFiles[0];
        setMediaFiles([videoFile]);
        
        // Create preview
        const preview = URL.createObjectURL(videoFile);
        setPreviewUrls([preview]);
      } else if (isCarousel) {
        setMediaType('carousel');
        
        // If we're already in carousel mode, append the new files
        if (mediaType === 'carousel' && mediaFiles.length > 0) {
          const newFiles = [...mediaFiles, ...acceptedFiles];
          setMediaFiles(newFiles);
          
          // Create previews for all images
          const existingPreviews = [...previewUrls];
          const newPreviews = acceptedFiles.map(file => URL.createObjectURL(file));
          setPreviewUrls([...existingPreviews, ...newPreviews]);
        } else {
          // Starting a new carousel
          setMediaFiles(acceptedFiles);
          
          // Create previews for all images
          const previews = acceptedFiles.map(file => URL.createObjectURL(file));
          setPreviewUrls(previews);
        }
      } else {
        setMediaType('image');
        setMediaFiles([acceptedFiles[0]]);
        
        // Create preview for single image
        const preview = URL.createObjectURL(acceptedFiles[0]);
        setPreviewUrls([preview]);
      }
      
      // Reset uploaded URLs when new files are selected
      setUploadedMediaUrls([]);
      
      // Clear any previous errors
      setError('');
    }
  }, [mediaFiles, mediaType, previewUrls]);

  // Add a single image to carousel
  const addToCarousel = useCallback(() => {
    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = false;
    
    // Handle file selection
    input.onchange = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        if (!file.type.includes('image')) {
          setError('Only images can be added to carousels');
          return;
        }
        
        // Add the file to mediaFiles
        const newFiles = [...mediaFiles, file];
        setMediaFiles(newFiles);
        
        // Add preview
        const preview = URL.createObjectURL(file);
        setPreviewUrls([...previewUrls, preview]);
        
        // Reset uploaded URLs
        setUploadedMediaUrls([]);
        
        // Clear errors
        setError('');
      }
    };
    
    // Trigger the file dialog
    input.click();
  }, [mediaFiles, previewUrls]);

  // Remove a specific image from carousel
  const removeFromCarousel = useCallback((index) => {
    // Create new arrays without the item at the specified index
    const newFiles = [...mediaFiles];
    newFiles.splice(index, 1);
    
    // Revoke the object URL to avoid memory leaks
    URL.revokeObjectURL(previewUrls[index]);
    
    const newPreviews = [...previewUrls];
    newPreviews.splice(index, 1);
    
    // Update state
    setMediaFiles(newFiles);
    setPreviewUrls(newPreviews);
    setUploadedMediaUrls([]);
    
    // If we removed all images, reset to image type
    if (newFiles.length === 0) {
      setMediaType('image');
    } else if (newFiles.length === 1) {
      // If only one image remains, show warning but keep as carousel
      console.log('Carousel posts require at least 2 images.');
    }
  }, [mediaFiles, previewUrls]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'video/*': ['.mp4', '.mov']
    },
    maxFiles: mediaType === 'carousel' ? 10 : 1, // Allow up to 10 files for carousel, 1 for others
    multiple: mediaType === 'carousel', // Only allow multiple files for carousel
    disabled: loading.upload || loading.generate || loading.schedule || loading.immediate
  });

  // Upload media to server/cloudinary
  const uploadMedia = async () => {
    if (!mediaFiles.length) {
      setError('Please select files to upload');
      return null;
    }

    // If we already uploaded this media, return the URLs
    if (uploadedMediaUrls.length === mediaFiles.length) {
      return { 
        urls: uploadedMediaUrls,
        public_ids: uploadedMediaUrls.map(url => {
          // Extract public_id from Cloudinary URL
          const parts = url.split('/');
          const filename = parts[parts.length - 1];
          return filename.split('.')[0];
        })
      };
    }

    try {
      setLoading(prev => ({ ...prev, upload: true }));
      setError('');

      const uploadedUrls = [];
      const publicIds = [];

      // Upload each file
      for (const file of mediaFiles) {
        try {
          const response = await apiClient.uploadMedia(file);
          
          if (response && response.url) {
            uploadedUrls.push(response.url);
            if (response.public_id) {
            publicIds.push(response.public_id);
            }
          } else {
            throw new Error(`No URL returned for ${file.name}`);
          }
        } catch (uploadError) {
          const errorMsg = `Upload failed for ${file.name}: ${uploadError.message}`;
          throw new Error(errorMsg);
        }
      }

      // Store uploaded URLs
      setUploadedMediaUrls(uploadedUrls);
      
      return {
        urls: uploadedUrls,
        public_ids: publicIds
      };

    } catch (error) {
      setError(`Upload failed: ${error.message}`);
      return null;
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
    }
  };

  // Generate captions with enhanced loading feedback
  const generateCaptions = async () => {
    try {
      // Clear previous messages
      setError('');
      setSuccessMessage('');
      
      console.log('Starting caption generation...');
      
      // First upload media if not already uploaded
      const uploadResult = await uploadMedia();
      if (!uploadResult || !uploadResult.urls.length) {
        setError('Please upload media first');
        return;
      }

      console.log('Media upload result:', uploadResult);
      setLoading(prev => ({ ...prev, generate: true }));

      const captionRequest = {
        media_path: uploadResult.urls,
          media_type: mediaType,
          style: 'high_engagement',
        target_audience: targetAudience,
        business_goals: businessGoals,
        content_tone: contentTone,
        hashtag_preference: hashtagPreference,
        include_cta: includeCta,
        cta_type: ctaType,
        custom_cta: customCta,
        include_questions: includeQuestions,
        post_timing: postTiming,
        location_context: locationContext,
        seasonal_context: seasonalContext,
        brand_voice: brandVoice,
        num_variants: numVariants
      };

      console.log('Caption request:', captionRequest);

      const response = await apiClient.generateCaptions(captionRequest);
        console.log('Caption generation response:', response);
        
      if (response && response.captions && response.captions.length > 0) {
          setGeneratedCaptions(response.captions);
        setCaption(response.captions[0].text || '');
        
        let message = `✨ Generated ${response.captions.length} AI-powered captions successfully!`;
        if (response.fallback) {
          message += ' (Enhanced with fallback system for better reliability)';
        }
        setSuccessMessage(message);
        } else {
        console.error('Invalid response format:', response);
        throw new Error('No captions were generated. Please try again or check your media.');
      }

    } catch (error) {
      console.error('Caption generation error:', error);
      setError(`Caption generation failed: ${error.message || 'Unknown error occurred'}`);
      
      // Clear any partial results
      setGeneratedCaptions([]);
    } finally {
      setLoading(prev => ({ ...prev, generate: false }));
    }
  };

  // Schedule post with proper IST timezone conversion
  const schedulePost = async () => {
    try {
      // Prevent double-clicking by checking if already loading
      if (loading.schedule) {
        return;
      }

      // Debug session info
      const sessionId = localStorage.getItem('session_id');
      console.log('Session check:', { 
        hasSession: !!sessionId, 
        sessionPreview: sessionId ? sessionId.substring(0, 8) + '...' : 'none' 
      });

      // First upload media if not already uploaded
      const uploadResult = await uploadMedia();
      if (!uploadResult || !uploadResult.urls.length) {
        setError('Please upload media first');
        return;
      }
    
      if (!caption.trim()) {
        setError('Please add a caption for your post');
        return;
      }

      setLoading(prev => ({ ...prev, schedule: true }));
      setError('');

      // Convert scheduled time to proper IST format for backend
      // IMPORTANT: Treat the selected time as IST, not local time
      // Create a moment object from the selected time and explicitly set it to IST timezone
      const istMoment = moment.tz(
        moment(scheduledTime).format('YYYY-MM-DD HH:mm:ss'), 
        'YYYY-MM-DD HH:mm:ss', 
        'Asia/Kolkata'
      );
      
      const istDate = istMoment.format();
      const currentISTTime = moment().tz('Asia/Kolkata');
      
      // Debug timezone information
      console.log('Scheduling post:', {
        selectedTime: scheduledTime,
        istFormatted: istDate,
        currentIST: currentISTTime.format(),
        platform: platform
      });
      
      // Check if scheduled time is in the past (with 1 minute buffer)
      if (istMoment.isBefore(currentISTTime.subtract(1, 'minute'))) {
        throw new Error('Cannot schedule posts in the past. Please select a future time in IST.');
      }

      const postData = {
        media_urls: uploadResult.urls,
        media_type: mediaType,
        caption: caption.trim(),
        scheduled_time: istDate, // Send IST formatted time
        username: 'user', // This should come from auth context
        platform: platform,
        cloudinary_public_ids: uploadResult.public_ids
      };

      console.log('Calling createPost API...');
      const response = await apiClient.createPost(postData);
      console.log('Post creation response:', response);

      if (response && response.message) {
        // Show success dialog
        setSuccessDialogData({
          scheduledTime: istDate,
          platforms: platform,
          isImmediate: false
        });
        setShowSuccessDialog(true);
        
        // Clear form after successful scheduling
        clearMedia();
        setCaption('');
        setGeneratedCaptions([]);
        setScheduledTime(moment().tz('Asia/Kolkata').add(1, 'hour').toDate()); // Reset to 1 hour from now in IST

        // Trigger notification
        console.log('Triggering notification...');
        addNotification('success', `Post scheduled for ${moment(istDate).format('dddd, MMMM Do YYYY, h:mm A')} on ${platform}`);
      } else {
        throw new Error('Failed to schedule post');
      }

    } catch (error) {
      console.error('Scheduling error:', error);
      setError(`Scheduling failed: ${error.message}`);
      // Add error notification
      addNotification('warning', `Failed to schedule post: ${error.message}`);
    } finally {
      setLoading(prev => ({ ...prev, schedule: false }));
    }
  };

  // Post immediately function
  const postImmediately = async () => {
    try {
      // Prevent double-clicking by checking if already loading
      if (loading.immediate) {
        return;
      }

      // First upload media if not already uploaded
      const uploadResult = await uploadMedia();
      if (!uploadResult || !uploadResult.urls.length) {
        setError('Please upload media first');
        return;
      }

      if (!caption.trim()) {
        setError('Please add a caption for your post');
        return;
      }

      setLoading(prev => ({ ...prev, immediate: true }));
      setError('');

      // Set immediate posting time (current time + 1 minute to allow processing)
      const immediateTime = moment().tz('Asia/Kolkata').add(1, 'minute').format();

      const postData = {
        media_urls: uploadResult.urls,
        media_type: mediaType,
        caption: caption.trim(),
        scheduled_time: immediateTime, // Post immediately
        username: 'user', // This should come from auth context
        platform: platform,
        cloudinary_public_ids: uploadResult.public_ids,
        immediate: true // Flag for immediate posting
      };

      const response = await apiClient.createPost(postData);

      if (response && response.message) {
        // Show success dialog for immediate posting
        setSuccessDialogData({
          scheduledTime: null,
          platforms: platform,
          isImmediate: true
        });
        setShowSuccessDialog(true);
        
        // Clear form after successful posting
        clearMedia();
        setCaption('');
        setGeneratedCaptions([]);
        setScheduledTime(moment().tz('Asia/Kolkata').add(1, 'hour').toDate());

        // Trigger notification
        addNotification('success', `Your post has been published to ${platform}`);
      } else {
        throw new Error('Failed to post immediately');
      }

    } catch (error) {
      setError(`Immediate posting failed: ${error.message}`);
      // Add error notification
      addNotification('warning', `Failed to publish post: ${error.message}`);
    } finally {
      setLoading(prev => ({ ...prev, immediate: false }));
    }
  };

  const clearMedia = () => {
    // Revoke all object URLs
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    
    setMediaFiles([]);
    setPreviewUrls([]);
    setUploadedMediaUrls([]);
    setMediaType('image');
    setError('');
    setSuccessMessage('');
  };

  // Enhanced Image preview modal
  const ImagePreviewModal = ({ imageUrl, onClose }) => {
    if (!imageUrl) return null;

    return (
      <div 
        className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4" 
        onClick={onClose}
      >
        <div className="relative max-w-5xl max-h-5xl">
          <button
            onClick={onClose}
            className="absolute -top-12 right-0 text-white bg-black bg-opacity-50 hover:bg-opacity-75 rounded-full p-2 transition-all duration-200"
            title="Close preview (ESC)"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
          <img
            src={imageUrl}
            alt="Full size preview"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute -bottom-8 left-0 text-white text-sm opacity-75">
            Click outside to close or press ESC
          </div>
        </div>
      </div>
    );
  };

  // Enhanced Video preview modal for reels
  const VideoPreviewModal = ({ videoUrl, onClose }) => {
    console.log('VideoPreviewModal rendered with URL:', videoUrl);
    
    if (!videoUrl) return null;

    return (
      <div 
        className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4" 
        onClick={onClose}
        style={{ zIndex: 9999 }}
      >
        <div className="relative max-w-4xl max-h-4xl w-full h-full flex items-center justify-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white bg-black bg-opacity-50 hover:bg-opacity-75 rounded-full p-2 transition-all duration-200 z-10"
            title="Close preview (ESC)"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
          
          <video
            src={videoUrl}
            controls
            autoPlay
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '90vh', maxWidth: '90vw' }}
            onLoadStart={() => console.log('Video loading started')}
            onCanPlay={() => console.log('Video can play')}
            onError={(e) => console.log('Video error:', e)}
          >
            Your browser does not support the video tag.
          </video>
          
          <div className="absolute bottom-4 left-4 text-white text-sm opacity-75 bg-black bg-opacity-50 px-3 py-2 rounded">
            <div className="flex items-center space-x-2">
              <FilmIcon className="w-4 h-4" />
              <span>Video Preview - Click outside to close or press ESC</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Add keyboard event listener for ESC key (updated to handle both image and video)
  React.useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        if (selectedImageForPreview) {
          setSelectedImageForPreview(null);
        }
        if (selectedVideoForPreview) {
          setSelectedVideoForPreview(null);
        }
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [selectedImageForPreview, selectedVideoForPreview]);

  // Debug video preview state changes
  React.useEffect(() => {
    console.log('selectedVideoForPreview changed:', selectedVideoForPreview);
  }, [selectedVideoForPreview]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Create Social Media Post</h2>
        
        {/* Media Upload Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">1. Upload Your Media</h3>
          
          {/* Media Type Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Content Type</label>
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => setMediaType('image')}
                className={`flex items-center px-4 py-2 rounded-md ${
                  mediaType === 'image' 
                    ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300'
                }`}
              >
                <PhotoIcon className="w-5 h-5 mr-2" />
                Image
              </button>
              <button
                type="button"
                onClick={() => setMediaType('carousel')}
                className={`flex items-center px-4 py-2 rounded-md ${
                  mediaType === 'carousel' 
                    ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300'
                }`}
              >
                <ViewfinderCircleIcon className="w-5 h-5 mr-2" />
                Carousel
              </button>
              <button
                type="button"
                onClick={() => setMediaType('reel')}
                className={`flex items-center px-4 py-2 rounded-md ${
                  mediaType === 'reel' 
                    ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300'
                }`}
              >
                <FilmIcon className="w-5 h-5 mr-2" />
                Reel
              </button>
          </div>
        </div>
        
          {/* File Upload Area */}
        <div 
          {...getRootProps()} 
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input {...getInputProps()} />
            <div className="flex flex-col items-center">
              <PhotoIcon className="w-12 h-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-2">
                {isDragActive ? 'Drop files here' : `Upload ${mediaType}`}
              </p>
              <p className="text-sm text-gray-500">
                {mediaType === 'carousel' 
                  ? 'Upload 2-10 images (PNG, JPG, JPEG)'
                  : mediaType === 'reel'
                  ? 'Upload video (MP4, MOV)'
                  : 'Upload image (PNG, JPG, JPEG)'
                }
              </p>
            </div>
          </div>

          {/* Media Previews */}
          {previewUrls.length > 0 && (
            <div className="mt-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {previewUrls.map((url, index) => (
                  <div key={index} className="relative group">
                  {mediaType === 'reel' ? (
                    <div className="relative">
                      <video 
                        src={url} 
                        className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                        muted
                        loop
                        onClick={() => {
                          console.log('Video clicked, URL:', url);
                          setSelectedVideoForPreview(url);
                        }}
                        title="Click to view full screen"
                        onMouseEnter={(e) => {
                          console.log('Video hover started');
                          e.target.play().catch(err => console.log('Play failed:', err));
                        }}
                        onMouseLeave={(e) => {
                          console.log('Video hover ended');
                          e.target.pause();
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVideoForPreview(url);
                        }}
                        className="absolute top-2 left-2 bg-white bg-opacity-75 hover:bg-opacity-100 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-200"
                        title="View full screen"
                      >
                        <MagnifyingGlassIcon className="w-4 h-4 text-gray-600" />
                      </button>
                      <div className="absolute top-2 right-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        <FilmIcon className="w-3 h-3 inline mr-1" />
                        Video
                      </div>
                      <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        Click to view full screen
                      </div>
                      {/* Play button overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-black bg-opacity-50 rounded-full p-3">
                          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ) : (
                      <div className="relative">
                    <img 
                      src={url} 
                      alt={`Preview ${index + 1}`} 
                          className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setSelectedImageForPreview(url)}
                          title="Click to view full size"
                    />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                            setSelectedImageForPreview(url);
                        }}
                          className="absolute top-2 left-2 bg-white bg-opacity-75 hover:bg-opacity-100 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-200"
                          title="View full size"
                      >
                          <MagnifyingGlassIcon className="w-4 h-4 text-gray-600" />
                      </button>
                        <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to enlarge
                        </div>
                      </div>
                    )}
                    {mediaType === 'carousel' && (
                      <button
                        onClick={() => removeFromCarousel(index)}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                  )}
                </div>
              ))}
              
                {/* Add More Button for Carousel */}
                {mediaType === 'carousel' && mediaFiles.length < 10 && (
                  <button
                    onClick={addToCarousel}
                    className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <PlusIcon className="w-8 h-8 mb-2" />
                    <span className="text-sm">Add Image</span>
                  </button>
                )}
              </div>
                </div>
              )}
        </div>

        {/* Platform Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Instagram">Instagram</option>
            <option value="Facebook">Facebook</option>
            <option value="Both">Both Platforms</option>
          </select>
            </div>

        {/* Caption Generation */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">2. Generate AI Captions</h3>
          
          {/* Enhanced Caption Options */}
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-gray-800">✨ Enhanced Caption Options</h4>
              <button
                type="button"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                {showAdvancedOptions ? 'Show Less' : 'Show Advanced Options'}
              </button>
            </div>
            
            {/* Basic Options - Always Visible */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Target Audience</label>
                <select
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Food Lovers">Food Lovers</option>
                  <option value="Young Adults (18-25)">Young Adults (18-25)</option>
                  <option value="Professionals (25-35)">Professionals (25-35)</option>
                  <option value="Parents">Parents</option>
                  <option value="Fitness Enthusiasts">Fitness Enthusiasts</option>
                  <option value="Travel Enthusiasts">Travel Enthusiasts</option>
                  <option value="Fashion & Beauty">Fashion & Beauty</option>
                  <option value="Tech Savvy">Tech Savvy</option>
                  <option value="General Audience">General Audience</option>
                </select>
        </div>
        
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Business Goals</label>
                <select
                  value={businessGoals}
                  onChange={(e) => setBusinessGoals(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Increase Engagement">Increase Engagement</option>
                  <option value="Drive Traffic">Drive Traffic</option>
                  <option value="Generate Leads">Generate Leads</option>
                  <option value="Build Brand Awareness">Build Brand Awareness</option>
                  <option value="Boost Sales">Boost Sales</option>
                  <option value="Community Building">Community Building</option>
                  <option value="Educational Content">Educational Content</option>
                </select>
          </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Content Tone</label>
                <select
                  value={contentTone}
                  onChange={(e) => setContentTone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Friendly & Casual">Friendly & Casual</option>
                  <option value="Professional">Professional</option>
                  <option value="Humorous">Humorous</option>
                  <option value="Inspirational">Inspirational</option>
                  <option value="Trendy & Hip">Trendy & Hip</option>
                  <option value="Educational">Educational</option>
                  <option value="Luxury & Premium">Luxury & Premium</option>
                </select>
          </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Number of Variants</label>
                <select
                  value={numVariants}
                  onChange={(e) => setNumVariants(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>1 Caption</option>
                  <option value={2}>2 Captions</option>
                  <option value={3}>3 Captions</option>
                  <option value={4}>4 Captions</option>
                  <option value={5}>5 Captions</option>
                </select>
              </div>
      </div>

            {/* Advanced Options - Collapsible */}
            {showAdvancedOptions && (
              <div className="border-t pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Hashtag Strategy</label>
                    <select
                      value={hashtagPreference}
                      onChange={(e) => setHashtagPreference(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="High Volume (20-30 hashtags)">High Volume (20-30 hashtags)</option>
                      <option value="Medium (10-15 hashtags)">Medium (10-15 hashtags)</option>
                      <option value="Minimal (5-8 hashtags)">Minimal (5-8 hashtags)</option>
                      <option value="Branded Only">Branded Only</option>
                      <option value="No Hashtags">No Hashtags</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Post Timing Context</label>
                    <select
                      value={postTiming}
                      onChange={(e) => setPostTiming(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Regular Day">Regular Day</option>
                      <option value="Morning Energy">Morning Energy</option>
                      <option value="Evening Relaxation">Evening Relaxation</option>
                      <option value="Weekend Vibes">Weekend Vibes</option>
                      <option value="Holiday Special">Holiday Special</option>
                      <option value="Monday Motivation">Monday Motivation</option>
                      <option value="Friday Celebration">Friday Celebration</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Seasonal Context</label>
                    <select
                      value={seasonalContext}
                      onChange={(e) => setSeasonalContext(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Current Season">Current Season</option>
                      <option value="Spring Fresh">Spring Fresh</option>
                      <option value="Summer Vibes">Summer Vibes</option>
                      <option value="Autumn Cozy">Autumn Cozy</option>
                      <option value="Winter Warm">Winter Warm</option>
                      <option value="Festival Season">Festival Season</option>
                      <option value="New Year Energy">New Year Energy</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Location Context (Optional)</label>
                    <input
                      type="text"
                      value={locationContext}
                      onChange={(e) => setLocationContext(e.target.value)}
                      placeholder="e.g., Mumbai, Delhi, Bangalore"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
        </div>
        
                {/* Call-to-Action Options */}
          <div className="mb-4">
                  <div className="flex items-center space-x-4 mb-3">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={includeCta}
                        onChange={(e) => setIncludeCta(e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">Include Call-to-Action</span>
                    </label>
                    
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={includeQuestions}
                        onChange={(e) => setIncludeQuestions(e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">Include Engagement Questions</span>
                    </label>
                  </div>
                  
                  {includeCta && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">CTA Type</label>
                        <select
                          value={ctaType}
                          onChange={(e) => setCtaType(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="Like & Share">Like & Share</option>
                          <option value="Visit Website">Visit Website</option>
                          <option value="Order Now">Order Now</option>
                          <option value="Follow for More">Follow for More</option>
                          <option value="Save Post">Save Post</option>
                          <option value="Comment Below">Comment Below</option>
                          <option value="Tag Friends">Tag Friends</option>
                          <option value="Custom">Custom</option>
                        </select>
                </div>
                      
                      {ctaType === 'Custom' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Custom CTA</label>
                          <input
                            type="text"
                            value={customCta}
                            onChange={(e) => setCustomCta(e.target.value)}
                            placeholder="Enter your custom call-to-action"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
            </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Brand Voice */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Brand Voice (Optional)</label>
                  <textarea
                    value={brandVoice}
                    onChange={(e) => setBrandVoice(e.target.value)}
                    placeholder="Describe your brand's unique voice and personality..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                </div>
              </div>
            )}
          </div>
          
          {loading.generate && (
            <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                <div>
                  <p className="text-sm font-medium text-purple-800">Analyzing your media and generating captions...</p>
                  <p className="text-xs text-purple-600">This may take 10-30 seconds depending on content complexity</p>
                </div>
              </div>
          </div>
        )}
        
        <button
          onClick={generateCaptions}
            disabled={loading.generate || loading.upload || !mediaFiles.length}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 px-6 rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 transform hover:scale-105"
          >
            {loading.generate ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Generating AI Captions...
              </>
            ) : loading.upload ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Uploading Media...
              </>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5 mr-2" />
                ✨ Generate Enhanced AI Captions
              </>
            )}
        </button>
          
          {!mediaFiles.length && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              Please upload media first to generate captions
            </p>
          )}
      </div>

        {/* Generated Captions */}
        {generatedCaptions.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">3. Select and Edit Caption</h3>
            <div className="space-y-3 mb-4">
              {generatedCaptions.map((captionObj, index) => (
                <div
                  key={index}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    caption === captionObj.text
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onClick={() => setCaption(captionObj.text)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium text-sm text-gray-600">Caption {index + 1}</span>
                    {captionObj.engagement_score && (
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                        Score: {captionObj.engagement_score}
                      </span>
                    )}
          </div>
                  <p className="text-gray-800 text-sm leading-relaxed">{captionObj.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Caption Editor */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Caption</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write your caption here or generate one above..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={6}
          />
          </div>
          
        {/* Schedule Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">4. Publish Your Post</h3>
          
          {/* Current Time Display */}
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
            <p className="text-sm text-blue-800">
              🕒 <strong>Timezone:</strong> All times are in Indian Standard Time (IST / UTC+5:30)
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Current IST Time: {moment().tz('Asia/Kolkata').format('dddd, MMMM Do YYYY, h:mm:ss A')}
            </p>
          </div>
          
          {/* Publishing Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Immediate Post */}
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <h4 className="font-medium text-green-800 mb-2">📤 Post Immediately</h4>
              <p className="text-sm text-green-700 mb-3">
                Publish your post right now to {platform}
              </p>
              
              {loading.immediate && (
                <div className="mb-3 p-3 bg-green-100 border border-green-300 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
                    <div>
                      <p className="text-sm font-medium text-green-800">Publishing your post...</p>
                      <p className="text-xs text-green-600">Posting to {platform} now</p>
        </div>
      </div>
                </div>
              )}
              
              <button
                onClick={postImmediately}
                disabled={loading.immediate || loading.upload || loading.generate || loading.schedule || !mediaFiles.length || !caption.trim()}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 transform hover:scale-105"
              >
                {loading.immediate ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Publishing Now...
                  </>
                ) : (
                  <>
                    🚀 Post Now to {platform}
                  </>
                )}
              </button>
            </div>
            
            {/* Scheduled Post */}
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-2">⏰ Schedule Post</h4>
              <p className="text-sm text-blue-700 mb-3">
                Schedule your post for a specific time
              </p>
              
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Date & Time (IST)</label>
          <DatePicker
            selected={scheduledTime}
                  onChange={(date) => {
                    // User selects time in DatePicker (local time)
                    // We want this time to represent IST time
                    setScheduledTime(date);
                  }}
            showTimeSelect
            timeFormat="HH:mm"
            timeIntervals={15}
                  dateFormat="yyyy-MM-dd HH:mm"
            minDate={new Date()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholderText="Select date and time"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Selected: {moment(scheduledTime).format('dddd, MMMM Do YYYY, h:mm A')} (will be treated as IST)
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  💡 The time you select will be scheduled in IST timezone
                </p>
        </div>
              
              {loading.schedule && (
                <div className="mb-3 p-3 bg-blue-100 border border-blue-300 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <div>
                      <p className="text-sm font-medium text-blue-800">Scheduling your post...</p>
                      <p className="text-xs text-blue-600">Setting up automation for {platform}</p>
                    </div>
                  </div>
                </div>
              )}

        <button
          onClick={schedulePost}
                disabled={loading.schedule || loading.upload || loading.generate || loading.immediate || !mediaFiles.length || !caption.trim()}
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 transform hover:scale-105"
              >
                {loading.schedule ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Scheduling...
                  </>
                ) : (
                  <>
                    <ClockIcon className="w-5 h-5 mr-2" />
                    Schedule for {platform}
                  </>
                )}
        </button>
      </div>
          </div>
          
          {/* Help Text */}
          {(!mediaFiles.length || !caption.trim()) && (
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ {!mediaFiles.length ? 'Please upload media and add a caption to publish your post' : 'Please add a caption to publish your post'}
              </p>
            </div>
          )}
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
            {successMessage}
          </div>
        )}

        {/* Clear Button */}
        <button
          onClick={clearMedia}
          className="w-full mt-3 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-semibold hover:bg-gray-300"
        >
          Clear All
        </button>
      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal 
        imageUrl={selectedImageForPreview} 
        onClose={() => setSelectedImageForPreview(null)} 
      />

      {/* Video Preview Modal */}
      <VideoPreviewModal 
        videoUrl={selectedVideoForPreview} 
        onClose={() => setSelectedVideoForPreview(null)} 
      />

      {/* Success Dialog */}
      <SuccessDialog
        isOpen={showSuccessDialog}
        onClose={() => setShowSuccessDialog(false)}
        scheduledTime={successDialogData.scheduledTime}
        platforms={successDialogData.platforms}
        isImmediate={successDialogData.isImmediate}
      />
    </div>
  );
};

export default PostForm; 