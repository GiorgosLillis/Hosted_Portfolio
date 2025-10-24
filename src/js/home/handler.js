import { showToast } from '../common/toast.js';
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';

loadRecaptchaScript();

const form = document.getElementById("contactForm");
form.addEventListener("submit", async function (e) {
   
    e.preventDefault();

    if (!this.checkValidity()) {
      this.classList.add('was-validated');
      return;
    }

    const submitBtn = document.getElementById('Email-Submit');
    const originalBtnText = submitBtn.innerHTML;

    try {
        const token = await getRecaptchaToken('submit');

        const formData = {
            email: document.getElementById("email").value,
            subject: document.getElementById("subject").value,
            message: document.getElementById("message").value
        };

        const errors = [];
        if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            errors.push('Please enter a valid email address');
        }
        if (!formData.subject || formData.subject.trim().length < 1 || formData.subject.length > 100) {
            errors.push('Subject must be between 1-100 characters');
        }
        if (!formData.message ||formData.message.trim().length < 1 || formData.message.length > 1000) {
            errors.push('Message must be between 1-1000 characters');
        }

        if (errors.length > 0) {
            showToast(errors.join('\n'), 'danger');
            return;
        }

        submitBtn.innerHTML = '<div class="status"><span class="spinner-border" role="status" aria-hidden="true"></span> Sending...</div>';
        submitBtn.disabled = true;

        const response = await fetch("/api/email", {
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
            showToast(result.message || "Message sent successfully!", "success");
            form.reset();
        } else {
            showToast(result.message || "Failed to send message.", "danger");
        }
    } catch (err) {
        console.error(err);
        showToast("An error occurred. Please try again later.", "danger");
    } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
        form.classList.remove('was-validated');
    }
});
