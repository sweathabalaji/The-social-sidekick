import React from 'react';
import { Link } from 'react-router-dom';
import { ClockIcon } from '@heroicons/react/24/outline';
import PostForm from '../components/PostForm';

const Scheduler = () => {
  return (
    <div className="scheduler-page">
      <style>
        {`
          .scheduler-custom-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            margin-bottom: 2rem !important;
            padding: 20px 0 !important;
            text-align: left !important;
          }
          .scheduler-custom-title {
            font-size: 2.8rem !important;
            font-weight: 700 !important;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            -webkit-background-clip: text !important;
            background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            margin: 0 !important;
            line-height: 1.3 !important;
            letter-spacing: -0.02em !important;
          }
        `}
      </style>
      <div className="scheduler-custom-header">
        <h1 className="scheduler-custom-title">Schedule New Post</h1>
        <Link 
          to="/scheduled" 
          className="flex items-center text-primary-600 hover:text-primary-700"
        >
          <ClockIcon className="h-5 w-5 mr-1" />
          <span>View Scheduled Posts</span>
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-center h-10 w-10 bg-primary-100 rounded-full text-primary-700 font-bold mb-3">1</div>
            <h3 className="font-medium mb-2">Upload Media</h3>
            <p className="text-sm text-gray-600">Upload images or videos for your post</p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-center h-10 w-10 bg-primary-100 rounded-full text-primary-700 font-bold mb-3">2</div>
            <h3 className="font-medium mb-2">Create Caption</h3>
            <p className="text-sm text-gray-600">Write or generate AI-powered captions</p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-center h-10 w-10 bg-primary-100 rounded-full text-primary-700 font-bold mb-3">3</div>
            <h3 className="font-medium mb-2">Select Platform</h3>
            <p className="text-sm text-gray-600">Choose Instagram, Facebook, or both</p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-center h-10 w-10 bg-primary-100 rounded-full text-primary-700 font-bold mb-3">4</div>
            <h3 className="font-medium mb-2">Schedule</h3>
            <p className="text-sm text-gray-600">Pick a date and time for your post</p>
          </div>
        </div>
      </div>

      <PostForm />
      
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-800 mb-2">How the auto-posting works:</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm text-blue-700">
          <li>Our system securely stores your scheduled post</li>
          <li>At the scheduled time, our Celery worker runs in the background</li>
          <li>The worker sends your post to Facebook/Instagram Graph API</li>
          <li>You can track success, failures, and error messages in the "Scheduled Posts" section</li>
          <li>All post history and status changes are logged in our database</li>
        </ul>
      </div>
    </div>
  );
};

export default Scheduler; 