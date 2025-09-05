const cityInput = document.getElementById('city-input');
const countryInput = document.getElementById('country-input');
const searchButton = document.getElementById('search-button');
const searchSection = document.getElementById('search-section');
const favoriteSection = document.getElementById('favorite-section');
searchButton.addEventListener('click', toogleSearchInput);

export function toogleSearchInput() {
    const isHidden = (searchSection.className.includes('search-section-hidden'));

    if (isHidden) { 
        favoriteSection.className = favoriteSection.className.replace('search-section-visible', 'search-section-hidden');
        searchSection.className = searchSection.className.replace('search-section-hidden', 'search-section-visible');
        cityInput.className = cityInput.className.replace('search-input-hidden', 'search-input-visible');
        countryInput.className = countryInput.className.replace('search-input-hidden', 'search-input-visible');
        cityInput.focus();
    } else {
        Search();
        searchSection.className = searchSection.className.replace('search-section-visible', 'search-section-hidden');
        cityInput.className = cityInput.className.replace('search-input-visible', 'search-input-hidden');
        countryInput .className = countryInput .className.replace('search-input-visible', 'search-input-hidden');
    }
    cityInput.addEventListener('keydown', function(event){
        if (event.key === 'Enter') {
            event.preventDefault();
            Search();
            searchSection.className = searchSection.className.replace('search-section-visible', 'search-section-hidden');
            cityInput.className = cityInput.className.replace('search-input-visible', 'search-input-hidden');
            countryInput .className = countryInput .className.replace('search-input-visible', 'search-input-hidden');
        }
    });
    countryInput.addEventListener('keydown', function(event){
        if (event.key === 'Enter') {
            Search();
            searchSection.className = searchSection.className.replace('search-section-visible', 'search-section-hidden');
            cityInput.className = cityInput.className.replace('search-input-visible', 'search-input-hidden');
            countryInput .className = countryInput.className.replace('search-input-visible', 'search-input-hidden');
        }
    });
}

export function Search(){
    const country = countryInput.value.trim() ? countryInput.value.trim() : '';
    const city = cityInput.value.trim() ? cityInput.value.trim() : '';
    const searchEvent = new CustomEvent('citySearch', { detail: { city, country } });
    document.dispatchEvent(searchEvent);
}
