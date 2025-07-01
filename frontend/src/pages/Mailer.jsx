import React, { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, Wand2, Eye, Trash2, AlertCircle, CheckCircle, Send, BarChart3, Paperclip } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import axios from 'axios';
import apiClient from '../api';

const Mailer = () => {
  const { sessionId } = useAuth();
  const [activeTab, setActiveTab] = useState('upload');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportSummary, setReportSummary] = useState(null);
  
  // Email data state
  const [emailData, setEmailData] = useState({
    emails: [],
    email_count: 0,
    filename: null
  });
  
  // Email draft state
  const [emailDraft, setEmailDraft] = useState({
    subject: '',
    html_content: '',
    text_content: '',
    sender_name: 'Social Media Assistant',
    sender_email: 'support@hogist.com'
  });
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  
  // AI generation state
  const [aiPrompt, setAiPrompt] = useState({
    prompt: '',
    tone: 'professional',
    purpose: 'marketing',
    custom_instructions: ''
  });
  
  // Test email state
  const [testEmail, setTestEmail] = useState('');
  
  // Drag and drop state
  const [dragActive, setDragActive] = useState(false);
  
  // Selected template state
  const [selectedTemplate, setSelectedTemplate] = useState('basic');
  
  // Add new styles
  const styles = {
    attachmentButton: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      backgroundColor: '#f8f9fa',
      border: '1px solid #dee2e6',
      borderRadius: '4px',
      cursor: 'pointer',
      color: '#495057',
      transition: 'all 0.2s ease',
      marginRight: '10px',
      position: 'relative'
    },
    attachmentBadge: {
      position: 'absolute',
      top: '-8px',
      right: '-8px',
      backgroundColor: '#ff0000',
      color: 'white',
      borderRadius: '50%',
      width: '20px',
      height: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '12px'
    },
    attachmentList: {
      marginTop: '10px',
      padding: '10px',
      backgroundColor: '#f8f9fa',
      borderRadius: '4px',
      display: attachments.length > 0 ? 'block' : 'none'
    }
  };
  
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleCsvUpload(file);
    }
  };

  const tabs = [
    { id: 'upload', label: 'Upload Emails', icon: Upload },
    { id: 'draft', label: 'Draft Email', icon: FileText },
    { id: 'send', label: 'Send Campaign', icon: Send },
    { id: 'reports', label: 'Reports', icon: BarChart3 }
  ];

  // Show notification
  const showNotification = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  // Custom confirm function to replace window.confirm
  const showConfirm = (message) => {
    // eslint-disable-next-line no-restricted-globals
    return confirm(message);
  };

  const loadSessionEmails = useCallback(async () => {
    try {
      const response = await axios.get(`/api/mailer/emails?session_id=${sessionId}`);
      setEmailData(response.data);
    } catch (error) {
      console.error('Error loading emails:', error);
    }
  }, [sessionId]);

  // Load session emails on component mount
  useEffect(() => {
    if (sessionId && sessionId !== 'undefined') {
      loadSessionEmails();
    } else {
      showNotification('❌ Session not found. Please log in again.', 'error');
    }
  }, [loadSessionEmails, sessionId, showNotification]);

  // Generate email with AI
  const generateEmailWithAI = async () => {
    if (!sessionId || sessionId === 'undefined') {
      showNotification('❌ Session expired. Please log in again.', 'error');
      return;
    }

    if (!aiPrompt.prompt.trim()) {
      showNotification('❌ Please enter a prompt for AI generation', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `/api/mailer/generate-email?session_id=${sessionId}`,
        {
          prompt: aiPrompt.prompt.trim(),
          tone: aiPrompt.tone || 'professional',
          purpose: aiPrompt.purpose || 'marketing',
          include_images: true,
          custom_instructions: aiPrompt.custom_instructions
        }
      );

      if (!response.data || !response.data.success) {
        throw new Error(response.data?.detail || 'Failed to generate email');
      }

      const generated = response.data;

      // Get the selected template's HTML
      const template = emailTemplates[selectedTemplate];
      let templateHtml = template.html;

      // Format the generated content into paragraphs
      let formattedContent;
      if (selectedTemplate === 'promotional') {
        formattedContent = `
          <h2 style="color: #ff0000; text-align: center; font-size: 24px;">${generated.subject || 'Special Offer!'}</h2>
          ${generated.text_content.split('\n')
            .map(line => line.trim())
            .filter(line => line)
            .map(line => `<p style="font-size: 16px; text-align: center; margin: 15px 0;">${line}</p>`)
            .join('\n')}
        `;
      } else {
        formattedContent = generated.text_content.split('\n')
          .map(line => line.trim())
          .filter(line => line)
          .map(line => `<p>${line}</p>`)
          .join('\n');
      }

      // Replace the content placeholder in the template
      templateHtml = templateHtml.replace(
        /<div id="emailContent"[^>]*>[\s\S]*?<\/div>/,
        `<div id="emailContent" style="margin-bottom: 20px;">
          ${formattedContent}
        </div>`
      );

      // Update the email draft with the generated content
      setEmailDraft({
        subject: generated.subject || 'HOGIST Newsletter',
        html_content: templateHtml,
        text_content: generated.text_content
      });

      showNotification('✅ Email generated successfully!', 'success');
    } catch (error) {
      console.error('Error generating email:', error);
      showNotification(`❌ ${error.message || 'Failed to generate email'}`, 'error');
      setTimeout(() => {
        showNotification('💡 Tip: You can create your email manually using the templates below!', 'info');
      }, 3000);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line no-unused-vars
  const generateBasicTemplate = (content) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HOGIST Newsletter</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f4f4;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0; padding: 20px; background-color: #f4f4f4;">
        <tr>
            <td align="center">
                <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #ff0000 0%, #ffffff 100%); color: white; padding: 30px; text-align: center;">
                            <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 2px; color: #ffffff;">HOGIST</h1>
                        </td>
                    </tr>
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 30px;">
                            <!-- Top Image Section -->
                            <div id="topImageSection" style="margin-bottom: 20px; text-align: center;">
            <div style="background-color: #f8f9fa; border: 2px dashed #ced4da; padding: 20px; border-radius: 4px;">
                <p style="margin: 0; color: #6c757d;">📸 Click "Add Image" and select "Top" to place an image here</p>
            </div>
        </div>
                            
                            <!-- Email Content -->
        <div id="emailContent" style="margin-bottom: 20px;">
                                <p style="margin: 0 0 16px 0;">Dear Subscriber,</p>
                                <p style="margin: 0 0 16px 0;">Your email content goes here.</p>
                                
                                <!-- Middle Image Section -->
                                <div id="middleImageSection" style="margin: 20px 0; text-align: center;">
                <div style="background-color: #f8f9fa; border: 2px dashed #ced4da; padding: 20px; border-radius: 4px;">
                    <p style="margin: 0; color: #6c757d;">🖼️ Click "Add Image" and select "Middle" to place an image here</p>
                </div>
            </div>
                                
                                <p style="margin: 0;">Best regards,<br>HOGIST Team</p>
        </div>
                            
                            <!-- Bottom Image Section -->
                            <div id="bottomImageSection" style="margin-top: 20px; text-align: center;">
            <div style="background-color: #f8f9fa; border: 2px dashed #ced4da; padding: 20px; border-radius: 4px;">
                <p style="margin: 0; color: #6c757d;">🎨 Click "Add Image" and select "Bottom" to place an image here</p>
            </div>
        </div>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
                            <p style="margin: 0;">Unsubscribe | Update preferences</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
  };

  // Email templates
  const emailTemplates = {
    basic: {
      name: 'Clean and Simple Layout',
      html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HOGIST Newsletter</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f4f4;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0; padding: 20px; background-color: #f4f4f4;">
        <tr>
            <td align="center">
                <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #ff0000 0%, #ffffff 100%); color: white; padding: 30px; text-align: center;">
                            <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 2px; color: #ffffff;">HOGIST</h1>
                        </td>
                    </tr>
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 30px;">
                            <!-- Top Image Section -->
                            <div id="topImageSection" style="margin-bottom: 20px; text-align: center;">
            <div style="background-color: #f8f9fa; border: 2px dashed #ced4da; padding: 20px; border-radius: 4px;">
                <p style="margin: 0; color: #6c757d;">📸 Click "Add Image" and select "Top" to place an image here</p>
            </div>
        </div>
                            
                            <!-- Email Content -->
        <div id="emailContent" style="margin-bottom: 20px;">
                                <p style="margin: 0 0 16px 0;">Dear Subscriber,</p>
                                <p style="margin: 0 0 16px 0;">Your email content goes here.</p>
                                
                                <!-- Middle Image Section -->
                                <div id="middleImageSection" style="margin: 20px 0; text-align: center;">
                <div style="background-color: #f8f9fa; border: 2px dashed #ced4da; padding: 20px; border-radius: 4px;">
                    <p style="margin: 0; color: #6c757d;">🖼️ Click "Add Image" and select "Middle" to place an image here</p>
                </div>
            </div>
                                
                                <p style="margin: 0;">Best regards,<br>HOGIST Team</p>
    </div>
                            
                            <!-- Bottom Image Section -->
                            <div id="bottomImageSection" style="margin-top: 20px; text-align: center;">
            <div style="background-color: #f8f9fa; border: 2px dashed #ced4da; padding: 20px; border-radius: 4px;">
                <p style="margin: 0; color: #6c757d;">🎨 Click "Add Image" and select "Bottom" to place an image here</p>
            </div>
        </div>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
                            <p style="margin: 0;">Unsubscribe | Update preferences</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
    },
    promotional: {
      name: 'Eye-catching Promotional Design',
      html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Special Promotion</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f4f4;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0; padding: 20px; background-color: #f4f4f4;">
        <tr>
            <td align="center">
                <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #ff0000 0%, #ffffff 100%); color: white; padding: 30px; text-align: center;">
                            <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 2px; color: #ffffff;">HOGIST</h1>
                            <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9; color: #ffffff;">Special Promotion</p>
                        </td>
                    </tr>
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 30px;">
                            <!-- Top Image Section -->
        <div id="topImageSection" style="margin-bottom: 20px; text-align: center;">
            <div style="background-color: #f8f9fa; border: 2px dashed #ced4da; padding: 20px; border-radius: 4px; cursor: pointer;">
                <p style="margin: 0; color: #6c757d;">📸 Click to add a top image</p>
            </div>
        </div>
                            
                            <!-- Email Content -->
        <div id="emailContent" style="margin-bottom: 20px;">
                                <h2 style="color: #ff0000; text-align: center; font-size: 24px; margin: 0 0 20px 0;">Limited Time Offer!</h2>
                                <p style="font-size: 16px; text-align: center; margin: 15px 0;">Don't miss out on this amazing opportunity.</p>
                                
                                <!-- Middle Image Section -->
            <div id="middleImageSection" style="margin: 20px 0; text-align: center;">
                <div style="background-color: #f8f9fa; border: 2px dashed #ced4da; padding: 20px; border-radius: 4px; cursor: pointer;">
                    <p style="margin: 0; color: #6c757d;">🖼️ Click to add a middle image</p>
                </div>
            </div>
                                
                                <!-- Call to Action -->
                                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 30px 0;">
                                    <tr>
                                        <td align="center">
                                            <a href="https://www.hogist.com/" style="background-color: #ff0000; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Learn More</a>
                                        </td>
                                    </tr>
                                </table>
            </div>
                            
                            <!-- Bottom Image Section -->
        <div id="bottomImageSection" style="margin-top: 20px; text-align: center;">
            <div style="background-color: #f8f9fa; border: 2px dashed #ced4da; padding: 20px; border-radius: 4px; cursor: pointer;">
                <p style="margin: 0; color: #6c757d;">🎨 Click to add a bottom image</p>
            </div>
        </div>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
                            <p style="margin: 0;">Unsubscribe | Update preferences</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
    },
    flyer: {
      name: 'Make Flyer',
      html: `<div id="emailContent" style="max-width: 600px; margin: 0 auto; background-color: white;">
  <div id="flyerSection" style="min-height: 800px; cursor: pointer; position: relative; background-color: #e9ecef; border: 2px dashed #ced4da;">
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; pointer-events: none;">
      <p style="margin: 0; color: #6c757d; font-size: 20px;">📸 Click here to upload your flyer</p>
      <p style="margin: 10px 0 0 0; color: #6c757d; font-size: 16px;">Recommended size: 600x800 pixels</p>
    </div>
  </div>
  <input type="file" id="flyerImageInput" accept="image/*" style="display: none;" />
  <div style="padding: 20px; border-top: 1px solid #e5e7eb;">
    <p style="color: #6c757d; text-align: center; font-size: 14px; margin: 0;">© 2024 HOGIST. All rights reserved.</p>
  </div>
</div>`
    }
  };

  // Handle content editing
  const startEditing = () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(emailDraft.html_content, 'text/html');
    const content = doc.querySelector('#emailContent');
    if (content) {
      // For promotional template, exclude image sections from editing
      if (selectedTemplate === 'promotional') {
        // Create a temporary div to hold the content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content.innerHTML;
        
        // Remove image sections
        const topImageSection = tempDiv.querySelector('#topImageSection');
        const middleImageSection = tempDiv.querySelector('#middleImageSection');
        const bottomImageSection = tempDiv.querySelector('#bottomImageSection');
        
        if (topImageSection) topImageSection.remove();
        if (middleImageSection) middleImageSection.remove();
        if (bottomImageSection) bottomImageSection.remove();
        
        // Set the content without image sections
        setEditContent(tempDiv.innerHTML);
      } else {
        setEditContent(content.innerHTML);
      }
      setIsEditing(true);
    }
  };

  const saveEdits = () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(emailDraft.html_content, 'text/html');
    const content = doc.querySelector('#emailContent');
    if (content) {
      // For promotional template, preserve the image sections
      if (selectedTemplate === 'promotional') {
        const topImageSection = content.querySelector('#topImageSection');
        const middleImageSection = content.querySelector('#middleImageSection');
        const bottomImageSection = content.querySelector('#bottomImageSection');
        
        // Create a temporary div to parse the edited content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = editContent;
        
        // Clear the content div but preserve image sections
        content.innerHTML = '';
        
        // Add top image section if it exists
        if (topImageSection) {
          content.appendChild(topImageSection);
        }
        
        // Add edited content
        Array.from(tempDiv.children).forEach(child => {
          content.appendChild(child.cloneNode(true));
        });
        
        // Add middle image section if it exists
        if (middleImageSection) {
          content.appendChild(middleImageSection);
        }
        
        // Add bottom image section if it exists
        if (bottomImageSection) {
          content.appendChild(bottomImageSection);
        }
      } else {
        // For other templates, just replace the content
        content.innerHTML = editContent;
      }
      
      setEmailDraft(prev => ({
        ...prev,
        html_content: doc.documentElement.outerHTML,
        text_content: editContent.replace(/<[^>]*>/g, '')
      }));
      setIsEditing(false);
      showNotification('✅ Content updated successfully!', 'success');
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditContent('');
  };

  const addFormattingTag = (tag, attributes = '') => {
    const textarea = document.getElementById('content-editor');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = editContent.substring(start, end);
    const openTag = attributes ? `<${tag} ${attributes}>` : `<${tag}>`;
    const closeTag = `</${tag}>`;
    
    const newContent = editContent.substring(0, start) + 
      openTag + 
      (selectedText || 'Selected text') + 
      closeTag + 
      editContent.substring(end);
    
    setEditContent(newContent);
  };

  // Handle image upload for all templates
  const handleImageUpload = async (event, section) => {
    const file = event.target.files[0];
    if (!file) {
      console.log('No file selected');
      return;
    }

    console.log('Handling image upload for section:', section, 'File:', file.name);

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showNotification('❌ Please upload an image file', 'error');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showNotification('❌ Image size should be less than 5MB', 'error');
      return;
    }

    try {
      setLoading(true);
      showNotification('📤 Uploading image...', 'info');
      
      // Use the API client's uploadEmailImage function
      const imageInfo = await apiClient.uploadEmailImage(file, section.toLowerCase());
      console.log('Upload successful:', imageInfo);

      const imageUrl = imageInfo.public_url;
      if (!imageUrl) {
        throw new Error('No image URL in response');
      }

      // Special handling for flyer template
      if (section === 'flyer') {
        const flyerSection = document.getElementById('flyerSection');
        if (!flyerSection) {
          console.error('Could not find flyerSection element');
          showNotification('❌ Failed to update flyer section - Please try reloading the page', 'error');
          return;
        }

        // Create the new flyer content
        const newContent = `
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="min-height: 800px;">
            <tr>
              <td align="center" valign="middle" style="padding: 0;">
                <img 
                  src="${imageUrl}" 
                  alt="Flyer image" 
                  style="display: block; max-width: 100%; height: auto; border: none; outline: none;"
                  width="100%"
                />
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 10px;">
                <p style="margin: 0; color: #6c757d; font-size: 12px; font-family: Arial, sans-serif;">Click to change flyer</p>
              </td>
            </tr>
          </table>
        `;

        // Update the flyer section
        flyerSection.innerHTML = newContent;
        flyerSection.style.backgroundColor = 'white';
        flyerSection.style.border = 'none';
        flyerSection.style.cursor = 'pointer';

        // Update the email draft
        setEmailDraft(prev => ({
          ...prev,
          html_content: document.getElementById('emailContent').outerHTML
        }));

        showNotification('✅ Flyer uploaded successfully!', 'success');
        return;
      }

      // Handle other templates...
      // ... rest of the code ...
    } catch (error) {
      console.error('Image upload error:', error);
      showNotification(`❌ Upload failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle file attachments
  const [uploadProgress, setUploadProgress] = useState({});

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    
    // Log session ID and files
    console.log('Current session ID:', sessionId);
    console.log('Files to upload:', files.map(f => ({
      name: f.name,
      type: f.type,
      size: `${(f.size / 1024 / 1024).toFixed(2)}MB`
    })));
    
    // Initialize progress for each file
    const initialProgress = {};
    files.forEach(file => {
      initialProgress[file.name] = 0;
    });
    setUploadProgress(initialProgress);
    
    // Validate each file
    for (const file of files) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        showNotification(`❌ File ${file.name} is too large. Maximum size is 10MB`, 'error');
        return;
      }
    }

    setLoading(true);
    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        console.log('Making upload request for:', file.name);
        const response = await axios.post('/api/mailer/upload-attachment', formData, {
          params: { session_id: sessionId },
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: percentCompleted
            }));
          }
        });

        console.log('Upload response:', response.data);

        if (!response.data.success) {
          throw new Error(response.data.message || `Upload failed for ${file.name}`);
        }

        return {
          name: file.name,
          size: file.size,
          type: file.type,
          url: response.data.file_url
        };
      });

      const newAttachments = await Promise.all(uploadPromises);
      console.log('Successfully uploaded files:', newAttachments);
      setAttachments(prev => [...prev, ...newAttachments]);
      showNotification('✅ Files uploaded successfully!', 'success');
    } catch (error) {
      console.error('File upload error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      showNotification(`❌ ${error.response?.data?.message || error.message || 'Failed to upload files. Please try again.'}`, 'error');
    } finally {
      setLoading(false);
      setShowAttachmentModal(false);
      setUploadProgress({});
      event.target.value = '';
    }
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const AttachmentModal = () => (
    <div className="modal" style={{
      display: showAttachmentModal ? 'block' : 'none',
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 1000
    }}>
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '500px'
      }}>
        <h3 style={{ marginTop: 0 }}>Attachments</h3>
        
        <div style={{ marginBottom: '20px' }}>
          <input
            type="file"
            multiple
            onChange={handleFileUpload}
            style={{ marginBottom: '10px' }}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
          />
          <p style={{ margin: '5px 0', color: '#666', fontSize: '14px' }}>
            Supported files: PDF, DOC, DOCX, XLS, XLSX, TXT, ZIP, RAR (Max 10MB each)
          </p>
        </div>

        {/* Upload Progress */}
        {Object.keys(uploadProgress).length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h4>Upload Progress:</h4>
            {Object.entries(uploadProgress).map(([fileName, progress]) => (
              <div key={fileName} style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>{fileName}</span>
                  <span>{progress}%</span>
                </div>
                <div style={{ 
                  width: '100%', 
                  height: '4px', 
                  backgroundColor: '#e9ecef',
                  borderRadius: '2px'
                }}>
                  <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    backgroundColor: '#007bff',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {attachments.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h4>Current Attachments:</h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {attachments.map((file, index) => (
                <li key={index} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px',
                  backgroundColor: '#f8f9fa',
                  marginBottom: '5px',
                  borderRadius: '4px'
                }}>
                  <span>{file.name} ({(file.size / 1024 / 1024).toFixed(2)}MB)</span>
                  <button
                    onClick={() => removeAttachment(index)}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#dc3545',
                      cursor: 'pointer'
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ textAlign: 'right' }}>
          <button
            onClick={() => setShowAttachmentModal(false)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  // Apply template with enhanced functionality for flyer
  const applyTemplate = (templateKey) => {
    const template = emailTemplates[templateKey];
    console.log('Applying template:', templateKey);
    
    // Set the template HTML
    setSelectedTemplate(templateKey);
    setEmailDraft(prev => ({
      ...prev,
      html_content: template.html
    }));

    // Add click handlers for image upload sections
    const setupClickHandlers = () => {
      if (templateKey === 'flyer') {
        const flyerSection = document.getElementById('flyerSection');
        const flyerInput = document.getElementById('flyerImageInput');
        
        if (flyerSection && flyerInput) {
          // Remove any existing handlers
          flyerSection.onclick = null;
          flyerInput.onchange = null;
          
          // Add new handlers
          flyerSection.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            flyerInput.click();
          };
          
          flyerInput.onchange = (event) => {
            if (event.target.files[0]) {
              handleImageUpload(event, 'flyer');
            }
          };
          
          console.log('✅ Flyer handlers setup successfully');
        } else {
          console.error('Missing flyer elements:', {
            flyerSection: !!flyerSection,
            flyerInput: !!flyerInput
          });
        }
      } else {
        // Handle other templates...
        // ... rest of the code ...
      }
    };

    // Wait for the DOM to update before setting up handlers
    setTimeout(setupClickHandlers, 100);

    showNotification(`"${template.name}" template applied successfully`, 'success');
  };
  // Enhanced CSV upload with drag-and-drop
  const handleCsvUpload = async (file) => {
    if (!sessionId || sessionId === 'undefined') {
      showNotification('❌ Session expired. Please log in again.', 'error');
      return;
    }

    if (!file) {
      showNotification('❌ Please select a CSV file', 'error');
      return;
    }
    
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showNotification('❌ Please select a valid CSV file (.csv)', 'error');
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showNotification('❌ File size must be less than 5MB', 'error');
      return;
    }
    
    setLoading(true);
    showNotification('📤 Uploading CSV file...', 'info');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      console.log('Uploading file:', file.name, 'Size:', file.size, 'Type:', file.type);
      console.log('Using session ID:', sessionId);
      
      const response = await axios.post(
        `/api/mailer/upload-csv?session_id=${sessionId}`,
        formData,
        { 
          headers: { 
            'Content-Type': 'multipart/form-data'
          },
          timeout: 30000 // 30 second timeout
        }
      );
      
      console.log('Upload response:', response.data);
      
      if (response.data && response.data.email_count > 0) {
        setEmailData(response.data);
        showNotification(`✅ SUCCESS! Uploaded ${response.data.email_count} email addresses from ${response.data.filename}`, 'success');
        setActiveTab('draft'); // Move to next step automatically
      } else if (response.data && response.data.email_count === 0) {
        showNotification('⚠️ No valid email addresses found in the CSV file. Please check your CSV format.', 'error');
      } else {
        showNotification('❌ Unexpected response format from server', 'error');
      }
    } catch (error) {
      console.error('CSV Upload Error:', error);
      let errorMessage = 'Failed to upload CSV file';
      
      if (error.response) {
        if (error.response.status === 400) {
          errorMessage = error.response.data?.detail || 'Invalid file format or content';
        } else if (error.response.status === 413) {
          errorMessage = 'File too large. Please use a smaller CSV file.';
        } else if (error.response.status === 401) {
          errorMessage = 'Session expired. Please refresh the page.';
        } else {
          errorMessage = error.response.data?.detail || `Server error: ${error.response.status}`;
        }
      } else if (error.request) {
        errorMessage = 'Network error - please check your connection and try again';
      } else {
        errorMessage = error.message || 'Unexpected error occurred';
      }
      
      showNotification(`❌ Upload failed: ${errorMessage}`, 'error');
    } finally {
      setLoading(false);
    }
  };
  // Send test email
  const sendTestEmail = async () => {
    if (!testEmail) {
      showNotification('❌ Please enter a test email address', 'error');
      return;
    }
    
    setLoading(true);
    try {
      await axios.post(`/api/mailer/send-test?session_id=${sessionId}`, {
        subject: emailDraft.subject,
        html_content: emailDraft.html_content,
        text_content: emailDraft.text_content,
        sender_name: emailDraft.sender_name,
        sender_email: emailDraft.sender_email,
        test_send: true,
        test_email: testEmail
      });
      
      showNotification('✅ Test email sent successfully!', 'success');
    } catch (error) {
      console.error('Test Email Error:', error);
      showNotification('❌ Failed to send test email. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load report summary
  const loadReportSummary = useCallback(async () => {
    if (!sessionId || sessionId === 'undefined') {
      showNotification('❌ Session expired. Please log in again.', 'error');
      return;
    }
    
    setLoadingReport(true);
    try {
      const response = await axios.get(`/api/mailer/report-summary?session_id=${sessionId}`);
      setReportSummary(response.data);
    } catch (error) {
      console.error('Error loading report:', error);
      showNotification('❌ Failed to load report summary', 'error');
    } finally {
      setLoadingReport(false);
    }
  }, [sessionId, showNotification]);

  // Load report summary when tab changes to reports
  useEffect(() => {
    if (activeTab === 'reports' && sessionId && sessionId !== 'undefined') {
      loadReportSummary();
    }
  }, [activeTab, sessionId, loadReportSummary]);

  // Modified sendCampaign to update reports
  const sendCampaign = async () => {
    if (!showConfirm('Are you sure you want to send this campaign to all recipients?')) {
      return;
    }
    
    setLoading(true);
    try {
      await axios.post(`/api/mailer/send-campaign?session_id=${sessionId}`, {
        subject: emailDraft.subject,
        html_content: emailDraft.html_content,
        text_content: emailDraft.text_content,
        sender_name: emailDraft.sender_name,
        sender_email: emailDraft.sender_email
      });
      
      showNotification('✅ Campaign sent successfully!', 'success');
      // Load fresh report data after campaign is sent
      await loadReportSummary();
      setActiveTab('reports');
    } catch (error) {
      console.error('Campaign Send Error:', error);
      showNotification('❌ Failed to send campaign. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Clear session data
  const clearSessionData = async () => {
    if (!showConfirm('Are you sure you want to clear all email data? This action cannot be undone.')) {
      return;
    }
    
    setLoading(true);
    try {
      await axios.delete(`/api/mailer/clear-session?session_id=${sessionId}`);
      setEmailData({ emails: [], email_count: 0, filename: null });
      setEmailDraft({
        subject: '',
        html_content: '',
        text_content: '',
        sender_name: 'Social Media Assistant',
        sender_email: 'support@hogist.com'
      });
      showNotification('Session data cleared successfully', 'success');
      setActiveTab('upload');
    } catch (error) {
      showNotification('Failed to clear session data', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mailer-container">
      {/* Header */}
      <div className="page-header" style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '2rem',
        borderRadius: '12px',
        marginBottom: '2rem',
        textAlign: 'left'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: '700',
              margin: '0 0 0.5rem 0',
              textShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              Email Marketing Automation
            </h1>
            <p style={{
              fontSize: '1.1rem',
              margin: 0,
              opacity: 0.9
            }}>
              Upload contacts, generate AI emails, and send marketing campaigns
            </p>
          </div>
          <button
            onClick={clearSessionData}
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Trash2 size={16} />
            Clear Session
          </button>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div style={{
          background: notification.type === 'error' ? '#fee2e2' : notification.type === 'success' ? '#dcfce7' : '#dbeafe',
          color: notification.type === 'error' ? '#dc2626' : notification.type === 'success' ? '#16a34a' : '#2563eb',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {notification.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
          {notification.message}
        </div>
      )}

      {/* Progress Indicator */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '2rem',
        background: 'white',
        borderRadius: '12px',
        padding: '1rem',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
      }}>
        {tabs.map((tab, index) => (
          <div key={tab.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: activeTab === tab.id ? '#667eea' : '#9ca3af'
          }}>
            <div style={{
              width: '2rem',
              height: '2rem',
              borderRadius: '50%',
              background: activeTab === tab.id ? '#667eea' : '#e5e7eb',
              color: activeTab === tab.id ? 'white' : '#6b7280',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              fontWeight: 'bold'
            }}>
              {index + 1}
            </div>
            <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{tab.label}</span>
          </div>
        ))}
      </div>

      {/* Navigation Tabs */}
      <div className="tabs-navigation" style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '2rem',
        borderBottom: '2px solid #e5e7eb',
        paddingBottom: '1rem'
      }}>
        {tabs.map((tab) => {
          const IconComponent = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '8px',
                background: activeTab === tab.id ? '#667eea' : 'transparent',
                color: activeTab === tab.id ? 'white' : '#6b7280',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
            >
              <IconComponent size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="tab-content" style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        minHeight: '500px'
      }}>
        {/* Draft Email Tab */}
        {activeTab === 'draft' && (
          <div>
            <h2 style={{ marginBottom: '1rem', color: '#374151' }}>Draft Your Email</h2>
            <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
              Create your email content with AI generation or visual email builder.
            </p>

            {/* AI Generation Section */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '2rem'
            }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', color: '#374151' }}>
                <Wand2 size={20} />
                AI Email Generator
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                    Email Purpose
                  </label>
                  <select
                    value={aiPrompt.purpose}
                    onChange={(e) => setAiPrompt({ ...aiPrompt, purpose: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="marketing">Marketing</option>
                    <option value="newsletter">Newsletter</option>
                    <option value="promotion">Promotion</option>
                    <option value="announcement">Announcement</option>
                    <option value="follow-up">Follow-up</option>
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                    Tone
                  </label>
                  <select
                    value={aiPrompt.tone}
                    onChange={(e) => setAiPrompt({ ...aiPrompt, tone: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="casual">Casual</option>
                    <option value="formal">Formal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                  Email Content Prompt
                </label>
                <textarea
                  value={aiPrompt.prompt}
                  onChange={(e) => setAiPrompt({ ...aiPrompt, prompt: e.target.value })}
                  placeholder="Describe what you want the email to be about. E.g., 'Promote our new social media management service with a 20% discount for new customers'"
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    resize: 'vertical'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                  Custom Instructions (Optional)
                </label>
                <textarea
                  value={aiPrompt.custom_instructions}
                  onChange={(e) => setAiPrompt({ ...aiPrompt, custom_instructions: e.target.value })}
                  placeholder="Add any specific instructions for the AI generator..."
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    resize: 'vertical'
                  }}
                />
              </div>
              
              <button
                onClick={generateEmailWithAI}
                disabled={loading}
                style={{
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Wand2 size={18} />
                {loading ? 'Generating...' : 'Generate Email'}
              </button>
            </div>

            {/* Email Templates Section */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '2rem'
            }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#374151' }}>Email Templates</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                  <button
                  onClick={() => applyTemplate('basic')}
                    style={{
                      background: 'white',
                    border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '1rem',
                    textAlign: 'left',
                      cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>Clean and Simple Layout</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>A clean, professional email template</div>
                </button>

                <button
                  onClick={() => applyTemplate('promotional')}
                  style={{
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1rem',
                      textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>Eye-catching Promotional</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Perfect for promotions and offers</div>
                </button>

                <button
                  onClick={() => applyTemplate('flyer')}
                  style={{
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>Make Flyer</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Create a visual flyer with images</div>
                </button>
              </div>
            </div>

            {/* Email Details and Preview Section */}
            <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
              {/* Email Details Section */}
              <div style={{
                flex: '1',
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '1.5rem'
              }}>
                <h3 style={{ margin: '0 0 1.5rem 0', color: '#374151' }}>Email Details</h3>

                <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                      Sender Name
                    </label>
                    <input
                      type="text"
                      value={emailDraft.sender_name}
                      onChange={(e) => setEmailDraft({ ...emailDraft, sender_name: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                      Sender Email
                    </label>
                    <input
                      type="email"
                      value={emailDraft.sender_email}
                      onChange={(e) => setEmailDraft({ ...emailDraft, sender_email: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '1rem'
                      }}
                    />
                </div>
                
                  <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                    Subject Line
                  </label>
                  <input
                    type="text"
                    value={emailDraft.subject}
                    onChange={(e) => setEmailDraft({ ...emailDraft, subject: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  />
                  </div>
                </div>

                {/* Image Upload Section */}
                <div style={{ marginTop: '2rem' }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#374151' }}>Images</h3>
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    <div>
                      <label
                        htmlFor="header-image"
                    style={{
                          display: 'block',
                          padding: '1.5rem',
                      border: '2px dashed #d1d5db',
                      borderRadius: '8px',
                          cursor: 'pointer',
                          textAlign: 'center'
                    }}
                  >
                  <input
                    type="file"
                          id="header-image"
                    accept="image/*"
                          onChange={(e) => handleImageUpload(e, 'header')}
                    style={{ display: 'none' }}
                        />
                        <div style={{ marginBottom: '0.5rem', color: '#374151' }}>Header Image</div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Click to upload</div>
                      </label>
                    </div>

                    <div>
                      <label
                        htmlFor="content-image"
                        style={{
                          display: 'block',
                          padding: '1.5rem',
                          border: '2px dashed #d1d5db',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        <input
                          type="file"
                          id="content-image"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(e, 'content')}
                          style={{ display: 'none' }}
                        />
                        <div style={{ marginBottom: '0.5rem', color: '#374151' }}>Content Image</div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Click to upload</div>
                      </label>
                    </div>

                    <div>
                      <label
                        htmlFor="footer-image"
                            style={{
                          display: 'block',
                          padding: '1.5rem',
                          border: '2px dashed #d1d5db',
                          borderRadius: '8px',
                              cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        <input
                          type="file"
                          id="footer-image"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(e, 'footer')}
                          style={{ display: 'none' }}
                        />
                        <div style={{ marginBottom: '0.5rem', color: '#374151' }}>Footer Image</div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Click to upload</div>
                      </label>
                      </div>
                    </div>
                </div>
                </div>

              {/* Content Editor and Preview Section */}
              <div style={{ flex: '1' }}>
                {/* Edit Content Section */}
                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, color: '#374151' }}>Edit Content</h3>
                    {!isEditing ? (
                    <button
                        onClick={startEditing}
                      style={{
                          background: '#667eea',
                        color: 'white',
                        border: 'none',
                          borderRadius: '6px',
                          padding: '0.75rem 1.5rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                          gap: '0.5rem',
                          fontSize: '0.9rem',
                          fontWeight: '500'
                      }}
                    >
                        <Eye size={16} />
                        Edit Content
                    </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                          onClick={saveEdits}
                      style={{
                            background: '#10b981',
                        color: 'white',
                        border: 'none',
                            borderRadius: '6px',
                            padding: '0.75rem 1.5rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                        fontSize: '0.9rem',
                            fontWeight: '500'
                          }}
                        >
                          <CheckCircle size={16} />
                          Save Changes
                        </button>
                        <button
                          onClick={cancelEditing}
                          style={{
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '0.75rem 1.5rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.9rem',
                            fontWeight: '500'
                      }}
                    >
                          <AlertCircle size={16} />
                          Cancel
                    </button>
                      </div>
                  )}
                </div>

                  {isEditing && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        <button
                          onClick={() => addFormattingTag('strong')}
                          style={{
                            padding: '0.5rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            background: 'white',
                            cursor: 'pointer'
                          }}
                          title="Bold"
                        >
                          <strong>B</strong>
                        </button>
                        <button
                          onClick={() => addFormattingTag('em')}
                          style={{
                            padding: '0.5rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            background: 'white',
                            cursor: 'pointer'
                          }}
                          title="Italic"
                        >
                          <em>I</em>
                        </button>
                        <button
                          onClick={() => addFormattingTag('u')}
                          style={{
                            padding: '0.5rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            background: 'white',
                            cursor: 'pointer'
                          }}
                          title="Underline"
                        >
                          <u>U</u>
                        </button>
                        <button
                          onClick={() => addFormattingTag('a', 'href="https://example.com"')}
                          style={{
                            padding: '0.5rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            background: 'white',
                            cursor: 'pointer'
                          }}
                          title="Add Link"
                        >
                          🔗
                        </button>
                        <div style={{ marginBottom: '10px' }}>
                          <button
                            type="button"
                            onClick={() => setShowAttachmentModal(true)}
                            style={styles.attachmentButton}
                            title="Add attachments"
                          >
                            <Paperclip size={16} />
                            <span>Attachments</span>
                            {attachments.length > 0 && (
                              <span style={styles.attachmentBadge}>{attachments.length}</span>
                            )}
                          </button>
                        </div>
                        {attachments.length > 0 && (
                          <div style={styles.attachmentList}>
                            <strong>Attached files ({attachments.length}):</strong>
                            <ul style={{ margin: '5px 0', padding: '0 0 0 20px' }}>
                              {attachments.map((file, index) => (
                                <li key={index} style={{ marginBottom: '5px' }}>
                                  {file.name} ({(file.size / 1024 / 1024).toFixed(2)}MB)
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <textarea
                        id="content-editor"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '300px',
                          padding: '1rem',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          fontFamily: 'monospace',
                          fontSize: '14px',
                          lineHeight: '1.5',
                          resize: 'vertical'
                        }}
                      />
                    </div>
                  )}
              </div>

                {/* Email Preview */}
                <div>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#374151' }}>Email Preview</h3>
                  <div
                    id="email-preview"
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '1rem',
                      maxHeight: '600px',
                      overflowY: 'auto',
                      marginBottom: '1rem'
                    }}
                    dangerouslySetInnerHTML={{ __html: emailDraft.html_content }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button
                      onClick={() => setActiveTab('send')}
                      style={{
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.75rem 1.5rem',
                        fontSize: '1rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}
                    >
                      <Send size={18} />
                      Send Campaign
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Upload Emails Tab */}
        {activeTab === 'upload' && (
          <div>
            <h2 style={{ marginBottom: '1rem', color: '#374151' }}>Upload Email List</h2>
            <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
              Upload a CSV file containing email addresses. The CSV should have a column named 'email', 'emails', or 'email_address'.
            </p>
            
            {emailData.email_count > 0 && (
                <div style={{
                background: '#f0f9ff',
                border: '1px solidrgb(159, 94, 225)',
                      borderRadius: '8px',
                      padding: '1rem',
                marginBottom: '2rem'
              }}>
                <h3 style={{ color: '#0369a1', margin: '0 0 0.5rem 0' }}>
                  ✅ {emailData.email_count} verified emails loaded from {emailData.filename}
                </h3>
                <p style={{ color: '#0369a1', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
                  Preview: {emailData.emails?.slice(0, 5).join(', ')}
                  {emailData.email_count > 5 && ` and ${emailData.email_count - 5} more...`}
                </p>
                {emailData.verification_summary && (
                  <div style={{ 
                    background: 'rgba(6, 105, 161, 0.1)', 
                    borderRadius: '6px', 
                    padding: '0.75rem', 
                    marginTop: '0.5rem' 
                  }}>
                    <p style={{ color: '#0369a1', margin: 0, fontSize: '0.85rem', fontWeight: '500' }}>
                      📊 Verification Summary: {emailData.verification_summary.passed_verification} valid / {emailData.verification_summary.total_verified} total 
                      ({emailData.verification_summary.verification_rate}% valid rate)
                      </p>
                    </div>
                )}
              </div>
            )}
            
            {/* Enhanced CSV upload with drag-and-drop */}
            <div
              style={{
                border: `2px dashed ${dragActive ? '#667eea' : '#d1d5db'}`,
                borderRadius: '12px',
                padding: '3rem',
                textAlign: 'center',
                background: dragActive ? '#f5f3ff' : '#f9fafb',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onClick={() => document.getElementById('csv-upload').click()}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload size={48} style={{ color: dragActive ? '#667eea' : '#9ca3af', marginBottom: '1rem' }} />
              <h3 style={{ color: '#374151', marginBottom: '0.5rem' }}>
                {dragActive ? 'Drop CSV File Here' : emailData.email_count > 0 ? 'Upload New CSV File' : 'Upload CSV File'}
              </h3>
              <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
                {dragActive ? 'Release to upload' : 'Click to select a CSV file or drag and drop here'}
              </p>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={(e) => handleCsvUpload(e.target.files[0])}
              />
              <button
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
                disabled={loading}
              >
                {loading ? 'Uploading...' : 'Select CSV File'}
              </button>
              {loading && (
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ 
                    width: '20px', 
                    height: '20px', 
                    borderRadius: '50%', 
                    border: '3px solid rgba(102, 126, 234, 0.3)',
                    borderTopColor: '#667eea',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                  <style>{`
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                  `}</style>
                  <span style={{ marginLeft: '0.5rem', color: '#667eea' }}>Processing...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Send Campaign Tab */}
        {activeTab === 'send' && (
          <div>
            <h2 style={{ marginBottom: '1rem', color: '#374151' }}>Send Email Campaign</h2>
            <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
              Review your campaign details and send to your email list.
            </p>

            {/* Campaign Summary */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '2rem'
            }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#374151' }}>Campaign Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: '500', color: '#374151' }}>Recipients:</p>
                  <p style={{ margin: '0 0 1rem 0', color: '#6b7280' }}>{emailData.email_count} email addresses</p>
                  
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: '500', color: '#374151' }}>Subject:</p>
                  <p style={{ margin: '0 0 1rem 0', color: '#6b7280' }}>{emailDraft.subject || 'No subject set'}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: '500', color: '#374151' }}>Sender:</p>
                  <p style={{ margin: '0 0 1rem 0', color: '#6b7280' }}>{emailDraft.sender_name} ({emailDraft.sender_email})</p>
                </div>
              </div>
            </div>

            {/* Test Email */}
            <div style={{
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '2rem'
            }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#ea580c' }}>Send Test Email</h3>
              <p style={{ margin: '0 0 1rem 0', color: '#ea580c' }}>
                Send a test email to yourself before launching the campaign.
              </p>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                    Test Email Address
                  </label>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="your@email.com"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
                <button
                  onClick={sendTestEmail}
                  disabled={loading || !testEmail || !emailDraft.subject || !emailDraft.html_content}
                  style={{
                    background: loading || !testEmail || !emailDraft.subject || !emailDraft.html_content ? '#9ca3af' : '#ea580c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: loading || !testEmail || !emailDraft.subject || !emailDraft.html_content ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {loading ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            </div>

            {/* Send Campaign */}
            <div style={{
              background: '#f0f9ff',
              border: '1px solid #0ea5e9',
              borderRadius: '12px',
              padding: '1.5rem'
            }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#0369a1' }}>Launch Campaign</h3>
              <p style={{ margin: '0 0 1rem 0', color: '#0369a1' }}>
                Ready to send your email to {emailData.email_count} recipients?
              </p>
              <button
                onClick={sendCampaign}
                disabled={loading || emailData.email_count === 0 || !emailDraft.subject || !emailDraft.html_content}
                style={{
                  background: loading || emailData.email_count === 0 || !emailDraft.subject || !emailDraft.html_content 
                    ? '#9ca3af' 
                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  fontWeight: '600',
                  cursor: loading || emailData.email_count === 0 || !emailDraft.subject || !emailDraft.html_content 
                    ? 'not-allowed' 
                    : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Send size={20} />
                {loading ? 'Sending Campaign...' : `Send to ${emailData.email_count} Recipients`}
              </button>
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '2rem'
            }}>
              <div>
                <h2 style={{ marginBottom: '0.5rem', color: '#374151' }}>Campaign Reports</h2>
                <p style={{ color: '#6b7280', margin: 0 }}>
                  View detailed reports and logs of your email campaigns.
                </p>
              </div>
              <a
                href="https://app.brevo.com/transactional/email/logs"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  textDecoration: 'none'
                }}
              >
                <Eye size={16} />
                View Detailed Logs
              </a>
            </div>

            {loadingReport ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '300px',
                color: '#6b7280'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <BarChart3 size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <p>Loading campaign reports...</p>
                </div>
              </div>
            ) : reportSummary && reportSummary.total_emails > 0 ? (
              <div>
                {/* Summary Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '2rem'
                }}>
                  <div style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    textAlign: 'center'
                  }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem', fontWeight: '700' }}>
                      {reportSummary.total_emails}
                    </h3>
                    <p style={{ margin: 0, opacity: 0.9 }}>Total Emails</p>
                  </div>

                  <div style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    textAlign: 'center'
                  }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem', fontWeight: '700' }}>
                      {reportSummary.sent_count}
                    </h3>
                    <p style={{ margin: 0, opacity: 0.9 }}>Successfully Sent</p>
                  </div>

                  <div style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: 'white',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    textAlign: 'center'
                  }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem', fontWeight: '700' }}>
                      {reportSummary.failed_count}
                    </h3>
                    <p style={{ margin: 0, opacity: 0.9 }}>Failed to Send</p>
                  </div>

                  <div style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    textAlign: 'center'
                  }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem', fontWeight: '700' }}>
                      {reportSummary.success_rate}%
                    </h3>
                    <p style={{ margin: 0, opacity: 0.9 }}>Success Rate</p>
                  </div>
                </div>

                {/* Refresh Button */}
                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={loadReportSummary}
                    disabled={loadingReport}
                    style={{
                      background: 'transparent',
                      color: '#667eea',
                      border: '2px solid #667eea',
                      borderRadius: '8px',
                      padding: '0.75rem 1.5rem',
                      fontSize: '1rem',
                      fontWeight: '500',
                      cursor: loadingReport ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <BarChart3 size={16} />
                    {loadingReport ? 'Refreshing...' : 'Refresh Reports'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '400px',
                color: '#9ca3af',
                textAlign: 'center'
              }}>
                <div>
                  <BarChart3 size={64} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem', fontWeight: '600' }}>
                    No Campaign Reports Available
                  </h3>
                  <p style={{ fontSize: '1rem', margin: '0 0 1rem 0' }}>
                    Send your first email campaign to generate reports.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <AttachmentModal />
    </div>
  );
};

export default Mailer;


