import os
import io
import warnings
import joblib
import numpy as np
import pandas as pd
from groq import Groq
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "graphura-seo-2024")
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10MB upload limit

# ── Load RF model ─────────────────────────────────────────────────────────────
with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    rf_model = joblib.load("random_forest_model.joblib")

CLASS_LABELS = {0: "Low Opportunity", 1: "Medium Opportunity", 2: "High Opportunity"}
CLASS_COLORS = {0: "low", 1: "medium", 2: "high"}

COMPETITOR_MAP   = {"Low": 0, "Medium": 1, "High": 2}
CONTENT_TYPE_MAP = {"Blog": 0, "Landing Page": 1, "Service Page": 2}
INTENT_MAP       = {"Informational": 0, "Commercial": 1, "Transactional": 2}

# ── Groq setup (free, no credit card) ────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
groq_client  = None
if GROQ_API_KEY and GROQ_API_KEY != "your_groq_api_key_here":
    try:
        groq_client = Groq(api_key=GROQ_API_KEY)
    except Exception:
        groq_client = None

# ── CSV column spec (must match training data exactly) ────────────────────────
REQUIRED_COLS = [
    "keyword", "search_volume", "keyword_difficulty",
    "current_ranking", "competitor_presence", "content_type",
    "search_intent", "relevance_to_graphura",
]
OPTIONAL_COL = "opportunity_category"   # may or may not be present

