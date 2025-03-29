document.addEventListener("DOMContentLoaded", function () {
    AOS.init({
        duration: 1000,  // Animation duration (default: 400ms)
        once: true,      // Animation happens every time it scrolls into view
        mirror: true     // Element doesn't animate when scrolling back up
    });
});


