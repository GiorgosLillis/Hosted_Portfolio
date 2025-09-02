const cityInput = document.getElementById('city-input');
const countryInput = document.getElementById('country-input');
const searchButton = document.getElementById('search-button');
searchButton.addEventListener('click', toogleSearchInput);

export function toogleSearchInput() {
    const isHiddenCity = cityInput.className.includes('search-input-hidden');
    

    if (isHiddenCity) {
        cityInput.className = cityInput.className.replace('search-input-hidden', 'search-input-visible');
        cityInput.style.display = 'inline-block';
        countryInput.className = countryInput.className.replace('search-input-hidden', 'search-input-visible');
        countryInput.style.display = 'inline-block';
        cityInput.focus();
    } else {
        Search();
        cityInput.className = cityInput.className.replace('search-input-visible', 'search-input-hidden');
        cityInput.style.display = 'none';
        countryInput.className = countryInput.className.replace('search-input-visible', 'search-input-hidden');
        countryInput.style.display = 'none';
    }
    cityInput.addEventListener('keydown', function(event){
        if (event.key === 'Enter') {
            event.preventDefault();
            Search();
            cityInput.className = cityInput.className.replace('search-input-visible', 'search-input-hidden');
            cityInput.style.display = 'none';
            countryInput.className = countryInput.className.replace('search-input-visible', 'search-input-hidden');
            countryInput.style.display = 'none';
        }
    });
    countryInput.addEventListener('keydown', function(event){
        if (event.key === 'Enter') {
            event.preventDefault();
            Search();
            cityInput.className = cityInput.className.replace('search-input-visible', 'search-input-hidden');
            cityInput.style.display = 'none';
            countryInput.className = countryInput.className.replace('search-input-visible', 'search-input-hidden');
            countryInput.style.display = 'none';
        }
    });
}

export function Search(){
    const country = countryInput.value.trim() ? countryInput.value.trim() : '';
    const city = cityInput.value.trim() ? cityInput.value.trim() : '';
    const searchEvent = new CustomEvent('citySearch', { detail: { city, country } });
    document.dispatchEvent(searchEvent);
}
