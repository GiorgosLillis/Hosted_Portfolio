import { showToast } from '../common/toast.js';

const form = document.getElementById("contactForm");
form.addEventListener("submit", async function (e) {
   
    e.preventDefault();

    if (!this.checkValidity()) {
      this.classList.add('was-validated');
      return;
    }

    if (typeof grecaptcha === 'undefined') {
      console.error('reCAPTCHA not loaded');
      return;
    }

    const token = await grecaptcha.execute('6Lc560ErAAAAAP7bly7AL_F_5AxlDf8zW7xxbML6', { action: 'submit' });
    if (!token) {
      showToast("reCAPTCHA token missing", "danger");
      return;
    }
      
    const formData = {
      email: document.getElementById("email").value,
      subject: document.getElementById("subject").value,
      message: document.getElementById("message").value,
      'g-recaptcha-response': token
    };

    
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.push('Please enter a valid email address');
    }
    if (!formData.subject || formData.subject.trim().length < 1 || formData.subject.length > 100) {
      errors.push('Subject must be between 1-100 characters');
    }
    if (!formData.message ||formData.message.trim().length < 1 || formData.message.length > 1000) {
      errors.push('Message must be between 1-1000 characters');
    }

    const submitBtn = document.getElementById('Email-Submit');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<div class="status"><span class="spinner-border" role="status" aria-hidden="true"></span> Sending...</div>';
    submitBtn.disabled = true;

    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
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
      showToast("Network error. Please try again later.", "danger");
    } finally {
      // Reset button state
      submitBtn.innerHTML = originalBtnText;
      submitBtn.disabled = false;
      form.classList.remove('was-validated');
    }
  });