def _parse_keyword_csv(file_bytes, filename):
    """Parse the keyword CSV with the exact training-data column schema."""
    fname = filename.lower()
    try:
        sep = "\t" if (fname.endswith(".tsv") or fname.endswith(".txt")) else ","
        df  = pd.read_csv(io.BytesIO(file_bytes), sep=sep)
        # fallback: if only 1 column parsed with comma, retry with tab
        if sep == "," and len(df.columns) < 3:
            df = pd.read_csv(io.BytesIO(file_bytes), sep="\t")
    except Exception as e:
        raise ValueError(f"Could not read file: {e}")

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise ValueError(
            f"Missing required columns: {missing}. "
            f"Your CSV must have: {REQUIRED_COLS}. "
            f"Found: {list(df.columns)}"
        )

    # Clean numeric columns
    for col in ["search_volume", "keyword_difficulty", "current_ranking", "relevance_to_graphura"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["keyword"] = df["keyword"].astype(str).str.strip()
    df = df.dropna(subset=REQUIRED_COLS)
    df = df[df["keyword"] != ""]

    if len(df) == 0:
        raise ValueError("No valid rows found after cleaning.")

    return df


def _run_rf_predictions(df):
    """Run the Random Forest model on every row and attach predictions."""
    df = df.copy()

    # Encode categorical columns exactly as during training
    df["competitor_presence_enc"] = df["competitor_presence"].map(COMPETITOR_MAP).fillna(1).astype(int)
    df["content_type_enc"]        = df["content_type"].map(CONTENT_TYPE_MAP).fillna(0).astype(int)
    df["search_intent_enc"]       = df["search_intent"].map(INTENT_MAP).fillna(0).astype(int)

    feature_cols = [
        "search_volume", "keyword_difficulty", "current_ranking",
        "competitor_presence_enc", "content_type_enc",
        "search_intent_enc", "relevance_to_graphura",
    ]
    X = df[feature_cols].values

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        preds  = rf_model.predict(X)
        probas = rf_model.predict_proba(X)

    df["predicted_class"]      = preds
    df["predicted_label"]      = [CLASS_LABELS[p] for p in preds]
    df["predicted_color"]      = [CLASS_COLORS[p]  for p in preds]
    df["confidence"]           = (probas.max(axis=1) * 100).round(1)
    df["prob_high"]            = (probas[:, 2] * 100).round(1)
    df["prob_medium"]          = (probas[:, 1] * 100).round(1)
    df["prob_low"]             = (probas[:, 0] * 100).round(1)

    return df


def _analyse_keyword_csv(df):
    """Build full dashboard analytics from the keyword CSV + RF predictions."""
    df = _run_rf_predictions(df)

    total_keywords = len(df)
    avg_volume     = int(df["search_volume"].mean())
    avg_difficulty = round(float(df["keyword_difficulty"].mean()), 1)
    avg_ranking    = round(float(df["current_ranking"].mean()), 1)
    avg_relevance  = round(float(df["relevance_to_graphura"].mean()), 1)

    opp_counts = df["predicted_label"].value_counts().to_dict()

    # ── Segment tables ────────────────────────────────────────────────────────
    high_df = (
        df[df["predicted_label"] == "High Opportunity"]
        .sort_values("confidence", ascending=False)
        .head(15)
    )
    medium_df = (
        df[df["predicted_label"] == "Medium Opportunity"]
        .sort_values("confidence", ascending=False)
        .head(15)
    )
    # Quick wins: high opportunity + low difficulty + ranking > 0
    quick_wins_df = (
        df[(df["predicted_label"] == "High Opportunity") &
           (df["keyword_difficulty"] < 50) &
           (df["current_ranking"] > 0)]
        .sort_values(["keyword_difficulty", "search_volume"], ascending=[True, False])
        .head(15)
    )
    # Low difficulty gems: difficulty < 30, any opportunity
    low_diff_df = (
        df[df["keyword_difficulty"] < 30]
        .sort_values(["search_volume"], ascending=False)
        .head(15)
    )

    # ── Distribution charts ───────────────────────────────────────────────────
    diff_buckets = {
        "0–20":  int(((df["keyword_difficulty"] >= 0)  & (df["keyword_difficulty"] < 20)).sum()),
        "20–40": int(((df["keyword_difficulty"] >= 20) & (df["keyword_difficulty"] < 40)).sum()),
        "40–60": int(((df["keyword_difficulty"] >= 40) & (df["keyword_difficulty"] < 60)).sum()),
        "60–80": int(((df["keyword_difficulty"] >= 60) & (df["keyword_difficulty"] < 80)).sum()),
        "80+":   int((df["keyword_difficulty"] >= 80).sum()),
    }

    vol_buckets = {
        "0–500":    int((df["search_volume"] < 500).sum()),
        "500–2k":   int(((df["search_volume"] >= 500)  & (df["search_volume"] < 2000)).sum()),
        "2k–5k":    int(((df["search_volume"] >= 2000) & (df["search_volume"] < 5000)).sum()),
        "5k–10k":   int(((df["search_volume"] >= 5000) & (df["search_volume"] < 10000)).sum()),
        "10k+":     int((df["search_volume"] >= 10000).sum()),
    }

    intent_counts  = df["search_intent"].value_counts().to_dict()
    content_counts = df["content_type"].value_counts().to_dict()
    comp_counts    = df["competitor_presence"].value_counts().to_dict()

    # ── Accuracy check if opportunity_category column exists ─────────────────
    accuracy_info = None
    if OPTIONAL_COL in df.columns:
        label_map = {
            "High Opportunity": 2, "Medium Opportunity": 1, "Low Opportunity": 0
        }
        actual = df[OPTIONAL_COL].map(label_map)
        valid  = actual.notna()
        if valid.sum() > 0:
            correct = (df.loc[valid, "predicted_class"] == actual[valid]).sum()
            accuracy_info = {
                "accuracy": round(float(correct / valid.sum() * 100), 1),
                "total_compared": int(valid.sum()),
            }

    def rows_to_list(frame):
        records = []
        for _, r in frame.iterrows():
            rec = {
                "keyword":            str(r["keyword"]),
                "search_volume":      int(r["search_volume"]),
                "keyword_difficulty": int(r["keyword_difficulty"]),
                "current_ranking":    int(r["current_ranking"]),
                "competitor_presence":str(r["competitor_presence"]),
                "content_type":       str(r["content_type"]),
                "search_intent":      str(r["search_intent"]),
                "relevance":          int(r["relevance_to_graphura"]),
                "predicted_label":    str(r["predicted_label"]),
                "predicted_color":    str(r["predicted_color"]),
                "confidence":         float(r["confidence"]),
                "prob_high":          float(r["prob_high"]),
                "prob_medium":        float(r["prob_medium"]),
                "prob_low":           float(r["prob_low"]),
            }
            if OPTIONAL_COL in r.index:
                rec["actual_label"] = str(r[OPTIONAL_COL])
            records.append(rec)
        return records

    # ── AI context string ─────────────────────────────────────────────────────
    ai_context = f"""
Keyword CSV Analysis for Graphura India — {total_keywords} keywords processed by Random Forest model:

Summary Metrics:
- Total Keywords: {total_keywords}
- Avg Search Volume: {avg_volume:,}
- Avg Keyword Difficulty: {avg_difficulty}/100
- Avg Current Ranking: {avg_ranking}
- Avg Relevance to Graphura: {avg_relevance}/10

ML Prediction Results:
- High Opportunity: {opp_counts.get('High Opportunity', 0)} keywords
- Medium Opportunity: {opp_counts.get('Medium Opportunity', 0)} keywords
- Low Opportunity: {opp_counts.get('Low Opportunity', 0)} keywords
{f"- Model Accuracy vs existing labels: {accuracy_info['accuracy']}%" if accuracy_info else ""}

Search Intent Breakdown: {intent_counts}
Content Type Breakdown: {content_counts}
Competitor Presence: {comp_counts}

Top 5 High Opportunity Keywords:
{chr(10).join([f"  - {r['keyword']} (vol: {r['search_volume']:,}, diff: {r['keyword_difficulty']}, ranking: {r['current_ranking']}, confidence: {r['confidence']}%)" for r in rows_to_list(high_df)[:5]])}

Top 5 Quick Win Keywords (High Opp + Low Difficulty):
{chr(10).join([f"  - {r['keyword']} (vol: {r['search_volume']:,}, diff: {r['keyword_difficulty']}, ranking: {r['current_ranking']})" for r in rows_to_list(quick_wins_df)[:5]])}
""".strip()

    return {
        "summary": {
            "total_keywords":    total_keywords,
            "avg_volume":        avg_volume,
            "avg_difficulty":    avg_difficulty,
            "avg_ranking":       avg_ranking,
            "avg_relevance":     avg_relevance,
            "opportunity_counts": opp_counts,
            "accuracy_info":     accuracy_info,
        },
        "top_high_opportunity": rows_to_list(high_df),
        "top_medium":           rows_to_list(medium_df),
        "quick_wins":           rows_to_list(quick_wins_df),
        "low_difficulty":       rows_to_list(low_diff_df),
        "difficulty_distribution": diff_buckets,
        "volume_distribution":     vol_buckets,
        "intent_distribution":     intent_counts,
        "content_distribution":    content_counts,
        "competitor_distribution": comp_counts,
        "ai_context":              ai_context,
    }


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()
        search_volume       = int(data["search_volume"])
        keyword_difficulty  = int(data["keyword_difficulty"])
        current_ranking     = int(data["current_ranking"])
        competitor_presence = COMPETITOR_MAP.get(data["competitor_presence"], 1)
        content_type        = CONTENT_TYPE_MAP.get(data["content_type"], 0)
        search_intent       = INTENT_MAP.get(data["search_intent"], 0)
        relevance           = int(data["relevance_to_graphura"])

        features = np.array([[
            search_volume, keyword_difficulty, current_ranking,
            competitor_presence, content_type, search_intent, relevance
        ]])

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            prediction    = int(rf_model.predict(features)[0])
            probabilities = rf_model.predict_proba(features)[0].tolist()

        label      = CLASS_LABELS[prediction]
        color      = CLASS_COLORS[prediction]
        confidence = round(max(probabilities) * 100, 1)
        prob_dict  = {CLASS_LABELS[i]: round(probabilities[i] * 100, 1) for i in range(len(probabilities))}

        return jsonify({
            "success": True, "prediction": label, "color": color,
            "confidence": confidence, "probabilities": prob_dict,
            "keyword": data.get("keyword", ""),
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/upload-gsc", methods=["POST"])
def upload_gsc():
    try:
        if "file" not in request.files:
            return jsonify({"success": False, "error": "No file uploaded"}), 400

        f = request.files["file"]
        if not f.filename:
            return jsonify({"success": False, "error": "Empty filename"}), 400

        allowed = {".csv", ".tsv", ".txt"}
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in allowed:
            return jsonify({"success": False, "error": f"Unsupported file type '{ext}'. Use CSV or TSV."}), 400

        file_bytes = f.read()
        df     = _parse_keyword_csv(file_bytes, f.filename)
        result = _analyse_keyword_csv(df)
        return jsonify({"success": True, **result})

    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Processing error: {str(e)}"}), 500


@app.route("/chat", methods=["POST"])
def chat():
    try:
        data         = request.get_json()
        user_message = data.get("message", "").strip()
        context      = data.get("context", "")

        if not user_message:
            return jsonify({"success": False, "error": "Empty message"}), 400

        system_prompt = (
            "You are an expert SEO strategist and digital marketing consultant for Graphura India, "
            "a full-service digital marketing agency based in India. "
            "You have deep expertise in SEO, PPC, content marketing, social media, branding, and web analytics. "
            "Answer ANY question the user asks — whether it's about SEO, marketing, business strategy, "
            "data analysis, technology, or general knowledge. "
            "When answering SEO/marketing questions, be specific, actionable, and data-driven. "
            "Use bullet points for lists. Use **bold** for key terms. "
            "If keyword data or prediction context is provided, analyse it and give specific recommendations. "
            "Keep responses concise but complete. Never refuse to answer."
        )

        messages = [{"role": "system", "content": system_prompt}]
        if context:
            messages.append({"role": "user", "content": f"Here is the context data:\n{context}"})
            messages.append({"role": "assistant", "content": "Got it, I have the context. What would you like to know?"})
        messages.append({"role": "user", "content": user_message})

        if groq_client:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages,
                max_tokens=1024,
                temperature=0.7,
            )
            reply = response.choices[0].message.content
        else:
            reply = (
                "⚠️ **Groq API key not configured.**\n\n"
                "Get a **free** key (no credit card) at: https://console.groq.com\n\n"
                "Then add it to your `.env` file:\n"
                "`GROQ_API_KEY=your_key_here`\n\n"
                "Groq runs **Llama 3.3 70B** for free with generous rate limits."
            )

        return jsonify({"success": True, "reply": reply})

    except Exception as e:
        return jsonify({"success": True, "reply": f"Error calling AI: {str(e)}. Please check your GROQ_API_KEY in .env"})


if __name__ == "__main__":
    app.run(debug=True)
