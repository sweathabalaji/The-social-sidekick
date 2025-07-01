# 📊 Social Media Automation & Analytics Assistant

![Dashboard Preview](./assets/dashboard_preview.png)

A powerful AI-powered assistant to help businesses and creators optimize their social media strategy for Instagram and Facebook. Combines data analytics, post scheduling, and Email campaign automation in one seamless platform.

---

## 🚀 Features

### 📅 Content Calender 
- Organize and manage all your upcoming content in one place using our smart, intuitive calendar system. Plan posts, upload media, and let AI do the heavy lifting.


### 📅 Post Scheduling
- Upload media (image, reel, video, carousel)
- Generate AI captions via **Google Gemini**
- Auto-suggest best times to post
- Schedule to **Instagram**, **Facebook**, or both

### 🔍 Analytics & Insights
- **Audience Activity Heatmaps**
- **Post Performance Tracking**
- **Optimal Posting Time Recommendations**
- **Engagement Trends Over Time**
- **Follower Growth Visualization**

### 📬 Email Campaign Automation
- Upload email lists (.csv)
- AI-generated promotional emails
- Choose from 3 responsive templates
- Send via **Brevo**
- Track open/click rates & delivery status

---

## 🧠 How It Works

### User Workflow

1️⃣ **User Login**  
→ Login via secure dashboard.

2️⃣ **Dashboard Overview**  
→ View total followers, reach, engagement, and post schedule.

3️⃣ **Content Scheduler**  
→ Upload media → Generate AI captions → Choose platform → Schedule.

4️⃣ **Content Calendar**  
→ Visualize scheduled posts using weekly/monthly view. Use built-in templates.

5️⃣ **Analytics Dashboard**  
→ Visual trends for followers, engagement, content performance.

6️⃣ **Email Campaign Manager**  
→ Upload CSV → Generate email (with AI) → Choose layout → Send → View reports.

---

## 🛠️ Tech Stack

| Layer         | Technologies                              |
|--------------|-------------------------------------------|
| Frontend     | ReactJS, REST APIs                        |
| Backend      | FastAPI (Python), Celery                  |
| Asynchronous | Celery, Redis (as broker & cache)         |
| Media        | Cloudinary (uploads, CDN)                 |
| AI           | Google Gemini API                         |
| Social API   | Meta Graph API (Instagram & Facebook)     |
| Email API    | Brevo (for campaigns and logs)            |

---

## 🖥️ Local Setup Instructions

### ✅ Prerequisites
- Python 3.8+
- Node.js 16+
- Redis Server

---

### 📦 Step-by-Step Setup

#### 1. Install Redis

```bash
# macOS
brew install redis

# Linux
sudo apt-get install redis-server

# Windows
# Follow: https://redis.io/docs/getting-started/installation/install-redis-on-windows/


To run this application locally, you need to have **Redis** installed and running, and then start **Celery Worker**, **Celery Beat**, and the **Streamlit app** in separate terminal windows.

**1. Install Redis:**
   - On macOS: `brew install redis`
   - On Linux: `sudo apt-get install redis-server`
   - On Windows: Follow instructions [here](https://redis.io/docs/getting-started/installation/install-redis-on-windows/)

**2. Start Redis Server:**
   - Open a terminal and run: `redis-server`

**3. Install Python dependencies:**
   - `pip install -r requirements.txt`
     Also run the below mentioned command to install the node modules from package.json:
     - `npm install`

**4. Create a `.env` file:**
   - Create a file named `.env` in the root directory of your project.
   - Add your API keys and Instagram credentials (replace with your actual values):
     ```
     GEMINI_API_KEY='YOUR_GEMINI_API_KEY'
     INSTAGRAM_USERNAME='your_instagram_username'
     INSTAGRAM_PASSWORD='your_instagram_password'
     INSTAGRAM_ACCESS_TOKEN='YOUR_INSTAGRAM_GRAPH_API_ACCESS_TOKEN'
     INSTAGRAM_BUSINESS_ACCOUNT_ID='YOUR_INSTAGRAM_BUSINESS_ACCOUNT_ID'
     CLOUDINARY_CLOUD_NAME='your_cloudinary_cloud_name'
     CLOUDINARY_API_KEY='your_cloudinary_api_key'
     CLOUDINARY_API_SECRET='your_cloudinary_api_secret'
     ```
   - **Important:** Ensure your Instagram account is a Professional Account (Creator or Business) and linked to a Facebook Page to use the Graph API. Obtain `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_BUSINESS_ACCOUNT_ID` via the [Facebook Graph API Explorer](https://developers.facebook.com/tools/explorer/).

**5. Start Celery Worker:**
   - Open a **new** terminal and run:
     `celery -A tasks worker --loglevel=info`

**6. Start Celery Beat (Scheduler):**
   - Open another **new** terminal and run:
     `celery -A tasks beat --loglevel=info --schedule=/tmp/celerybeat-schedule`
     (On Windows, `/tmp/celerybeat-schedule` might need to be a valid path like `C:\temp\celerybeat-schedule`)

**7. Start the backend server:**
  - Open new terminal and run:
    `python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`

**8. Start the frontend server:**
  - Open new terminal and run:
    `cd frontend && npm start`
 
