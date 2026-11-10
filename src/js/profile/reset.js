import i18next, { apiMessage } from '../common/i18n.js';
import { showToast } from '../common/toast.js';
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { isValidPassword } from '../common/validation.js';
import { fetchWithTimeout } from '../common/fetchWithTimeout.js';

const t = (key) => i18next.t(key);

loadRecaptchaScript();

const form = document.getElementById("resetForm");
const newPass = document.getElementById("newPass");
const confirmPass = document.getElementById("confirmPass");
const resetBtn = document.getElementById('resetBtn');
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const email = params.get('email');

if (!token || !email) {
    form.innerHTML = '';
    const invalidLink = document.createElement('h1');
    invalidLink.className = 'text-center';
    invalidLink.textContent = t('reset-invalid-link');
    form.appendChild(invalidLink);
} else {
    form.addEventListener("submit", async function (e) {

        e.preventDefault();

        const newPassword = newPass.value;
        const confirmPassword = confirmPass.value;

        if (!isValidPassword(newPassword)) {
            showToast(t('reset-criteria'), 'danger');
            return;
        }
        if (newPassword != confirmPassword) {
            showToast(t('reset-mismatch'), 'danger');
            return;
        }

        const resetData = {
            email: email,
            token: token,
            new_password: newPassword
        }

        const originalBtnText = resetBtn.innerHTML;
        resetBtn.disabled = true;
        resetBtn.textContent = t('resetting');

        try {
            const recaptchaToken = await getRecaptchaToken('reset');

            const response = await fetchWithTimeout("/api/reset", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "g-recaptcha-response": recaptchaToken
                },
                body: JSON.stringify(resetData),
                credentials: 'omit'
            });

            const result = await response.json();

            if (response.ok) {
                showToast(apiMessage(result, t('reset-success')), "success");
                form.reset();
                setTimeout(() => {
                    window.location.href = 'profile.html';
                }, 2000);
            } else {
                showToast(apiMessage(result, t('reset-failed')), "danger");
                resetBtn.disabled = false;
                resetBtn.innerHTML = originalBtnText;
            }
        } catch (err) {
            console.error(err);
            showToast(t('error-try-later'), "danger");
            resetBtn.disabled = false;
            resetBtn.innerHTML = originalBtnText;
        }
    })
}