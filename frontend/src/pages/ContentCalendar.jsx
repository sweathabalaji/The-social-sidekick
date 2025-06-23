import React, { useState, useEffect } from 'react';
import '../styles/ContentCalendar.css';

const ContentCalendar = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [numDays, setNumDays] = useState(14);
  const [foodStyle, setFoodStyle] = useState(['Both']);
  const [promotionFocus, setPromotionFocus] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [generatedCalendar, setGeneratedCalendar] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [viewMode, setViewMode] = useState('grid');

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const foodStyles = ['South Indian', 'North Indian', 'Both'];
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];

  const calendarTemplates = [
    {
      id: 'festive_season',
      name: '🎉 Festive Season Special',
      description: 'Focus on traditional festivals and seasonal celebrations',
      promotion_focus: 'festive specials, traditional sweets, family meals, celebration combos',
      food_style: ['Both'],
      num_days: 15
    },
    {
      id: 'health_wellness',
      name: '🥗 Health & Wellness Focus',
      description: 'Emphasize nutritious and healthy food options',
      promotion_focus: 'healthy options, nutritious meals, balanced diet, organic ingredients',
      food_style: ['South Indian'],
      num_days: 14
    },
    {
      id: 'summer_special',
      name: '☀️ Summer Specials',
      description: 'Light, refreshing meals perfect for summer',
      promotion_focus: 'summer specials, cool beverages, light meals, refreshing dishes',
      food_style: ['Both'],
      num_days: 21
    },
    {
      id: 'student_budget',
      name: '🎓 Student Budget Meals',
      description: 'Affordable, filling meals for students',
      promotion_focus: 'budget meals, student offers, quick delivery, value combos',
      food_style: ['North Indian'],
      num_days: 10
    },
    {
      id: 'weekend_indulgence',
      name: '🍽️ Weekend Indulgence',
      description: 'Rich, elaborate meals for weekend treats',
      promotion_focus: 'weekend specials, family platters, premium dishes, indulgent treats',
      food_style: ['Both'],
      num_days: 8
    }
  ];

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 7000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleFoodStyleChange = (style) => {
    setFoodStyle(prev => {
      if (prev.includes(style)) {
        return prev.filter(s => s !== style);
      } else {
        return [...prev, style];
      }
    });
  };

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template.id);
    setPromotionFocus(template.promotion_focus);
    setFoodStyle(template.food_style);
    setNumDays(template.num_days);
  };

  const generateCalendar = async () => {
    if (foodStyle.length === 0) {
      setError('Please select at least one food style');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/generate-calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          num_days: numDays,
          food_style: foodStyle,
          promotion_focus: promotionFocus,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to generate calendar');
      }

      const data = await response.json();
      setGeneratedCalendar(data.calendar);
      setSuccessMessage(`✅ Successfully generated ${data.calendar.length} days of content!`);
    } catch (err) {
      setError('Error generating content calendar: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!generatedCalendar) return;
    const csvContent = [
      ['Date', 'Topic', 'Post Idea', 'Instagram Feature', 'Hashtags'],
      ...generatedCalendar.map(item => [
        item.date, item.topic, item.post_idea, item.instagram_feature, item.hashtags
      ])
    ].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `content_calendar_${months[selectedMonth - 1]}_${selectedYear}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    if (!generatedCalendar) return;
    const jsonContent = JSON.stringify(generatedCalendar, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `content_calendar_${months[selectedMonth - 1]}_${selectedYear}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const copyToClipboard = async () => {
    if (!generatedCalendar) return;
    const textContent = generatedCalendar.map(item => 
      `📅 ${item.date}\n🎯 ${item.topic}\n💡 ${item.post_idea}\n📱 ${item.instagram_feature}\n🏷️ ${item.hashtags}\n\n`
    ).join('');

    try {
      await navigator.clipboard.writeText(textContent);
      setSuccessMessage('📋 Content copied to clipboard!');
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  const getInstagramFeatureIcon = (feature) => {
    switch (feature?.toLowerCase()) {
      case 'reel': return '🎬';
      case 'story': return '📱';
      case 'carousel': return '🔄';
      case 'static post': return '📸';
      default: return '📝';
    }
  };

  const getInstagramFeatureColor = (feature) => {
    switch (feature?.toLowerCase()) {
      case 'reel': return '#FF3040';
      case 'story': return '#833AB4';
      case 'carousel': return '#405DE6';
      case 'static post': return '#C13584';
      default: return '#666';
    }
  };

  const getCalendarStats = () => {
    if (!generatedCalendar) return null;
    return {
      total: generatedCalendar.length,
      reels: generatedCalendar.filter(item => item.instagram_feature?.toLowerCase() === 'reel').length,
      stories: generatedCalendar.filter(item => item.instagram_feature?.toLowerCase() === 'story').length,
      carousels: generatedCalendar.filter(item => item.instagram_feature?.toLowerCase() === 'carousel').length,
      staticPosts: generatedCalendar.filter(item => item.instagram_feature?.toLowerCase() === 'static post').length,
    };
  };

  const groupContentByWeek = () => {
    if (!generatedCalendar) return [];
    const weeks = [];
    let currentWeek = [];
    
    generatedCalendar.forEach((item, index) => {
      currentWeek.push(item);
      if (currentWeek.length === 7 || index === generatedCalendar.length - 1) {
        weeks.push([...currentWeek]);
        currentWeek = [];
      }
    });
    return weeks;
  };

  const stats = getCalendarStats();
  const weeklyGroups = groupContentByWeek();
  
  const resetCalendar = () => {
    setGeneratedCalendar(null);
    setSuccessMessage('');
    setError('');
  };

  return (
    <div className="content-calendar">
      <div className="calendar-header">
        <h1>AI Content Calendar</h1>
      </div>

      {successMessage && <div className="success-message">{successMessage}</div>}
      {error && <div className="error-message">⚠️ {error}</div>}

      {!generatedCalendar && (
        <>
          <div className="calendar-templates">
            <h3>📋 Quick Templates</h3>
            <div className="templates-grid">
              {calendarTemplates.map(template => (
                <div 
                  key={template.id} 
                  className={`template-card ${selectedTemplate === template.id ? 'selected' : ''}`}
                  onClick={() => handleTemplateSelect(template)}
                >
                  <h4>{template.name}</h4>
                  <p>{template.description}</p>
                  <div className="template-details">
                    <span className="template-detail">📅 {template.num_days} days</span>
                    <span className="template-detail">🍽️ {template.food_style.join(', ')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="calendar-form">
            <h3>⚙️ Customize Your Calendar</h3>
            
            <div className="form-grid">
              <div className="form-group">
                <label>Select Month</label>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="form-select">
                  {months.map((month, index) => (
                    <option key={month} value={index + 1}>{month}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Select Year</label>
                <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="form-select">
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Number of Days</label>
                <input 
                  type="number" min="7" max="31" value={numDays}
                  onChange={(e) => setNumDays(parseInt(e.target.value))} className="form-input"
        />
      </div>
            </div>

            <div className="form-group">
              <label>Food Style(s)</label>
              <div className="checkbox-group">
                {foodStyles.map(style => (
                  <label key={style} className="checkbox-label">
                    <input type="checkbox" checked={foodStyle.includes(style)} onChange={() => handleFoodStyleChange(style)} />
                    <span className="checkbox-text">{style}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Promotion Focus</label>
              <textarea
                value={promotionFocus} onChange={(e) => setPromotionFocus(e.target.value)}
                placeholder="e.g., 'summer specials', 'healthy options', 'festive deals'"
                className="form-textarea" rows={3}
              />
              <small className="form-help">Describe any specific themes, promotions, or campaigns you want to focus on</small>
            </div>

            <button 
              onClick={generateCalendar} disabled={isLoading || foodStyle.length === 0} className="generate-btn"
            >
              {isLoading ? (
                <><div className="spinner"></div>Generating Calendar...</>
              ) : (
                <>✨ Generate Content Calendar</>
              )}
            </button>
          </div>
        </>
      )}

      {generatedCalendar && (
        <div className="calendar-results-clean">
          <div className="results-header-clean">
            <div className="results-summary">
              <h2>🎯 Content Calendar</h2>
              <p>{months[selectedMonth - 1]} {selectedYear} • {generatedCalendar.length} posts</p>
            </div>
            
            <div className="results-controls">
              <div className="view-toggle">
                <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>⊞</button>
                <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>☰</button>
                <button className={`view-btn ${viewMode === 'timeline' ? 'active' : ''}`} onClick={() => setViewMode('timeline')}>📅</button>
              </div>
              
              <div className="action-buttons">
                <button onClick={downloadCSV} className="action-btn csv" title="Download CSV">📊</button>
                <button onClick={downloadJSON} className="action-btn json" title="Download JSON">📄</button>
                <button onClick={copyToClipboard} className="action-btn copy" title="Copy to Clipboard">📋</button>
                <button onClick={resetCalendar} className="action-btn reset" title="Generate New Calendar">🔄</button>
              </div>
            </div>
          </div>

          {stats && (
            <div className="stats-bar">
              <div className="stat-item total">
                <span className="stat-number">{stats.total}</span>
                <span className="stat-label">Total</span>
              </div>
              <div className="stat-item reel">
                <span className="stat-number">{stats.reels}</span>
                <span className="stat-label">Reels</span>
              </div>
              <div className="stat-item story">
                <span className="stat-number">{stats.stories}</span>
                <span className="stat-label">Stories</span>
              </div>
              <div className="stat-item carousel">
                <span className="stat-number">{stats.carousels}</span>
                <span className="stat-label">Carousels</span>
              </div>
              <div className="stat-item post">
                <span className="stat-number">{stats.staticPosts}</span>
                <span className="stat-label">Posts</span>
              </div>
            </div>
          )}

          <div className="calendar-content">
            {viewMode === 'grid' && (
              <div className="grid-view">
                {generatedCalendar.map((item, index) => (
                  <div key={index} className="content-card">
                    <div className="card-header-clean">
                      <div className="card-date-clean">
                        {new Date(item.date).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', weekday: 'short'
                        })}
                      </div>
                      <div className="feature-badge" style={{ backgroundColor: getInstagramFeatureColor(item.instagram_feature) }}>
                        {getInstagramFeatureIcon(item.instagram_feature)}
                      </div>
                    </div>
                    <div className="card-body-clean">
                      <h3 className="content-topic">{item.topic}</h3>
                      <p className="content-idea">{item.post_idea}</p>
                      <div className="content-hashtags">{item.hashtags}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {viewMode === 'list' && (
              <div className="list-view">
                {generatedCalendar.map((item, index) => (
                  <div key={index} className="list-item">
                    <div className="item-header">
                      <div className="item-date">
                        {new Date(item.date).toLocaleDateString('en-US', {
                          weekday: 'long', month: 'long', day: 'numeric'
                        })}
                      </div>
                      <div className="item-badge" style={{ backgroundColor: getInstagramFeatureColor(item.instagram_feature) }}>
                        {getInstagramFeatureIcon(item.instagram_feature)} {item.instagram_feature}
                      </div>
                    </div>
                    <div className="item-content">
                      <h3>{item.topic}</h3>
                      <p>{item.post_idea}</p>
                      <div className="item-hashtags">{item.hashtags}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {viewMode === 'timeline' && (
              <div className="timeline-view">
                {weeklyGroups.map((week, weekIndex) => (
                  <div key={weekIndex} className="timeline-week">
                    <div className="week-header">
                      <h3>Week {weekIndex + 1}</h3>
                      <span className="week-dates">
                        {new Date(week[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - 
                        {new Date(week[week.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="week-grid">
                      {week.map((item, dayIndex) => (
                        <div key={dayIndex} className="day-item">
                          <div className="day-header">
                            <div className="day-date">
                              {new Date(item.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                            </div>
                            <div className="day-badge" style={{ backgroundColor: getInstagramFeatureColor(item.instagram_feature) }}>
                              {getInstagramFeatureIcon(item.instagram_feature)}
                            </div>
                          </div>
                          <div className="day-content">
                            <h4>{item.topic}</h4>
                            <p>{item.post_idea}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentCalendar;