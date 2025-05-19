AOS.init({
    startEvent: 'DOMContentLoaded',
    once: true,               
    duration: 1000,
    easing: 'ease-in-out',
    mirror: false,               
    anchorPlacement: 'top-bottom'
});
    
const savedTheme = localStorage.getItem('site-theme') || 'default';
 setTheme(savedTheme);



function setTheme(theme) {
  document.body.classList.remove('theme-default', 'theme-light', 'theme-dark');
  document.body.classList.add(`theme-${theme}`);
  localStorage.setItem('site-theme', theme);
}




