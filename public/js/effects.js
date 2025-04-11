document.addEventListener("DOMContentLoaded", function () {
    AOS.init({
        duration: 1000,  
        once: false,      
        mirror: true    
    });
    
    const savedTheme = localStorage.getItem('site-theme') || 'default';
    setTheme(savedTheme);

});

function setTheme(theme) {
  document.body.classList.remove('theme-default', 'theme-light', 'theme-dark');
  document.body.classList.add(`theme-${theme}`);
  localStorage.setItem('site-theme', theme);
}




