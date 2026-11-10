import { showToast } from '../common/toast.js';
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { fetchWithTimeout } from '../common/fetchWithTimeout.js';
import i18next, { apiMessage } from '../common/i18n.js';

const t = (key, options) => i18next.t(key, options);

loadRecaptchaScript();

// Portfolio contact form, submits to /api/email
const form = document.getElementById("contactForm");
form.addEventListener("submit", async function (e) {

    e.preventDefault();

    if (!this.checkValidity()) {
      this.classList.add('was-validated');
      return;
    }

    const submitBtn = document.getElementById('Email-Submit');

    try {
        const token = await getRecaptchaToken('submit');

        const formData = {
            email: document.getElementById("email").value,
            subject: document.getElementById("subject").value,
            message: document.getElementById("message").value
        };

        // Same rules the server enforces, catches obvious mistakes before making the request
        const errors = [];
        if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            errors.push(t('toast-invalid-email'));
        }
        if (!formData.subject || formData.subject.trim().length < 1 || formData.subject.length > 100) {
            errors.push(t('subject-length'));
        }
        if (!formData.message ||formData.message.trim().length < 1 || formData.message.length > 1000) {
            errors.push(t('message-length'));
        }

        if (errors.length > 0) {
            showToast(errors.join('\n'), 'danger');
            return;
        }

        submitBtn.innerHTML = '<div class="status"><span class="spinner-border" role="status" aria-hidden="true"></span> ' + t('sending') + '</div>';
        submitBtn.disabled = true;

        const response = await fetchWithTimeout("/api/email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "g-recaptcha-response": token
            },
            body: JSON.stringify(formData),
            credentials: 'omit'
        });

        const result = await response.json();

        if (response.ok) {
            showToast(apiMessage(result, t('email-sent')), "success");
            form.reset();
        } else {
            showToast(apiMessage(result, t('email-failed')), "danger");
        }
    } catch (err) {
        console.error(err);
        showToast(t('error-try-later'), "danger");
    } finally {
        submitBtn.textContent = t('send-email');
        submitBtn.disabled = false;
        form.classList.remove('was-validated');
    }
});
