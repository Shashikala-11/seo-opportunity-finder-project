# 📈 SEO Opportunity Finder — Graphura India

An AI-powered Flask web application that predicts SEO keyword opportunities using a trained **Random Forest ML model** and an intelligent **AI assistant** powered by Groq (Llama 3.3 70B — free).

Built as an internship project for **Graphura India Private Limited**.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔮 Keyword Predictor | Manually enter keyword metrics and get an instant ML prediction |
| 📊 CSV Dashboard | Upload your keyword CSV and get a full visual analytics dashboard |
| 🤖 AI Assistant | Ask any SEO or marketing question — powered by Groq (free LLM) |
| 🎯 Opportunity Scoring | Classifies keywords as High / Medium / Low Opportunity |
| 📈 Charts & Tables | Difficulty, volume, intent, content type, competitor distributions |
| ✅ Accuracy Check | If your CSV has `opportunity_category`, model accuracy is shown |

---

## 🗂️ Project Structure

```
SEO Opportunity Finder/
├── app.py                        # Flask backend — ML prediction, CSV analysis, AI chat
├── random_forest_model.joblib    # Trained Random Forest model (200 trees)
├── requirements.txt              # Python dependencies
├── .env                          # API keys (not committed to git)
├── templates/
│   └── index.html                # Single-page frontend
└── static/
    ├── css/style.css             # Dark theme UI styles
    └── js/app.js                 # Frontend logic — predictor, dashboard, chat
```

---

## ⚙️ Setup & Installation

### 1. Clone / open the project

```bash
cd "SEO Opportunity Finder"
```

### 2. Create and activate virtual environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Get a free Groq API key

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up — **no credit card required**
3. Navigate to **API Keys** → **Create API Key**
4. Copy the key

### 5. Configure `.env`

Open `.env` and paste your key:

```env
GROQ_API_KEY=gsk_your_actual_key_here
FLASK_SECRET_KEY=graphura-seo-secret-2024
```

### 6. Run the app

```bash
python app.py
```

Open your browser at **http://localhost:5000**

---

## 📋 CSV Upload Format

The dashboard accepts a CSV with these **exact column names**:

```
keyword, search_volume, keyword_difficulty, current_ranking,
competitor_presence, content_type, search_intent, relevance_to_graphura
```

**Optional column** (enables model accuracy check):
```
opportunity_category
```

### Column value reference

| Column | Type | Values |
|---|---|---|
| `keyword` | string | any keyword text |
| `search_volume` | integer | monthly search volume |
| `keyword_difficulty` | integer | 0–100 |
| `current_ranking` | integer | current position (0 = not ranking) |
| `competitor_presence` | string | `Low`, `Medium`, `High` |
| `content_type` | string | `Blog`, `Service Page`, `Landing Page` |
| `search_intent` | string | `Informational`, `Commercial`, `Transactional` |
| `relevance_to_graphura` | integer | 1–10 |
| `opportunity_category` *(optional)* | string | `High Opportunity`, `Medium Opportunity`, `Low Opportunity` |

### Example CSV

```csv
keyword,search_volume,keyword_difficulty,current_ranking,competitor_presence,content_type,search_intent,relevance_to_graphura,opportunity_category
seo agency india,500,39,0,Low,Blog,Commercial,9,High Opportunity
ppc management india,10000,13,5,Low,Landing Page,Transactional,3,High Opportunity
social media marketing india,2000,88,75,Low,Landing Page,Informational,1,Low Opportunity
digital marketing pune,1000,33,100,Medium,Service Page,Commercial,2,Medium Opportunity
```

---

## 🧠 ML Model Details

| Property | Value |
|---|---|
| Algorithm | Random Forest Classifier |
| Trees | 200 estimators |
| Features | 7 input features |
| Classes | High / Medium / Low Opportunity |
| Training data | 500+ real SEO keywords |

**Input features used for prediction:**
1. `search_volume`
2. `keyword_difficulty`
3. `current_ranking`
4. `competitor_presence` (encoded: Low=0, Medium=1, High=2)
5. `content_type` (encoded: Blog=0, Landing Page=1, Service Page=2)
6. `search_intent` (encoded: Informational=0, Commercial=1, Transactional=2)
7. `relevance_to_graphura`

---

## 🤖 AI Assistant

Powered by **Groq** running **Llama 3.3 70B** — completely free.

- Answers any SEO, marketing, or general question
- Automatically receives keyword prediction context when you click "Ask AI About This"
- Automatically receives uploaded CSV data context for dashboard analysis
- "Generate Summary" button produces a full strategic SEO analysis of your CSV data

**Groq free tier limits:** 14,400 requests/day · 6,000 tokens/minute — more than enough for daily use.

---

## 🚀 Dashboard Tabs

| Tab | Shows |
|---|---|
| 🚀 High Opportunity | Keywords predicted as High Opportunity, sorted by confidence |
| 📈 Medium Opportunity | Keywords predicted as Medium Opportunity |
| ⚡ Quick Wins | High Opportunity keywords with difficulty < 50 |
| 💎 Low Difficulty | All keywords with difficulty < 30, sorted by volume |

---

## 📦 Dependencies

```
flask==3.1.1          # Web framework
groq>=0.9.0           # Free AI (Llama 3.3 70B)
pandas>=2.0.0         # CSV processing
numpy>=1.26.0         # Numerical operations
scikit-learn==1.8.0   # ML model loading
joblib>=1.4.2         # Model serialisation
python-dotenv==1.1.0  # Environment variables
```

---

## 🔒 Security Notes

- Never commit `.env` to version control — add it to `.gitignore`
- The app runs in debug mode by default — set `debug=False` for production
- File uploads are limited to 10MB and restricted to `.csv`, `.tsv`, `.txt`

---

## 👥 Project Info

**Organisation:** Graphura India Private Limited  
**Project:** SEO Opportunity Finder — Internship Project  
**Stack:** Python · Flask · scikit-learn · Groq AI · Vanilla JS  
**Purpose:** Data-driven SEO growth framework to prioritise keywords, content topics, and optimisation actions
