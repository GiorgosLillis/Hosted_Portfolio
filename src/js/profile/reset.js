import { showToast } from '../common/toast.js';
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { isValidPassword } from '../common/validation.js';

loadRecaptchaScript();

const form = document.getElementById("resetForm");
const newPass = document.getElementById("newPass");
const confirmPass = document.getElementById("confirmPass");
const resetBtn = document.getElementById('resetBtn');
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const email = params.get('email');

if (!token || !email) {
    form.innerHTML = '<h1 class="text-center">Invalid or missing reset link.</h1>';
} else {
    form.addEventListener("submit", async function (e) {

        e.preventDefault();

        const newPassword = newPass.value;
        const confirmPassword = confirmPass.value;

        if (!isValidPassword(newPassword)) {
            showToast("Please type a password that meets the criteria below", 'danger');
            return;
        }
        if (newPassword != confirmPassword) {
            showToast("Passwords are not identical", 'danger');
            return;
        }

        const resetData = {
            email: email,
            token: token,
            new_password: newPassword
        }

        const originalBtnText = resetBtn.innerHTML;
        resetBtn.disabled = true;
        resetBtn.innerHTML = 'Resetting...';

        try {
            const recaptchaToken = await getRecaptchaToken('reset');

            const response = await fetch("/api/reset", {
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
                showToast(result.message || "Password has been reset! A confirmation email has been sent.", "success");
                form.reset();
                setTimeout(() => {
                    window.location.href = 'profile.html';
                }, 2000);
            } else {
                showToast(result.message || "Failed to reset password.", "danger");
                resetBtn.disabled = false;
                resetBtn.innerHTML = originalBtnText;
            }
        } catch (err) {
            console.error(err);
            showToast("An error occurred. Please try again later.", "danger");
            resetBtn.disabled = false;
            resetBtn.innerHTML = originalBtnText;
        }
    })
}