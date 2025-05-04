const form = document.getElementById("contactForm");

form.addEventListener("submit", async function (e) {
   
    e.preventDefault();

    if (!this.checkValidity()) {
      this.classList.add('was-validated');
      return;
    }

    const recaptchaToken = grecaptcha.getResponse();
    if (!recaptchaToken) {
      alert("Please verify you're not a robot.");
      return;
    }
    grecaptcha.reset();
    
    const formData = {
      email: document.getElementById("email").value,
      subject: document.getElementById("subject").value,
      message: document.getElementById("message").value,
      recaptchaToken: recaptchaToken
    };

    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      alert(result.message || "Message sent!");
    } catch (err) {
      alert("Failed to send message.");
      console.error(err);
    }
  })
