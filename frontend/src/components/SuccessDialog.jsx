import React from 'react';
import { CheckCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { formatToIST } from '../utils/dateFormatter';

const SuccessDialog = ({ isOpen, onClose, scheduledTime, platforms, isImmediate }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>

        {/* Success icon */}
        <div className="flex items-center justify-center mb-4">
          <CheckCircleIcon className="h-16 w-16 text-green-500" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-center text-gray-900 mb-4">
          {isImmediate ? 'Post Published Successfully!' : 'Post Scheduled Successfully!'}
        </h2>

        {/* Details */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Platform:</span>
            <span className="font-medium text-gray-900">
              {Array.isArray(platforms) ? platforms.join(', ') : platforms}
            </span>
          </div>
          
          {!isImmediate && scheduledTime && (
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Scheduled for:</span>
              <span className="font-medium text-gray-900">
                {formatToIST(scheduledTime, 'MMM DD, YYYY, hh:mm A')} IST
              </span>
            </div>
          )}
          
          {isImmediate && (
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Status:</span>
              <span className="font-medium text-green-600">Posted Immediately</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => {
              onClose();
              window.location.href = '/scheduled';
            }}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            View Scheduled Posts
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuccessDialog; 