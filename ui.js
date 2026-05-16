const navItems = document.querySelectorAll(".nav-item");
const healthData = {
    activity: {
        label: "Activity",
        value: "Medium",
        percent: 65,
        message: "You are moderately active today."
    },
    sleep: {
        label: "Sleep",
        value: "5.5 hrs",
        percent: 55,
        message: "Sleep is a little low. Try to rest more tonight."
    },
    screenTime: {
        label: "Screen Time",
        value: "7 hrs",
        percent: 75,
        message: "Screen time is high, so stress may increase."
    },
    mentalWellbeing: {
        label: "Mental Wellbeing",
        value: "Stressed",
        percent: 45,
        message: "Take a short break and breathe slowly for a minute."
    },
    steps: {
        label: "Steps",
        value: "4200",
        percent: 42,
        message: "You have completed 4,200 steps today."
    },
    heartRate: {
        label: "Heart Rate",
        value: "82 BPM",
        percent: 70,
        message: "Heart rate looks normal."
    }
};
const healthPayload = {
    height: 170,
    weight: 70,
    sleep: 5.5,
    activity: "medium",
    screen_time: 7,
    steps: 4200,
    feeling: "stressed",
    failsafe_delay: 60,
    location: "Sonipat"
};
const healthCards = document.querySelectorAll(".health-container");
const healthSummary = document.getElementById("healthSummary");
const heartRateStatus = document.getElementById("heartRateStatus");
const sleepStatus = document.getElementById("sleepStatus");
const activityStatus = document.getElementById("activityStatus");
const stressStatus = document.getElementById("stressStatus");
const stressButtons = document.querySelectorAll("[data-stress-level]");
const checkupMessage = document.getElementById("checkupMessage");
const checkupBox = document.getElementById("checkupBox");
const checkupTimer = document.getElementById("checkupTimer");
const checkupCancelBtn = document.getElementById("checkupCancelBtn");
let checkupInterval;
let checkupTimeLeft = 60;

healthCards.forEach(card => {
    const data = healthData[card.dataset.healthKey];
    const track = card.querySelector(".track");

    if (!data || !track) {
        return;
    }

    track.innerHTML = `
        <span>${data.value}</span>
        <div class="track-bar">
            <div class="track-fill" style="width: ${data.percent}%"></div>
        </div>
    `;

    card.addEventListener("click", () => {
        healthCards.forEach(item => item.classList.remove("selected"));
        card.classList.add("selected");
        updateHealthSummary(data);
        analyzeHealth();
    });
});

stressButtons.forEach(button => {
    button.addEventListener("click", () => {
        const stressLevel = button.dataset.stressLevel;

        stressButtons.forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
        healthPayload.feeling = stressLevel;

        if (stressLevel === "fine") {
            updateStatus(stressStatus, "Normal", "good");
            cancelCheckup(isCheckupActive());
            setCheckupMessage("Glad you are feeling okay. Health checkup looks normal.");
            analyzeHealth();
            return;
        }

        if (stressLevel === "stressed") {
            updateStatus(stressStatus, "Medium", "warning");
            cancelCheckup(isCheckupActive());
            setCheckupMessage("You marked stressed. Running a support checkup now.");
            analyzeHealth();
            return;
        }

        updateStatus(stressStatus, "Very High", "danger");
        setCheckupMessage("You marked very stressed. Starting safety checkup and failsafe timer.");
        analyzeHealth(true);
    });
});

if (checkupCancelBtn) {
    checkupCancelBtn.addEventListener("click", () => cancelCheckup(true));
}

function updateHealthSummary(data) {
    if (healthSummary) {
        healthSummary.innerText = `${data.label}: ${data.message}`;
    }

    updateStatus(heartRateStatus, "Normal", "good");
    updateStatus(sleepStatus, "Low", "warning");
    updateStatus(activityStatus, "Active", "good");
    if (healthPayload.feeling === "very_stressed") {
        updateStatus(stressStatus, "Very High", "danger");
    } else if (healthPayload.feeling === "stressed") {
        updateStatus(stressStatus, "Medium", "warning");
    } else {
        updateStatus(stressStatus, "Normal", "good");
    }
}

function updateStatus(element, text, className) {
    if (!element) {
        return;
    }

    element.className = className;
    element.innerText = text;
}

