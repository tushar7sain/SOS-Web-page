from flask import Flask, request, jsonify
from datetime import datetime
import threading
import time

app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

# ---------------- MOCK DATA ---------------- #

EMERGENCY_CONTACTS = [
    {"name": "Mom", "phone": "+91XXXX"},
    {"name": "Best Friend", "phone": "+91XXXX"}
]

DEFAULT_LOCATION = "Sonipat, Haryana"
 
health_logs = []
active_timers = {}


# ---------------- HELPER FUNCTIONS ---------------- #

def calculate_bmi(weight, height_cm):
    height_m = height_cm / 100
    bmi = weight / (height_m ** 2)

    if bmi < 18.5:
        category = "Underweight"
    elif bmi < 25:
        category = "Normal"
    elif bmi < 30:
        category = "Overweight"
    else:
        category = "Obese"

    return round(bmi, 2), category


def estimate_stress(screen_time):
    if screen_time > 8:
        return "HIGH"
    elif screen_time > 5:
        return "MEDIUM"
    else:
        return "LOW"


def calculate_calories(steps):
    return round(steps * 0.04, 2)


# 🔥 Risk logic with user feeling
def calculate_risk(sleep, stress, activity, bmi_category, steps, feeling):

    if feeling == "very_stressed":
        return "HIGH", "User reported high stress"

    elif feeling == "stressed":
        return "MEDIUM", "User feeling stressed"

    if sleep < 5 and stress == "HIGH":
        return "CRITICAL", "Low sleep and high stress"

    elif bmi_category in ["Overweight", "Obese"] and activity == "low":
        return "HIGH", "High BMI and low activity"

    elif steps < 3000:
        return "HIGH", "Very low activity"

    elif sleep < 6:
        return "HIGH", "Low sleep"

    else:
        return "NORMAL", "Stable condition"


# 🔥 Decision engine
def decide_action(risk_level, feeling):

    if risk_level == "CRITICAL":
        return "ALERT"

    if feeling == "very_stressed":
        return "ALERT"

    elif risk_level == "HIGH":
        return "MONITOR"

    elif risk_level == "MEDIUM":
        return "SUPPORT"

    else:
        return "NORMAL"


def generate_alert_message(location, risk_level, reason):
    return f"""
URGENT: Possible health risk detected.
Risk Level: {risk_level}
Reason: {reason}
Location: {location}
Please check immediately.
"""


# ---------------- CORE ALERT LOGIC ---------------- #

def trigger_alert_internal(data, auto_triggered=False):
    risk_level = data.get("risk_level", "UNKNOWN")
    reason = data.get("reason", "No reason provided")
    location = data.get("location", DEFAULT_LOCATION)

    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    alert_id = len(health_logs) + 1

    alert_message = generate_alert_message(location, risk_level, reason)

    alert = {
        "id": alert_id,
        "status": "ALERT_TRIGGERED",
        "risk_level": risk_level,
        "reason": reason,
        "auto_triggered": auto_triggered,
        "source": "failsafe_timer" if auto_triggered else "manual",
        "location": location,
        "message_sent": alert_message,
        "contacts_notified": EMERGENCY_CONTACTS,
        "time": current_time
    }

    health_logs.append(alert)

    print(f"[ALERT #{alert_id}] {risk_level} | {location} | AUTO={auto_triggered}")

    return alert


# ---------------- FAILSAFE TIMER ---------------- #

def start_failsafe_timer(user_id, delay, alert_data):

    if delay is None:
        delay = 60

    if delay <= 0:
        return {
            "status": "INVALID_DELAY",
            "message": "Delay must be positive"
        }

    if user_id in active_timers:
        return {
            "status": "ALREADY_RUNNING",
            "message": "Failsafe already active"
        }

    def timer():
        time.sleep(delay)

        if user_id in active_timers and alert_data:
            print(f"[FAILSAFE] Triggering auto alert for {user_id}")
            trigger_alert_internal(alert_data, auto_triggered=True)

            active_timers.pop(user_id, None)

    thread = threading.Thread(target=timer, daemon=True)
    thread.start()

    active_timers[user_id] = {
        "thread": thread,
        "start_time": time.time(),
        "delay": delay
    }

    return {
        "status": "STARTED",
        "message": f"Failsafe started for {delay} seconds"
    }


