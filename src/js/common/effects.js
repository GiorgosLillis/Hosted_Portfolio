AOS.init({
  startEvent: 'DOMContentLoaded',
  once: true,
  duration: 1000,
  easing: 'ease-in-out',
  mirror: false,
  anchorPlacement: 'top-bottom'
});


export function setTheme(theme) {
  document.body.classList.remove('theme-default', 'theme-light', 'theme-dark');
  document.body.classList.add(`theme-${theme}`);
  localStorage.setItem('site-theme', theme);
}
window.setTheme = setTheme;

function getSystemPreferredTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'default';
}

const savedTheme = localStorage.getItem('site-theme');
if (savedTheme) {
  setTheme(savedTheme);
} else {
  const systemPreference = getSystemPreferredTheme();
  setTheme(systemPreference);
}


window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (!localStorage.getItem('site-theme')) {
    if (e.matches) {
      setTheme('dark');
    } else {
      setTheme('default');
    }
  }
});

const current_date = document.getElementById('current-date');
const current_time = document.getElementById('current-time');

if (current_date && current_time) {
  let date = new Date();
  let options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  current_date.innerHTML = date.toLocaleDateString('en-GB', options);

  let time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  current_time.innerHTML = time;
  setInterval(() => {
    let date = new Date();
    let time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    current_time.innerHTML = time;
  }, 1000);
}




