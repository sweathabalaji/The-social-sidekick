import { useState, useEffect } from 'react';
import apiClient from '../api';

export const usePosts = () => {
  const [posts, setPosts] = useState([]);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPosts = async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.getPosts(params);
      setPosts(response.posts || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  };

  const fetchScheduledPosts = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.getScheduledPosts();
      setScheduledPosts(response || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch scheduled posts');
    } finally {
      setLoading(false);
    }
  };

  const createPost = async (postData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.createPost(postData);
      setPosts(prev => [response.post, ...prev]);
      return { success: true, data: response.post };
    } catch (err) {
      const errorMessage = err.message || 'Failed to create post';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const schedulePost = async (postData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.schedulePost(postData);
      setScheduledPosts(prev => [response.post, ...prev]);
      return { success: true, data: response.post };
    } catch (err) {
      const errorMessage = err.message || 'Failed to schedule post';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const updatePost = async (id, postData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.updatePost(id, postData);
      setPosts(prev => prev.map(post =>
        post.id === id ? response.post : post
      ));
      return { success: true, data: response.post };
    } catch (err) {
      const errorMessage = err.message || 'Failed to update post';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const deletePost = async (id) => {
    setLoading(true);
    setError(null);

    try {
      await apiClient.deletePost(id);
      setPosts(prev => prev.filter(post => post.id !== id));
      setScheduledPosts(prev => prev.filter(post => post.id !== id));
      return { success: true };
    } catch (err) {
      const errorMessage = err.message || 'Failed to delete post';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
    fetchScheduledPosts();
  }, []);

  return {
    posts,
    scheduledPosts,
    loading,
    error,
    fetchPosts,
    fetchScheduledPosts,
    createPost,
    schedulePost,
    updatePost,
    deletePost,
  };
};