def cancel_failsafe(user_id):
    if user_id in active_timers:
        active_timers.pop(user_id, None)
        return True
    return False


# ---------------- ROUTES ---------------- #

@app.route("/")
def home():
    return "Health Monitoring Backend Running 🏥"


# 🧠 ANALYZE HEALTH
@app.route("/analyze_health", methods=["POST"])
def analyze_health():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Invalid request"}), 400

    try:
        height = data.get("height")
        weight = data.get("weight")
        sleep = data.get("sleep")
        activity = data.get("activity", "medium")
        screen_time = data.get("screen_time")
        steps = data.get("steps", 0)
        feeling = data.get("feeling", "fine")

        bmi, bmi_category = calculate_bmi(weight, height)
        stress = estimate_stress(screen_time)
        calories_burned = calculate_calories(steps)

        risk_level, reason = calculate_risk(
            sleep, stress, activity, bmi_category, steps, feeling
        )

        action = decide_action(risk_level, feeling)

        # 🔥 Auto failsafe for critical cases
        failsafe = None
        if action == "ALERT":
            failsafe = start_failsafe_timer(data.get("user_id", "default_user"), data.get("failsafe_delay", 60), {
                "risk_level": risk_level,
                "reason": reason,
                "location": data.get("location", DEFAULT_LOCATION)
            })

        response = {
            "summary": {
                "bmi": bmi,
                "bmi_category": bmi_category,
                "sleep": sleep,
                "activity": activity,
                "stress": stress,
                "steps": steps,
                "calories_burned": calories_burned,
                "feeling": feeling
            },
            "risk_level": risk_level,
            "action": action,
            "reason": reason,
            "failsafe": failsafe
        }

        return jsonify(response)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# 🚨 MANUAL ALERT
@app.route("/trigger_alert", methods=["POST"])
def trigger_alert():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Invalid request"}), 400

    alert = trigger_alert_internal(data, auto_triggered=False)
    return jsonify(alert)


# ⏱️ START FAILSAFE
@app.route("/start_failsafe", methods=["POST"])
def start_failsafe():
    data = request.get_json()

    user_id = data.get("user_id", "default_user")
    delay = data.get("delay", 60)

    result = start_failsafe_timer(user_id, delay, data)
    return jsonify(result)


# 🛑 CANCEL ALERT
@app.route("/cancel_alert", methods=["POST"])
def cancel_alert():
    data = request.get_json()
    user_id = data.get("user_id", "default_user")

    cancelled = cancel_failsafe(user_id)

    return jsonify({
        "status": "CANCELLED",
        "timer_cancelled": cancelled
    })


# 🔍 FAILSAFE STATUS
@app.route("/failsafe_status", methods=["GET"])
def failsafe_status():
    user_id = request.args.get("user_id", "default_user")

    if user_id not in active_timers:
        return jsonify({
            "status": "NO_ACTIVE_TIMER"
        })

    timer_data = active_timers[user_id]

    elapsed = time.time() - timer_data["start_time"]
    remaining = max(0, timer_data["delay"] - elapsed)

    return jsonify({
        "status": "ACTIVE",
        "remaining_seconds": round(remaining, 2)
    })


# 📊 VIEW LOGS
@app.route("/logs", methods=["GET"])
def get_logs():
    return jsonify({
        "total_alerts": len(health_logs),
        "alerts": health_logs
    })


# ---------------- RUN ---------------- #

if __name__ == "__main__":
    app.run(debug=True)


    #http://127.0.0.1:5000/logs