function analyzeHealth(shouldStartCheckup = false) {
    fetch("http://127.0.0.1:5000/analyze_health", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(healthPayload)
    })
    .then(res => res.json())
    .then(data => {
        if (!data.summary) {
            return;
        }

        updateStatus(sleepStatus, `${data.summary.sleep} hrs`, data.summary.sleep < 6 ? "warning" : "good");
        updateStatus(activityStatus, data.summary.activity, data.summary.activity === "low" ? "warning" : "good");
        if (data.summary.feeling === "very_stressed") {
            updateStatus(stressStatus, "Very High", "danger");
        } else {
            updateStatus(stressStatus, data.summary.stress, data.summary.stress === "HIGH" ? "danger" : "warning");
        }

        if (healthSummary) {
            healthSummary.innerText += ` Risk: ${data.risk_level}. ${data.reason}.`;
        }

        if (shouldStartCheckup && data.action === "ALERT") {
            startCheckupCountdown();
        }
    })
    .catch(error => {
        console.error("Health analysis failed:", error);
        if (shouldStartCheckup) {
            startCheckupCountdown();
            setCheckupMessage("Backend is not running, but the on-screen checkup timer started.");
        }
    });
}

function startCheckupCountdown() {
    clearInterval(checkupInterval);
    checkupTimeLeft = 60;

    if (checkupBox) {
        checkupBox.style.display = "block";
    }

    updateCheckupTimer();

    checkupInterval = setInterval(() => {
        checkupTimeLeft--;
        updateCheckupTimer();

        if (checkupTimeLeft <= 0) {
            clearInterval(checkupInterval);
            setCheckupMessage("Failsafe alert sent. Your emergency contacts should be notified.");
        }
    }, 1000);
}

function updateCheckupTimer() {
    if (checkupTimer) {
        checkupTimer.innerText = checkupTimeLeft;
    }
}

function cancelCheckup(shouldNotifyBackend) {
    clearInterval(checkupInterval);
    checkupTimeLeft = 60;
    updateCheckupTimer();

    if (checkupBox) {
        checkupBox.style.display = "none";
    }

    if (!shouldNotifyBackend) {
        return;
    }

    fetch("http://127.0.0.1:5000/cancel_alert", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            user_id: "default_user"
        })
    })
    .then(res => res.json())
    .then(data => {
        console.log("Failsafe cancelled:", data);
        setCheckupMessage("Checkup cancelled. No failsafe alert will be sent.");
    })
    .catch(error => {
        console.error("Cancel checkup failed:", error);
        setCheckupMessage("Checkup cancelled on screen. Start the backend to cancel the server timer too.");
    });
}

function isCheckupActive() {
    return checkupBox && checkupBox.style.display === "block";
}

function setCheckupMessage(message) {
    if (checkupMessage) {
        checkupMessage.innerText = message;
    }
}

let timer;
let timeLeft = 30;
const sosButton = document.querySelector(".circle3-btn");
const sosBox = document.getElementById("sosBox");
const timerText = document.getElementById("timerText");

if (sosButton) {
    sosButton.addEventListener("click", startSOS);
}

function startSOS() {
    clearInterval(timer);
    timeLeft = 30;

    sosBox.style.display = "block";

    // 👇 Hide button area (optional but better UX)
    document.querySelector(".sos-wrapper").style.display = "none";

    timerText.innerText = timeLeft;

    timer = setInterval(() => {
        timeLeft--;
        timerText.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timer);
            triggerSOS();
        }
    }, 1000);
}

function cancelSOS() {
    clearInterval(timer);

    sosBox.style.display = "none";

    // 👇 Show button again
    document.querySelector(".sos-wrapper").style.display = "flex";

    timerText.innerText = "30";

    alert("SOS Cancelled");
}

function triggerSOS() {
    timerText.innerText = "🚨 SOS SENT";

    fetch("http://127.0.0.1:5000/trigger_alert", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            risk_level: "HIGH",
            reason: "Manual SOS triggered",
            location: "Sonipat"
        })
    })
    .then(res => res.json())
    .then(data => {
        console.log("Alert sent:", data);
    })
    .catch(error => {
        console.error("SOS request failed:", error);
        alert("Backend not running!");
    });
}
