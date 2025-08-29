const cityInput = document.getElementById('city-input');
const searchButton = document.getElementById('search-button');
searchButton.addEventListener('click', toogleSearchInput);

export function toogleSearchInput() {
    cityInput.className = cityInput.className.includes('search-input-hidden') 
        ? cityInput.className.replace('search-input-hidden', 'search-input-visible') 
        : cityInput.className.replace('search-input-visible', 'search-input-hidden');
    cityInput.style.display = cityInput.style.display === 'none' ? 'inline-block' : 'none';
    searchButton.addEventListener('click', Search(cityInput.value));
    cityInput.addEventListener('keypress', function(event){
        if(event.key === 'Enter'){
            Search(cityInput.value);
        }
    })
}

export function Search(city){
    if(city){
        localStorage.setItem('searched-city', city);
        reload();
    }
}

